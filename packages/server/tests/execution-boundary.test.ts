import test from 'node:test';
import assert from 'node:assert';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { ExecutionService } from '../src/services/execution-service.ts';
import { AttemptService } from '../src/services/attempt-service.ts';
import { DraftService } from '../src/services/draft-service.ts';

test('Execution Boundary: Run Samples and Custom Input (T022, AC-08)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const executionService = new ExecutionService(db);
  const userId = 'user-student-1';
  const enrollmentId = 'enr-ada';
  const stepId = 'step-6-python-evenodd';

  await t.test('AC-08: Run samples executes only public tests and does NOT modify progress or attempts', async () => {
    // Step 6 has public test cases (4 -> Even, blank -> Empty) and hidden test (-3 -> Odd)
    const code = `
import sys
raw = sys.stdin.read().strip()
if not raw:
    print("Empty")
else:
    n = int(raw)
    print("Even" if n % 2 == 0 else "Odd")
`;

    const { job, result } = await executionService.executeJobSynchronously({
      userId,
      enrollmentId,
      stepId,
      jobType: 'run_samples',
      code,
    });

    assert.strictEqual(job.jobType, 'run_samples');
    assert.strictEqual(result.verdict, 'PASSED');
    // Step 6 has 2 public tests
    assert.strictEqual(result.testResults.length, 2);
    assert.ok(result.testResults.every((r) => !r.isHidden));

    // INVARIANT: assessment_attempts must NOT have any new attempt
    const attemptsCount = db.prepare(`
      SELECT COUNT(*) as count FROM assessment_attempts WHERE enrollment_id = ? AND step_id = ?
    `).get(enrollmentId, stepId) as { count: number };
    assert.strictEqual(attemptsCount.count, 0, 'run_samples must not write to assessment_attempts');

    // INVARIANT: step_progress must NOT be completed
    const progress = db.prepare(`
      SELECT * FROM step_progress WHERE enrollment_id = ? AND step_id = ?
    `).get(enrollmentId, stepId) as any;
    assert.strictEqual(progress, undefined, 'run_samples must not complete step_progress');
  });

  await t.test('Run custom input executes with student stdin without affecting attempts or progress', async () => {
    const code = `
import sys
val = sys.stdin.read().strip()
print(f"CUSTOM:{val}")
`;
    const { job, result } = await executionService.executeJobSynchronously({
      userId,
      enrollmentId,
      stepId,
      jobType: 'run_custom',
      code,
      stdin: 'hello-custom',
    });

    assert.strictEqual(result.verdict, 'PASSED');
    assert.strictEqual(result.testResults[0].actualOutput?.trim(), 'CUSTOM:hello-custom');

    // No attempts or progress written
    const attemptsCount = db.prepare(`
      SELECT COUNT(*) as count FROM assessment_attempts WHERE enrollment_id = ? AND step_id = ?
    `).get(enrollmentId, stepId) as { count: number };
    assert.strictEqual(attemptsCount.count, 0);
  });
});

test('Execution Boundary: Submit, Protected Grading, Redaction & Idempotency (T023, AC-09, AC-10, AC-12)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const executionService = new ExecutionService(db);
  const attemptService = new AttemptService(db);
  const draftService = new DraftService(db);

  const userId = 'user-student-1';
  const enrollmentId = 'enr-ada';
  const stepId = 'step-6-python-evenodd';

  await t.test('AC-09: Idempotent submission with identical request key returns original job', async () => {
    const code = 'print("idempotency check")';
    const idempotencyKey = 'req-key-abc-123';

    const first = executionService.enqueueJob({
      userId,
      enrollmentId,
      stepId,
      jobType: 'submit',
      code,
      idempotencyKey,
    });
    assert.strictEqual(first.isDuplicate, false);

    const second = executionService.enqueueJob({
      userId,
      enrollmentId,
      stepId,
      jobType: 'submit',
      code,
      idempotencyKey,
    });
    assert.strictEqual(second.isDuplicate, true);
    assert.strictEqual(second.job.id, first.job.id);
  });

  await t.test('Passing submission grades all tests, writes attempt, and completes step_progress', async () => {
    const correctCode = `
import sys
raw = sys.stdin.read().strip()
if not raw:
    print("Empty")
else:
    n = int(raw)
    print("Even" if n % 2 == 0 else "Odd")
`;

    const { job, result } = await executionService.executeJobSynchronously({
      userId,
      enrollmentId,
      stepId,
      jobType: 'submit',
      code: correctCode,
    });

    assert.strictEqual(result.verdict, 'PASSED');
    assert.ok(result.attemptId, 'Attempt ID must be assigned on submit');

    // Authoritative attempt record
    const attempt = db.prepare(`SELECT * FROM assessment_attempts WHERE id = ?`).get(result.attemptId) as any;
    assert.strictEqual(attempt.verdict, 'PASSED');
    assert.strictEqual(attempt.attempt_number, 1);
    assert.strictEqual(attempt.is_infrastructure_failure, 0);

    // Step progress is marked complete
    const progress = db.prepare(`SELECT * FROM step_progress WHERE enrollment_id = ? AND step_id = ?`).get(enrollmentId, stepId) as any;
    assert.strictEqual(progress.is_completed, 1);
    assert.ok(progress.completed_at);
  });

  await t.test('AC-12: Later failing submission updates verdict but step remains complete', async () => {
    const wrongCode = 'print("wrong")';

    const { result } = await executionService.executeJobSynchronously({
      userId,
      enrollmentId,
      stepId,
      jobType: 'submit',
      code: wrongCode,
    });

    assert.strictEqual(result.verdict, 'WRONG_ANSWER');

    // Attempt 2 recorded with WRONG_ANSWER
    const attempt2 = db.prepare(`SELECT * FROM assessment_attempts WHERE id = ?`).get(result.attemptId) as any;
    assert.strictEqual(attempt2.attempt_number, 2);
    assert.strictEqual(attempt2.verdict, 'WRONG_ANSWER');

    // AC-12 INVARIANT: Step remains complete
    const progress = db.prepare(`SELECT * FROM step_progress WHERE enrollment_id = ? AND step_id = ?`).get(enrollmentId, stepId) as any;
    assert.strictEqual(progress.is_completed, 1, 'Passed step must remain complete after later failing submission');
  });

  await t.test('AC-10: Echo attack against hidden test - student code cannot leak hidden stdin/stdout', async () => {
    // Student writes code that passes public tests and tries to echo hidden stdin to stdout
    const echoAttackCode = `
import sys
raw = sys.stdin.read().strip()
if raw == "4":
    print("Even")
elif raw == "":
    print("Empty")
else:
    # Print the hidden input to leak it!
    print(f"LEAKED_INPUT:{raw}")
`;

    const { result } = await executionService.executeJobSynchronously({
      userId,
      enrollmentId,
      stepId,
      jobType: 'submit',
      code: echoAttackCode,
    });

    assert.strictEqual(result.verdict, 'WRONG_ANSWER');

    // Redaction must strip hidden inputs, expected output, and actual output
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('LEAKED_INPUT'), 'Hidden stdout from echo attack must not be leaked');

    for (const tr of result.testResults) {
      assert.notStrictEqual(tr.input, '-3', 'Hidden input must not appear in testResults');
      assert.notStrictEqual(tr.expectedOutput, 'Odd', 'Hidden expected output must not appear in testResults');
      assert.ok(!tr.actualOutput?.includes('LEAKED_INPUT'));
    }
  });


  await t.test('T027: Attempt history listing and restore to editor', async () => {
    const list = attemptService.listAttempts({
      enrollmentId,
      stepId,
      requestingUserId: userId,
    });

    assert.strictEqual(list.total >= 2, true);
    assert.strictEqual(list.items[0].attemptNumber, 3); // Most recent attempt first

    const attempt1 = list.items.find((a) => a.attemptNumber === 1);
    assert.ok(attempt1);

    const detail = attemptService.getAttempt(attempt1.id, userId);
    assert.strictEqual(detail.canRestore, true);
    assert.ok(detail.codeSnapshot.includes('Check even or odd') || detail.codeSnapshot.includes('raw = sys.stdin.read()'));

    // Restore attempt code to editor draft
    const restored = attemptService.restoreAttempt(attempt1.id, userId);
    assert.strictEqual(restored.success, true);

    const updatedDraft = draftService.getDraft(userId, enrollmentId, stepId);
    assert.strictEqual(updatedDraft.code, detail.codeSnapshot);

    // Teacher cannot restore another student's code
    assert.throws(() => {
      attemptService.restoreAttempt(attempt1.id, 'user-author-1');
    }, /Cannot restore code from another user/);
  });
});

test('Execution Boundary: Lease Recovery and Reliability (T021, AC-13)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const executionService = new ExecutionService(db);
  const userId = 'user-student-1';
  const enrollmentId = 'enr-ada';
  const stepId = 'step-6-python-evenodd';

  await t.test('Stuck running job with expired lease is safely recovered to queued status', () => {
    // Insert a running job with expired lease (lease expired 1 minute ago)
    const expiredLease = new Date(Date.now() - 60000).toISOString();
    db.prepare(`
      INSERT INTO execution_jobs (id, user_id, enrollment_id, step_id, job_type, code, status, lease_expires_at, worker_id, created_at, updated_at)
      VALUES ('job-crashed-worker', ?, ?, ?, 'submit', 'print(1)', 'running', ?, 'worker-dead-123', datetime('now'), datetime('now'))
    `).run(userId, enrollmentId, stepId, expiredLease);

    const recoveredCount = executionService.recoverStuckJobs();
    assert.strictEqual(recoveredCount, 1);

    const job = db.prepare('SELECT * FROM execution_jobs WHERE id = ?').get('job-crashed-worker') as any;
    assert.strictEqual(job.status, 'queued');
    assert.strictEqual(job.worker_id, null);
    assert.strictEqual(job.lease_expires_at, null);
  });
});

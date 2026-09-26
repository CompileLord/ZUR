import test from 'node:test';
import assert from 'node:assert';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { DraftService, DraftConflictError } from '../src/services/draft-service.ts';
import { QuotaService } from '../src/services/quota-service.ts';
import { ExecutionService } from '../src/services/execution-service.ts';
import { RateLimitError, ServiceUnavailableError } from 'zur-shared';

test('Code Draft Persistence and Recovery (T025, AC-11)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const draftService = new DraftService(db);
  const userId = 'user-student-1';
  const enrollmentId = 'enr-ada';
  const stepId = 'step-6-python-evenodd';

  await t.test('Retrieves initial starter code when no draft exists', () => {
    const draft = draftService.getDraft(userId, enrollmentId, stepId);
    assert.strictEqual(draft.isStarter, true);
    assert.strictEqual(draft.revision, 0);
    assert.ok(draft.code.includes('Check even or odd'));
  });

  await t.test('Saves initial draft and increments revision to 1', () => {
    const code = 'print("first edit")';
    const saved = draftService.saveDraft(userId, enrollmentId, stepId, code, 0);
    assert.strictEqual(saved.revision, 1);
    assert.strictEqual(saved.code, code);
    assert.strictEqual(saved.isStarter, false);

    const fetched = draftService.getDraft(userId, enrollmentId, stepId);
    assert.strictEqual(fetched.revision, 1);
    assert.strictEqual(fetched.code, code);
  });

  await t.test('Subsequent save with matching revision succeeds and increments to 2', () => {
    const code2 = 'print("second edit")';
    const saved2 = draftService.saveDraft(userId, enrollmentId, stepId, code2, 1);
    assert.strictEqual(saved2.revision, 2);
    assert.strictEqual(saved2.code, code2);
  });

  await t.test('Rejects stale revision with DraftConflictError (409 Conflict)', () => {
    // Current revision on server is 2. Client sends baseRevision: 1 (e.g. another tab edited it)
    assert.throws(() => {
      draftService.saveDraft(userId, enrollmentId, stepId, 'stale client code', 1);
    }, (err: any) => {
      assert.ok(err instanceof DraftConflictError);
      assert.strictEqual(err.statusCode, 409);
      assert.strictEqual(err.currentRevision, 2);
      assert.strictEqual(err.serverCode, 'print("second edit")');
      return true;
    });
  });

  await t.test('Reset draft restores starter code and increments revision', () => {
    const reset = draftService.resetDraft(userId, enrollmentId, stepId);
    assert.strictEqual(reset.revision, 3);
    assert.strictEqual(reset.isStarter, true);
    assert.ok(reset.code.includes('Check even or odd'));
  });
});

test('Quotas, Overload Controls & Operator Kill Switch (T024)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const quotaService = new QuotaService(db);
  const executionService = new ExecutionService(db);
  const draftService = new DraftService(db);

  const userId = 'user-student-2';
  const enrollmentId = 'enr-grace';
  const stepId = 'step-6-python-evenodd';

  await t.test('Enforces Run rate limit (10 runs / minute)', () => {
    const now = new Date().toISOString();
    // Record 10 runs
    for (let i = 0; i < 10; i++) {
      db.prepare(`
        INSERT INTO execution_jobs (id, user_id, enrollment_id, step_id, job_type, code, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'run_samples', 'code', 'completed', ?, ?)
      `).run(`job-run-${i}`, userId, enrollmentId, stepId, now, now);
    }

    // 11th run must be rejected
    assert.throws(() => {
      quotaService.checkCanEnqueue(userId, 'run_samples');
    }, (err: any) => {
      assert.ok(err instanceof RateLimitError);
      assert.strictEqual(err.statusCode, 429);
      return true;
    });
  });

  await t.test('Enforces Submit rate limit (5 submissions / minute)', () => {
    const submitUser = 'user-student-3';
    const submitEnrollment = 'enr-alan';
    const now = new Date().toISOString();
    // Record 5 submits
    for (let i = 0; i < 5; i++) {
      db.prepare(`
        INSERT INTO execution_jobs (id, user_id, enrollment_id, step_id, job_type, code, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'submit', 'code', 'completed', ?, ?)
      `).run(`job-sub-${i}`, submitUser, submitEnrollment, stepId, now, now);
    }

    // 6th submit must be rejected
    assert.throws(() => {
      quotaService.checkCanEnqueue(submitUser, 'submit');
    }, (err: any) => {
      assert.ok(err instanceof RateLimitError);
      assert.strictEqual(err.statusCode, 429);
      return true;
    });
  });

  await t.test('Enforces active jobs limit (max 2 active jobs per user)', () => {
    const activeUser = 'user-student-1';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO execution_jobs (id, user_id, step_id, job_type, code, status, created_at, updated_at)
      VALUES ('active-1', ?, ?, 'run_samples', 'code', 'queued', ?, ?),
             ('active-2', ?, ?, 'run_samples', 'code', 'running', ?, ?)
    `).run(activeUser, stepId, now, now, activeUser, stepId, now, now);

    assert.throws(() => {
      quotaService.checkCanEnqueue(activeUser, 'run_samples');
    }, (err: any) => {
      assert.ok(err instanceof RateLimitError);
      assert.ok(err.message.includes('Active execution limit reached'));
      return true;
    });

    // Clean up active jobs so subsequent tests are not blocked
    db.prepare(`DELETE FROM execution_jobs WHERE id IN ('active-1', 'active-2')`).run();
  });

  await t.test('Operator kill switch pauses new executions with 503 but keeps drafts functional', () => {
    const studentUser = 'user-student-1';
    const studentEnrollment = 'enr-ada';


    // Pause execution
    quotaService.setExecutionPaused(true);
    assert.strictEqual(quotaService.isExecutionPaused(), true);

    // New run/submit must fail with 503 ServiceUnavailableError
    assert.throws(() => {
      executionService.enqueueJob({
        userId: studentUser,
        enrollmentId: studentEnrollment,
        stepId,
        jobType: 'run_samples',
        code: 'print(1)',
      });
    }, (err: any) => {
      assert.ok(err instanceof ServiceUnavailableError);
      assert.strictEqual(err.statusCode, 503);
      return true;
    });
    assert.throws(() => executionService.enqueueJob({
      userId: studentUser,
      enrollmentId: studentEnrollment,
      stepId,
      jobType: 'author_validation',
      code: 'print(1)',
    }), (err: any) => err instanceof ServiceUnavailableError && err.statusCode === 503);

    // Saving and loading drafts MUST STILL WORK
    const saved = draftService.saveDraft(studentUser, studentEnrollment, stepId, 'x = 42', 3);
    assert.strictEqual(saved.code, 'x = 42');
    const loaded = draftService.getDraft(studentUser, studentEnrollment, stepId);
    assert.strictEqual(loaded.code, 'x = 42');

    // Resume execution
    quotaService.setExecutionPaused(false);
    assert.strictEqual(quotaService.isExecutionPaused(), false);

    // Now execution can be enqueued again
    const enqueued = executionService.enqueueJob({
      userId: studentUser,
      enrollmentId: studentEnrollment,
      stepId,
      jobType: 'run_samples',
      code: 'print(1)',
    });
    assert.strictEqual(enqueued.job.status, 'queued');
  });

});

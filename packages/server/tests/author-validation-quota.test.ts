import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { AuthorValidationQuota } from '../src/services/author-validation-quota.ts';

import { ExecutionService } from '../src/services/execution-service.ts';
import { redactExecutionResultForStudent, redactFullExecutionResultForStudent } from '../src/services/redaction-service.ts';
import { RateLimitError, NotFoundError } from 'zur-shared';

test('Author validation quota is shared across requests and active operations', () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const quota = new AuthorValidationQuota(db);
  const release1 = quota.acquire('user-author-1');
  const release2 = quota.acquire('user-author-1');
  assert.throws(() => quota.acquire('user-author-1'));
  release1(); release2();
  for (let index = 0; index < 28; index++) quota.acquire('user-author-1')();
  assert.throws(() => quota.acquire('user-author-1'));
  assert.doesNotThrow(() => quota.acquire('user-admin-1')());
});

test('ExecutionService enforces AuthorValidationQuota on author_validation jobs (T024)', () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const service = new ExecutionService(db);

  // Author validation does not require enrollmentId
  const job1 = service.enqueueJob({
    userId: 'user-author-1',
    stepId: 'step-6-python-evenodd',
    jobType: 'author_validation',
    code: 'print("validate 1")',
  }).job;
  assert.ok(job1.id);
  assert.strictEqual(job1.jobType, 'author_validation');

  const job2 = service.enqueueJob({
    userId: 'user-author-1',
    stepId: 'step-6-python-evenodd',
    jobType: 'author_validation',
    code: 'print("validate 2")',
  }).job;
  assert.ok(job2.id);

  // Third concurrent active job throws RateLimitError
  assert.throws(() => {
    service.enqueueJob({
      userId: 'user-author-1',
      stepId: 'step-6-python-evenodd',
      jobType: 'author_validation',
      code: 'print("validate 3")',
    });
  }, (err: any) => err instanceof RateLimitError);

  // Author can fetch their own author_validation job via getJob
  const fetched = service.getJob(job1.id, 'user-author-1');
  assert.strictEqual(fetched.job.id, job1.id);
  assert.strictEqual(fetched.job.jobType, 'author_validation');

  // Another user cannot access the author_validation job
  assert.throws(() => {
    service.getJob(job1.id, 'user-student-1');
  }, (err: any) => err instanceof NotFoundError);
});

test('RedactionService safe guidance for hidden tests and infrastructure failures (PRD §12.5, AC-10)', () => {
  // Test 1: Student execution result with hidden failure
  const studentResult = redactExecutionResultForStudent({
    attemptId: 'att-1',
    verdict: 'WRONG_ANSWER',
    isInfrastructureFailure: false,
    failedTestIsHidden: true,
    publicTestsResults: [
      { position: 0, passed: true, input: '1', expectedOutput: 'Odd', actualOutput: 'Odd' },
      { position: 1, passed: false, input: 'SECRET_HIDDEN', expectedOutput: 'SECRET', actualOutput: 'FAIL' },
    ],
  });

  assert.strictEqual(studentResult.verdict, 'WRONG_ANSWER');
  assert.strictEqual(studentResult.isInfrastructureFailure, false);
  assert.strictEqual(studentResult.guidance, 'Your solution did not pass a hidden test. Review the input limits and edge cases.');
  // Stripped failing/hidden tests, kept only passed public samples
  assert.strictEqual(studentResult.publicTestsResults?.length, 1);
  assert.strictEqual(studentResult.publicTestsResults[0].input, '1');

  // Test 2: Infrastructure failure on hidden test gives infrastructure guidance, not wrong answer guidance
  const infraResult = redactExecutionResultForStudent({
    attemptId: 'att-infra',
    verdict: 'INTERNAL_ERROR',
    isInfrastructureFailure: true,
    failedTestIsHidden: true,
    publicTestsResults: [],
  });

  assert.strictEqual(infraResult.verdict, 'INTERNAL_ERROR');
  assert.strictEqual(infraResult.isInfrastructureFailure, true);
  assert.strictEqual(infraResult.guidance, 'An infrastructure error occurred during execution. Please try again.');

  // Test 3: Full execution result with hidden test failure
  const fullResult = redactFullExecutionResultForStudent({
    jobId: 'job-1',
    attemptId: 'att-full',
    verdict: 'WRONG_ANSWER',
    isInfrastructureFailure: false,
    executionTimeMs: 150,
    testResults: [
      { position: 0, passed: true, verdict: 'PASSED', input: '2', expectedOutput: 'Even', actualOutput: 'Even', isHidden: false },
      { position: 1, passed: false, verdict: 'WRONG_ANSWER', input: 'SECRET_STDIN', expectedOutput: 'SECRET_STDOUT', actualOutput: 'ECHO_SECRET', stderr: 'stack trace', errorMessage: 'failed', isHidden: true, executionTimeMs: 12 },
    ],
  });

  assert.strictEqual(fullResult.verdict, 'WRONG_ANSWER');
  assert.strictEqual(fullResult.guidance, 'Your solution did not pass a hidden test. Review the input limits and edge cases.');
  assert.strictEqual(fullResult.testResults.length, 1);
  assert.strictEqual(fullResult.testResults[0].passed, true);
  assert.strictEqual(fullResult.testResults[0].input, '2');
  // No hidden test fields leaked
  assert.strictEqual(JSON.stringify(fullResult).includes('SECRET'), false);
  assert.strictEqual(JSON.stringify(fullResult).includes('stack trace'), false);

  // Test 4: Full execution result with infrastructure failure on hidden test
  const fullInfraResult = redactFullExecutionResultForStudent({
    jobId: 'job-2',
    attemptId: 'att-full-infra',
    verdict: 'INTERNAL_ERROR',
    isInfrastructureFailure: true,
    executionTimeMs: 50,
    testResults: [
      { position: 0, passed: false, verdict: 'INTERNAL_ERROR', isHidden: true, input: 'hidden-input', expectedOutput: 'hidden-out' },
    ],
  });

  assert.strictEqual(fullInfraResult.verdict, 'INTERNAL_ERROR');
  assert.strictEqual(fullInfraResult.isInfrastructureFailure, true);
  assert.strictEqual(fullInfraResult.guidance, 'An infrastructure error occurred during execution. Please try again.');
  assert.strictEqual(fullInfraResult.testResults.length, 0);
  assert.strictEqual(JSON.stringify(fullInfraResult).includes('hidden'), false);
});

test('Author validation quota accurately tracks per-job admissions: completion of 1 job does not release concurrent job', () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const service = new ExecutionService(db);
  const quota = new AuthorValidationQuota(db);

  // 1. Enqueue Job A and Job B concurrently
  const jobA = service.enqueueJob({
    userId: 'user-author-1',
    stepId: 'step-6-python-evenodd',
    jobType: 'author_validation',
    code: 'print("job A")',
  }).job;

  const jobB = service.enqueueJob({
    userId: 'user-author-1',
    stepId: 'step-6-python-evenodd',
    jobType: 'author_validation',
    code: 'print("job B")',
  }).job;

  // Active count is 2: Job C cannot enter
  assert.strictEqual(quota.getActiveCount('user-author-1'), 2);
  assert.throws(() => {
    service.enqueueJob({
      userId: 'user-author-1',
      stepId: 'step-6-python-evenodd',
      jobType: 'author_validation',
      code: 'print("job C")',
    });
  }, (err: any) => err instanceof RateLimitError);

  // 2. Claim and Complete Job A
  const claimedA = service.claimJobById(jobA.id, 'worker-A');
  assert.ok(claimedA);
  service.completeJob(jobA.id, 'worker-A', {
    jobId: jobA.id,
    verdict: 'PASSED',
    isInfrastructureFailure: false,
    executionTimeMs: 10,
    testResults: [],
    completedAt: new Date().toISOString(),
  });

  // CRUCIAL INVARIANT: Job A is completed, but Job B is still active!
  // Active count MUST be 1, NOT 0!
  assert.strictEqual(quota.getActiveCount('user-author-1'), 1);

  // 3. Now Job C can enter because active count was 1 (now 2)
  const jobC = service.enqueueJob({
    userId: 'user-author-1',
    stepId: 'step-6-python-evenodd',
    jobType: 'author_validation',
    code: 'print("job C")',
  }).job;
  assert.ok(jobC.id);
  assert.strictEqual(quota.getActiveCount('user-author-1'), 2);

  // 4. Job D CANNOT enter because Job B and Job C are both active!
  assert.throws(() => {
    service.enqueueJob({
      userId: 'user-author-1',
      stepId: 'step-6-python-evenodd',
      jobType: 'author_validation',
      code: 'print("job D")',
    });
  }, (err: any) => err instanceof RateLimitError);

  // 5. Terminal failure of Job B also releases its admission specifically
  const claimedB = service.claimJobById(jobB.id, 'worker-B');
  assert.ok(claimedB);
  service.failJob(jobB.id, 'worker-B', {
    verdict: 'INTERNAL_ERROR',
    isInfrastructureFailure: true,
    message: 'Worker crashed',
  });

  // Active count is now 1 (only Job C is active)
  assert.strictEqual(quota.getActiveCount('user-author-1'), 1);

  // 6. Now Job D can enter
  const jobD = service.enqueueJob({
    userId: 'user-author-1',
    stepId: 'step-6-python-evenodd',
    jobType: 'author_validation',
    code: 'print("job D")',
  }).job;
  assert.ok(jobD.id);
  assert.strictEqual(quota.getActiveCount('user-author-1'), 2);

  // 7. Stuck job recovery also releases admission on terminal timeout
  const claimedC = service.claimJobById(jobC.id, 'worker-C');
  assert.ok(claimedC);
  // Set retry_count to 2 and expire lease to simulate dead worker
  const past = new Date(Date.now() - 60_000).toISOString();
  db.prepare("UPDATE execution_jobs SET retry_count=2, lease_expires_at=? WHERE id=?")
    .run(past, jobC.id);
  const recoveredCount = service.recoverStuckJobs();
  assert.strictEqual(recoveredCount, 1);

  // Job C was terminated by recovery, so active count drops to 1 (only Job D is active)
  assert.strictEqual(quota.getActiveCount('user-author-1'), 1);
});

test('Author validation quota retains old still-active jobs across 1-minute purge and 5-minute expiry', () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const service = new ExecutionService(db);
  const quota = new AuthorValidationQuota(db);

  // 1. Enqueue two author validation jobs
  const job1 = service.enqueueJob({
    userId: 'user-author-1',
    stepId: 'step-6-python-evenodd',
    jobType: 'author_validation',
    code: 'print("job 1")',
  }).job;

  const job2 = service.enqueueJob({
    userId: 'user-author-1',
    stepId: 'step-6-python-evenodd',
    jobType: 'author_validation',
    code: 'print("job 2")',
  }).job;

  assert.strictEqual(quota.getActiveCount('user-author-1'), 2);

  // 2. Simulate aging: both jobs have been queued for 10 minutes (> 1 min cutoff and > 5 min expiry)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const pastExpires = new Date(Date.now() - 5 * 60_000).toISOString();

  db.prepare(`
    UPDATE author_validation_admissions
    SET started_at = ?, expires_at = ?
    WHERE author_id = 'user-author-1'
  `).run(tenMinutesAgo, pastExpires);

  db.prepare(`
    UPDATE execution_jobs
    SET created_at = ?, updated_at = ?
    WHERE user_id = 'user-author-1' AND job_type = 'author_validation'
  `).run(tenMinutesAgo, tenMinutesAgo);

  // Active count MUST remain 2 because jobs are still queued and uncompleted
  assert.strictEqual(quota.getActiveCount('user-author-1'), 2);

  // 3. Attempting to enqueue a third job MUST be denied (neither 1-min purge nor 5-min expiry reopened slots)
  assert.throws(() => {
    service.enqueueJob({
      userId: 'user-author-1',
      stepId: 'step-6-python-evenodd',
      jobType: 'author_validation',
      code: 'print("job 3")',
    });
  }, (err: any) => err instanceof RateLimitError);

  // 4. Standalone admissions expire if a process crashes before releasing them.
  const release1 = quota.acquire('user-admin-1');
  const release2 = quota.acquire('user-admin-1');
  assert.strictEqual(quota.getActiveCount('user-admin-1'), 2);

  db.prepare(`
    UPDATE author_validation_admissions
    SET started_at = ?, expires_at = ?
    WHERE author_id = 'user-admin-1'
  `).run(tenMinutesAgo, pastExpires);

  assert.strictEqual(quota.getActiveCount('user-admin-1'), 0);
  const release3 = quota.acquire('user-admin-1');
  assert.strictEqual(quota.getActiveCount('user-admin-1'), 1);
  const remaining = db.prepare('SELECT COUNT(*) AS count FROM author_validation_admissions WHERE author_id=? AND completed_at IS NULL')
    .get('user-admin-1') as { count: number };
  assert.strictEqual(remaining.count, 1, 'expired standalone admissions are purged');
  // Late release callbacks cannot affect a newer admission.
  release1();
  assert.strictEqual(quota.getActiveCount('user-admin-1'), 1);
  const release4 = quota.acquire('user-admin-1');
  assert.strictEqual(quota.getActiveCount('user-admin-1'), 2);
  assert.throws(() => quota.acquire('user-admin-1'), (err: any) => err instanceof RateLimitError);
  release2();
  release3();
  release4();
});

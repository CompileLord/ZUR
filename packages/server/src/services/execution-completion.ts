import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ExecutionResult } from 'zur-shared';
import { AuthorValidationQuota } from './author-validation-quota.ts';

export function completeJobInTransaction(db: DatabaseSync, jobId: string, workerId: string, result: ExecutionResult, now: string): void {
  const jobRow = db.prepare(`SELECT id, user_id, enrollment_id, step_id, job_type, code,
    course_version_id, deadline_at FROM execution_jobs
    WHERE id=? AND status='running' AND worker_id=?
      AND lease_expires_at>=?`).get(jobId, workerId, now) as any;
  if (!jobRow) return;
  const studentTestTimedOut = result.verdict === 'TIME_LIMIT' && !result.isInfrastructureFailure &&
    result.testResults.some((test) => test.verdict === 'TIME_LIMIT');
  if (jobRow.deadline_at && jobRow.deadline_at < now && !studentTestTimedOut) {
    result = { jobId, verdict: 'INTERNAL_ERROR', isInfrastructureFailure: true,
      executionTimeMs: 0, testResults: [],
      guidance: 'Execution could not complete before its job deadline. Please retry.', completedAt: now };
  }
  let attemptId: string | null = null;
  const access = jobRow.enrollment_id ? db.prepare(`SELECT e.status, e.pinned_version_id,
    c.is_suspended, u.account_status FROM enrollments e
    JOIN courses c ON c.id=e.course_id JOIN users u ON u.id=e.user_id WHERE e.id=? AND e.user_id=?`)
    .get(jobRow.enrollment_id, jobRow.user_id) as any : null;
  const accessLost = Boolean(jobRow.enrollment_id && (!access || access.status !== 'active' || access.is_suspended ||
      access.account_status !== 'active'));
  if (accessLost) {
    result = { jobId, verdict: 'INTERNAL_ERROR', isInfrastructureFailure: true,
      executionTimeMs: 0, testResults: [], guidance: 'Access changed before this result was recorded.', completedAt: now };
  }
  if (jobRow.job_type === 'submit' && jobRow.enrollment_id && access && !accessLost) {
    const count = db.prepare(`SELECT COUNT(*) count FROM assessment_attempts
      WHERE enrollment_id=? AND step_id=?`).get(jobRow.enrollment_id, jobRow.step_id) as { count: number };
    attemptId = `attempt-${crypto.randomUUID()}`;
    db.prepare(`INSERT INTO assessment_attempts (id,user_id,enrollment_id,step_id,
      course_version_id,attempt_number,type,verdict,code_snapshot,execution_time_ms,
      is_infrastructure_failure,created_at)
      VALUES (?,?,?,?,?,?,'python',?,?,?,?,?)`).run(attemptId, jobRow.user_id, jobRow.enrollment_id,
      jobRow.step_id, jobRow.course_version_id || access.pinned_version_id, count.count+1,
      result.verdict, jobRow.code, result.executionTimeMs, result.isInfrastructureFailure ? 1 : 0, now);
    result.attemptId = attemptId;
    if (result.verdict === 'PASSED') {
      db.prepare(`INSERT INTO step_progress (id,user_id,enrollment_id,step_id,is_completed,
        completed_at,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?)
        ON CONFLICT(enrollment_id,step_id) DO UPDATE SET is_completed=1,
        completed_at=COALESCE(step_progress.completed_at,excluded.completed_at),updated_at=excluded.updated_at`)
        .run(`progress-${crypto.randomUUID()}`, jobRow.user_id, jobRow.enrollment_id,
          jobRow.step_id, now, now, now);
    }
  }
  if (jobRow.job_type === 'author_validation') {
    new AuthorValidationQuota(db).complete(jobRow.id, now);
  }
  db.prepare(`UPDATE execution_jobs SET status='completed', result_payload=?, attempt_id=?,
    lease_expires_at=NULL, updated_at=? WHERE id=? AND status='running' AND worker_id=?`)
    .run(JSON.stringify(result), attemptId, now, jobId, workerId);
}

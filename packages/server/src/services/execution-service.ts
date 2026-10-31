import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  validatePythonSource,
  validateTestCaseInputOutput,
  type ExecutionResult,
  type TerminalVerdict,
  type ExecutionJob,
} from 'zur-shared';
import { QuotaService } from './quota-service.ts';
import { AuthorValidationQuota } from './author-validation-quota.ts';
import { getPinnedAssessment, getTestCasesForJob } from './execution-test-cases.ts';
import { completeJobInTransaction } from './execution-completion.ts';
import { redactFullExecutionResultForStudent } from './redaction-service.ts';
import { processExecutionJob, type ExecutionJobPayload } from 'zur-worker';

export interface EnqueueJobParams {
  userId: string;
  enrollmentId?: string | null;
  stepId: string;
  jobType: 'run_samples' | 'run_custom' | 'submit' | 'author_validation';
  code: string;
  stdin?: string | null;
  idempotencyKey?: string | null;
}

export class ExecutionService {
  private db: DatabaseSync;
  private quotaService: QuotaService;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.quotaService = new QuotaService(db);
  }


  getQuotaService(): QuotaService {
    return this.quotaService;
  }

  enqueueJob(params: EnqueueJobParams): { job: ExecutionJob; isDuplicate: boolean } {
    const { userId, enrollmentId, stepId, jobType, code, stdin, idempotencyKey } = params;
    const pinnedAssessment = jobType === 'author_validation'
      ? null
      : getPinnedAssessment(this.db, userId, enrollmentId, stepId);

    if (jobType === 'run_custom') {
      const inputCheck = validateTestCaseInputOutput(stdin ?? '', '');
      if (!inputCheck.valid) throw new ValidationError(inputCheck.error || 'Invalid custom input.');
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {

    // Idempotency check: if request with this idempotency key already exists for this user, return it
    if (idempotencyKey) {
      const existing = this.db.prepare(`
        SELECT id, user_id, enrollment_id, step_id, job_type, code, stdin, idempotency_key,
               status, lease_expires_at, created_at, updated_at
        FROM execution_jobs
        WHERE user_id = ? AND idempotency_key = ?
      `).get(userId, idempotencyKey) as any;

      if (existing) {
        if (existing.enrollment_id !== (enrollmentId || null) || existing.step_id !== stepId ||
            existing.job_type !== jobType || existing.code !== code || existing.stdin !== (stdin || null)) {
          throw new ConflictError('This request key was already used for a different execution.');
        }
        this.db.exec('COMMIT');
        return {
          job: {
            id: existing.id,
            userId: existing.user_id,
            enrollmentId: existing.enrollment_id,
            stepId: existing.step_id,
            jobType: existing.job_type,
            code: existing.code,
            stdin: existing.stdin,
            idempotencyKey: existing.idempotency_key,
            status: existing.status,
            leaseExpiresAt: existing.lease_expires_at,
            createdAt: existing.created_at,
            updatedAt: existing.updated_at,
          },
          isDuplicate: true,
        };
      }
    }

    const jobId = `job-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Enforce quotas, rate limits, active jobs limit, and operator kill switch
    this.quotaService.assertExecutionAvailable();
    if (jobType !== 'author_validation') {
      this.quotaService.checkCanEnqueue(userId, jobType);
    } else {
      new AuthorValidationQuota(this.db).acquire(userId, true, jobId);
    }
    const queueCount = this.db.prepare("SELECT COUNT(*) count FROM execution_jobs WHERE status IN ('queued','running')")
      .get() as { count: number };
    if (queueCount.count >= 200) throw new RateLimitError('Execution queue is full. Retry shortly.', 5);

    const validation = validatePythonSource(code);
    if (!validation.valid) {
      throw new ValidationError(validation.error || 'Invalid Python source code');
    }

    this.db.prepare(`
      INSERT INTO execution_jobs (
        id, user_id, enrollment_id, step_id, job_type, code, stdin,
        idempotency_key, status, course_version_id, assessment_snapshot, deadline_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)
    `).run(
      jobId,
      userId,
      enrollmentId || null,
      stepId,
      jobType,
      code,
      stdin || null,
      idempotencyKey || null,
      pinnedAssessment?.versionId || null,
      pinnedAssessment ? JSON.stringify(pinnedAssessment.testCases) : null,
      null,
      now,
      now
    );

    const job: ExecutionJob = {
      id: jobId,
      userId,
      enrollmentId: enrollmentId || null,
      stepId,
      jobType,
      code,
      stdin: stdin || null,
      idempotencyKey: idempotencyKey || null,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    };

    this.db.exec('COMMIT');
    return { job, isDuplicate: false };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  getJob(jobId: string, requestingUserId: string): { job: ExecutionJob; result?: ExecutionResult | null } {
    const row = this.db.prepare(`
      SELECT j.id, j.user_id, j.enrollment_id, j.step_id, j.job_type, j.code, j.stdin, j.idempotency_key,
             j.status, j.lease_expires_at, j.result_payload, j.attempt_id, j.created_at, j.updated_at,
             e.course_id, e.status enrollment_status, c.owner_id course_owner_id, c.is_suspended
      FROM execution_jobs j
      LEFT JOIN enrollments e ON e.id = j.enrollment_id
      LEFT JOIN courses c ON c.id = e.course_id
      WHERE j.id = ?
    `).get(jobId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    if (row.job_type === 'author_validation') {
      if (row.user_id !== requestingUserId) {
        throw new NotFoundError("This page isn't available.");
      }
    } else {
      // Keep learner code and execution output private to the learner and course owner.
      if (row.user_id === requestingUserId && (row.enrollment_status !== 'active' || row.is_suspended)) {
        throw new NotFoundError("This page isn't available.");
      }
      if (row.user_id !== requestingUserId) {
        if (row.course_owner_id !== requestingUserId) {
          throw new NotFoundError("This page isn't available.");
        }
      }
    }

    const job: ExecutionJob = {
      id: row.id,
      userId: row.user_id,
      enrollmentId: row.enrollment_id,
      stepId: row.step_id,
      jobType: row.job_type,
      code: row.code,
      stdin: row.stdin,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      leaseExpiresAt: row.lease_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    let result: ExecutionResult | null = null;
    if (row.result_payload) {
      try {
        const rawResult = JSON.parse(row.result_payload);
        if (job.jobType === 'submit') {
          result = redactFullExecutionResultForStudent(rawResult) as ExecutionResult;
        } else {
          result = rawResult;
        }
      } catch {
        result = null;
      }
    }

    return { job, result };
  }

  claimNextJob(workerId: string, leaseDurationMs: number = 30000): ExecutionJobPayload | null {
    this.recoverStuckJobs();
    const now = new Date().toISOString();
    const leaseExpires = new Date(Date.now() + leaseDurationMs).toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const candidate = this.db.prepare(`
        SELECT id, user_id, enrollment_id, step_id, job_type, code, stdin, course_version_id, assessment_snapshot, deadline_at
        FROM execution_jobs queued WHERE status = 'queued'
        ORDER BY COALESCE((SELECT MAX(updated_at) FROM execution_jobs served
          WHERE served.user_id=queued.user_id AND served.status='completed'), '') ASC,
          queued.created_at ASC LIMIT 1
      `).get() as any;
      if (!candidate) { this.db.exec('COMMIT'); return null; }
      const deadlineAt = candidate.deadline_at || new Date(Date.now() + 60_000).toISOString();
      this.db.prepare(`UPDATE execution_jobs SET status='running', worker_id=?, lease_expires_at=?,
        deadline_at=?, updated_at=? WHERE id=? AND status='queued'`).run(workerId, leaseExpires, deadlineAt, now, candidate.id);
      const testCases = getTestCasesForJob(this.db, candidate);
      this.db.exec('COMMIT');
      return { jobId: candidate.id, userId: candidate.user_id, enrollmentId: candidate.enrollment_id,
        stepId: candidate.step_id, jobType: candidate.job_type, code: candidate.code,
        stdin: candidate.stdin, testCases, deadlineAt };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  renewLease(jobId: string, workerId: string, leaseDurationMs: number = 30000): boolean {
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + leaseDurationMs).toISOString();
    const result = this.db.prepare(`UPDATE execution_jobs SET lease_expires_at=?,updated_at=?
      WHERE id=? AND status='running' AND worker_id=? AND lease_expires_at>=?`)
      .run(expires, now, jobId, workerId, now);
    return result.changes === 1;
  }

  purgeExpiredRunJobs(now: Date = new Date()): number {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare(`DELETE FROM execution_jobs
      WHERE job_type IN ('run_samples','run_custom') AND status='completed' AND created_at<?`)
      .run(cutoff);
    return Number(result.changes);
  }

  completeJob(jobId: string, workerId: string, result: ExecutionResult): void {
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.completeJobInTransaction(jobId, workerId, result, now);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  private completeJobInTransaction(jobId: string, workerId: string, result: ExecutionResult, now: string): void {
    completeJobInTransaction(this.db, jobId, workerId, result, now);
  }

  failJob(jobId: string, workerId: string, errorPayload: { verdict: TerminalVerdict; isInfrastructureFailure: boolean; message?: string }): void {
    this.completeJob(jobId, workerId, { jobId, verdict: errorPayload.verdict,
      isInfrastructureFailure: errorPayload.isInfrastructureFailure, executionTimeMs: 0,
      testResults: [], guidance: errorPayload.message, completedAt: new Date().toISOString() });
  }

  recoverStuckJobs(): number {
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const expired = this.db.prepare(`SELECT id,retry_count,deadline_at FROM execution_jobs
        WHERE (status='running' AND (lease_expires_at < ? OR deadline_at < ?
          OR (worker_id='recovery' AND lease_expires_at IS NULL)))
           OR (status='queued' AND deadline_at < ?)`).all(now, now, now) as any[];
      for (const row of expired) {
        if (row.retry_count >= 2 || (row.deadline_at && row.deadline_at < now)) {
          this.db.prepare(`UPDATE execution_jobs SET status='running', worker_id='recovery',
            lease_expires_at=?, updated_at=? WHERE id=? AND status IN ('running','queued')`)
            .run(now, now, row.id);
          this.completeJobInTransaction(row.id, 'recovery', { jobId: row.id,
            verdict: 'INTERNAL_ERROR', isInfrastructureFailure: true, executionTimeMs: 0,
            testResults: [], guidance: 'Execution infrastructure did not complete this job. Please retry.',
            completedAt: now }, now);
        } else {
          this.db.prepare(`UPDATE execution_jobs SET status='queued',worker_id=NULL,
            lease_expires_at=NULL,retry_count=retry_count+1,updated_at=? WHERE id=? AND status='running'`)
            .run(now, row.id);
        }
      }
      this.db.exec('COMMIT');
      return expired.length;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  /**
   * Never-throwing wrapper around recoverStuckJobs() for timers and readiness probes that run
   * without a worker. Returns the number of recovered jobs, or -1 (after logging) on error such as SQLITE_BUSY.
   */
  recoverStuckJobsSafe(): number {
    try { return this.recoverStuckJobs(); }
    catch (error) {
      console.error('[execution] recoverStuckJobs failed:', error instanceof Error ? error.message : String(error));
      return -1;
    }
  }

  /** Returns a running job to the queue (graceful worker shutdown). No retry penalty. */
  releaseJob(jobId: string, workerId: string): boolean {
    const result = this.db.prepare(`UPDATE execution_jobs SET status='queued',worker_id=NULL,
      lease_expires_at=NULL,updated_at=? WHERE id=? AND status='running' AND worker_id=?`)
      .run(new Date().toISOString(), jobId, workerId);
    return result.changes === 1;
  }

  claimJobById(jobId: string, workerId: string, leaseDurationMs: number = 30000): ExecutionJobPayload | null {
    this.recoverStuckJobs();
    const now = new Date().toISOString();
    const expires = new Date(Date.now()+leaseDurationMs).toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare(`SELECT id,user_id,enrollment_id,step_id,job_type,code,stdin,
        course_version_id,assessment_snapshot,deadline_at FROM execution_jobs WHERE id=? AND status='queued'`).get(jobId) as any;
      if (!row) { this.db.exec('COMMIT'); return null; }
      const deadlineAt = row.deadline_at || new Date(Date.now()+60_000).toISOString();
      this.db.prepare(`UPDATE execution_jobs SET status='running',worker_id=?,lease_expires_at=?,
        deadline_at=?,updated_at=? WHERE id=? AND status='queued'`).run(workerId,expires,deadlineAt,now,jobId);
      const testCases = getTestCasesForJob(this.db, row);
      this.db.exec('COMMIT');
      return { jobId, userId: row.user_id, enrollmentId: row.enrollment_id,
        stepId: row.step_id, jobType: row.job_type, code: row.code,
        stdin: row.stdin, testCases, deadlineAt };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  async executeJobSynchronously(params: EnqueueJobParams): Promise<{ job: ExecutionJob; result: ExecutionResult }> {
    const { job } = this.enqueueJob(params);
    const workerId = `worker-sync-${process.pid}`;

    const payload = this.claimJobById(job.id, workerId);
    if (!payload) {
      throw new Error('Failed to claim newly enqueued execution job');
    }

    const result = await processExecutionJob(payload);
    this.completeJob(job.id, workerId, result);

    const { job: completedJob, result: finalResult } = this.getJob(job.id, params.userId);
    return { job: completedJob, result: finalResult || result };
  }
}

/**
 * Runs recoverStuckJobsSafe() on an unref'd interval so queued/stuck jobs expire even with no worker.
 * Usable from the API process: `const stop = startStuckJobRecovery(executionService, 15_000)`.
 * Returns a stop function.
 */
export function startStuckJobRecovery(service: Pick<ExecutionService, 'recoverStuckJobsSafe'>, intervalMs: number = 15_000): () => void {
  const timer = setInterval(() => { service.recoverStuckJobsSafe(); }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

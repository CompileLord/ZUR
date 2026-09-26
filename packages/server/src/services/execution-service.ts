import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
  validatePythonSource,
  type ExecutionResult,
  type TerminalVerdict,
  type TestCase,
  type ExecutionJob,
} from 'zur-shared';
import { QuotaService } from './quota-service.ts';
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
      : this.getPinnedAssessment(userId, enrollmentId, stepId);

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

    // Enforce quotas, rate limits, active jobs limit, and operator kill switch
    this.quotaService.assertExecutionAvailable();
    if (jobType !== 'author_validation') {
      this.quotaService.checkCanEnqueue(userId, jobType);
    }

    const validation = validatePythonSource(code);
    if (!validation.valid) {
      throw new ValidationError(validation.error || 'Invalid Python source code');
    }

    const jobId = `job-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO execution_jobs (
        id, user_id, enrollment_id, step_id, job_type, code, stdin,
        idempotency_key, status, course_version_id, assessment_snapshot, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)
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

    return { job, isDuplicate: false };
  }

  private getPinnedAssessment(userId: string, enrollmentId: string | null | undefined, stepId: string): { versionId: string; testCases: TestCase[] } {
    if (!enrollmentId) throw new NotFoundError("This page isn't available.");
    const enrollment = this.db.prepare(`
      SELECT e.user_id, e.status, e.pinned_version_id, c.is_suspended
      FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.id = ?
    `).get(enrollmentId) as any;
    if (!enrollment || enrollment.user_id !== userId || enrollment.status !== 'active') {
      throw new NotFoundError("This page isn't available.");
    }
    if (enrollment.is_suspended) throw new AuthorizationError('Course access is suspended.');
    const version = this.db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(enrollment.pinned_version_id) as any;
    if (!version) throw new NotFoundError("This page isn't available.");
    let snapshot: any;
    try { snapshot = JSON.parse(version.snapshot_data); }
    catch { throw new NotFoundError("This page isn't available."); }
    const step = (snapshot.modules || []).flatMap((module: any) => module.lessons || [])
      .flatMap((lesson: any) => lesson.steps || []).find((item: any) => item.id === stepId);
    if (!step || step.type !== 'python' || !Array.isArray(step.content?.testCases)) throw new NotFoundError("This page isn't available.");
    const testCases = step.content.testCases.map((test: any) => ({
      id: String(test.id),
      stepId,
      stdin: String(test.stdin ?? ''),
      expectedStdout: String(test.expectedStdout ?? ''),
      isHidden: Boolean(test.isHidden),
      position: Number(test.position),
      createdAt: String(test.createdAt ?? ''),
    })) as TestCase[];
    if (testCases.length === 0) throw new NotFoundError("This page isn't available.");
    return { versionId: enrollment.pinned_version_id, testCases };
  }

  private readSnapshotTestCases(versionId: string, stepId: string): TestCase[] | null {
    const version = this.db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(versionId) as any;
    if (!version?.snapshot_data) return null;
    try {
      const snapshot = JSON.parse(version.snapshot_data);
      const step = (snapshot.modules || []).flatMap((module: any) => module.lessons || [])
        .flatMap((lesson: any) => lesson.steps || []).find((item: any) => item.id === stepId);
      if (!step || step.type !== 'python' || !Array.isArray(step.content?.testCases)) return null;
      return step.content.testCases.map((test: any) => ({
        id: String(test.id), stepId, stdin: String(test.stdin ?? ''), expectedStdout: String(test.expectedStdout ?? ''),
        isHidden: Boolean(test.isHidden), position: Number(test.position), createdAt: String(test.createdAt ?? ''),
      }));
    } catch { return null; }
  }

  private getTestCasesForJob(candidate: any): TestCase[] {
    let testCases: TestCase[] | null = null;
    if (candidate.assessment_snapshot) {
      try { testCases = JSON.parse(candidate.assessment_snapshot) as TestCase[]; }
      catch { throw new NotFoundError('Execution assessment snapshot is unavailable.'); }
    }
    let versionId = candidate.course_version_id as string | null;
    if (!versionId && candidate.enrollment_id) {
      versionId = (this.db.prepare('SELECT pinned_version_id FROM enrollments WHERE id = ?').get(candidate.enrollment_id) as any)?.pinned_version_id || null;
    }
    if (!testCases && versionId) testCases = this.readSnapshotTestCases(versionId, candidate.step_id);
    if (testCases) return testCases;
    const rows = this.db.prepare(`
      SELECT id, step_id, stdin, expected_stdout, is_hidden, position, created_at
      FROM test_cases WHERE step_id = ? ORDER BY position ASC
    `).all(candidate.step_id) as any[];
    return rows.map((tc) => ({
      id: tc.id, stepId: tc.step_id, stdin: tc.stdin, expectedStdout: tc.expected_stdout,
      isHidden: Boolean(tc.is_hidden), position: tc.position, createdAt: tc.created_at,
    }));
  }

  getJob(jobId: string, requestingUserId: string): { job: ExecutionJob; result?: ExecutionResult | null } {
    const row = this.db.prepare(`
      SELECT j.id, j.user_id, j.enrollment_id, j.step_id, j.job_type, j.code, j.stdin, j.idempotency_key,
             j.status, j.lease_expires_at, j.result_payload, j.attempt_id, j.created_at, j.updated_at,
             e.course_id, c.owner_id course_owner_id
      FROM execution_jobs j JOIN enrollments e ON e.id=j.enrollment_id JOIN courses c ON c.id=e.course_id
      WHERE j.id = ?
    `).get(jobId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    // Keep learner code and execution output private to the learner and course owner.
    if (row.user_id !== requestingUserId) {
      if (row.course_owner_id !== requestingUserId) {
        throw new NotFoundError("This page isn't available.");
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
          result = redactFullExecutionResultForStudent(rawResult);
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
    const now = new Date().toISOString();
    const leaseExpires = new Date(Date.now() + leaseDurationMs).toISOString();

    const candidate = this.db.prepare(`
      SELECT id, user_id, enrollment_id, step_id, job_type, code, stdin, course_version_id, assessment_snapshot
      FROM execution_jobs
      WHERE status = 'queued'
         OR (status = 'running' AND lease_expires_at < ?)
      ORDER BY created_at ASC
      LIMIT 1
    `).get(now) as any;

    if (!candidate) {
      return null;
    }

    this.db.prepare(`
      UPDATE execution_jobs
      SET status = 'running', worker_id = ?, lease_expires_at = ?, updated_at = ?
      WHERE id = ?
    `).run(workerId, leaseExpires, now, candidate.id);

    const testCases = this.getTestCasesForJob(candidate);

    return {
      jobId: candidate.id,
      userId: candidate.user_id,
      enrollmentId: candidate.enrollment_id,
      stepId: candidate.step_id,
      jobType: candidate.job_type,
      code: candidate.code,
      stdin: candidate.stdin,
      testCases,
    };
  }

  completeJob(jobId: string, workerId: string, result: ExecutionResult): void {
    const now = new Date().toISOString();

    const jobRow = this.db.prepare(`
      SELECT id, user_id, enrollment_id, step_id, job_type, code, course_version_id
      FROM execution_jobs
      WHERE id = ?
    `).get(jobId) as any;

    if (!jobRow) return;

    let attemptId: string | null = null;

    if (jobRow.job_type === 'submit' && jobRow.enrollment_id) {
      // 1. Resolve enrollment's pinned course version
      const enrollmentRow = this.db.prepare(`
        SELECT pinned_version_id FROM enrollments WHERE id = ?
      `).get(jobRow.enrollment_id) as { pinned_version_id: string } | undefined;

      const courseVersionId = jobRow.course_version_id || enrollmentRow?.pinned_version_id || 'version-default';

      // 2. Compute attempt number
      const countRow = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM assessment_attempts
        WHERE enrollment_id = ? AND step_id = ?
      `).get(jobRow.enrollment_id, jobRow.step_id) as { count: number };

      const attemptNumber = countRow.count + 1;
      attemptId = `attempt-${crypto.randomUUID()}`;

      this.db.prepare(`
        INSERT INTO assessment_attempts (
          id, user_id, enrollment_id, step_id, course_version_id,
          attempt_number, type, verdict, code_snapshot, execution_time_ms,
          is_infrastructure_failure, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'python', ?, ?, ?, ?, ?)
      `).run(
        attemptId,
        jobRow.user_id,
        jobRow.enrollment_id,
        jobRow.step_id,
        courseVersionId,
        attemptNumber,
        result.verdict,
        jobRow.code,
        result.executionTimeMs,
        result.isInfrastructureFailure ? 1 : 0,
        now
      );

      result.attemptId = attemptId;

      // 3. Atomically update progress when PASSED
      if (result.verdict === 'PASSED') {
        const progressId = `progress-${crypto.randomUUID()}`;
        this.db.prepare(`
          INSERT INTO step_progress (id, user_id, enrollment_id, step_id, is_completed, completed_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?)
          ON CONFLICT(enrollment_id, step_id) DO UPDATE SET
            is_completed = 1,
            completed_at = COALESCE(step_progress.completed_at, excluded.completed_at),
            updated_at = excluded.updated_at
        `).run(
          progressId,
          jobRow.user_id,
          jobRow.enrollment_id,
          jobRow.step_id,
          now,
          now,
          now
        );
      }
    }

    this.db.prepare(`
      UPDATE execution_jobs
      SET status = 'completed', result_payload = ?, attempt_id = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(result), attemptId, now, jobId);
  }

  failJob(
    jobId: string,
    workerId: string,
    errorPayload: { verdict: TerminalVerdict; isInfrastructureFailure: boolean; message?: string }
  ): void {
    const now = new Date().toISOString();
    const result: ExecutionResult = {
      jobId,
      verdict: errorPayload.verdict,
      isInfrastructureFailure: errorPayload.isInfrastructureFailure,
      executionTimeMs: 0,
      testResults: [],
      guidance: errorPayload.message,
      completedAt: now,
    };

    this.completeJob(jobId, workerId, result);
  }

  recoverStuckJobs(): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE execution_jobs
      SET status = 'queued', worker_id = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE status = 'running' AND lease_expires_at < ?
    `).run(now, now);

    return Number(result.changes);
  }

  claimJobById(jobId: string, workerId: string, leaseDurationMs: number = 30000): ExecutionJobPayload | null {
    const now = new Date().toISOString();
    const leaseExpires = new Date(Date.now() + leaseDurationMs).toISOString();

    const candidate = this.db.prepare(`
      SELECT id, user_id, enrollment_id, step_id, job_type, code, stdin, course_version_id, assessment_snapshot
      FROM execution_jobs
      WHERE id = ?
    `).get(jobId) as any;

    if (!candidate) {
      return null;
    }

    this.db.prepare(`
      UPDATE execution_jobs
      SET status = 'running', worker_id = ?, lease_expires_at = ?, updated_at = ?
      WHERE id = ?
    `).run(workerId, leaseExpires, now, candidate.id);

    const testCases = this.getTestCasesForJob(candidate);

    return {
      jobId: candidate.id,
      userId: candidate.user_id,
      enrollmentId: candidate.enrollment_id,
      stepId: candidate.step_id,
      jobType: candidate.job_type,
      code: candidate.code,
      stdin: candidate.stdin,
      testCases,
    };
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

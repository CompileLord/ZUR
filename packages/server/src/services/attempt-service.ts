import type { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  NotFoundError,
  AuthorizationError,
  type PaginatedResult,
} from 'zur-shared';
import { DraftService } from './draft-service.ts';

export interface AttemptListItem {
  id: string;
  attemptNumber: number;
  verdict: string;
  executionTimeMs?: number | null;
  isInfrastructureFailure: boolean;
  createdAt: string;
}

export interface AttemptDetail extends AttemptListItem {
  codeSnapshot: string;
  canRestore: boolean;
  runtimeVersion: string;
}

export class AttemptService {
  private db: DatabaseSync;
  private draftService: DraftService;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.draftService = new DraftService(db);
  }

  private attemptHasHiddenFailure(resultPayload: string | null | undefined): boolean {
    if (!resultPayload) return false;
    try {
      const result = JSON.parse(resultPayload);
      return Array.isArray(result.testResults) && result.testResults.some((test: any) => test?.isHidden === true && test?.passed === false);
    } catch {
      return false;
    }
  }


  listAttempts(params: {
    enrollmentId: string;
    stepId: string;
    requestingUserId: string;
    limit?: number;
    offset?: number;
  }): PaginatedResult<AttemptListItem> {
    const { enrollmentId, stepId, requestingUserId } = params;
    const limit = Math.min(Math.max(params.limit || 20, 1), 50);
    const offset = Math.max(params.offset || 0, 0);

    // Verify enrollment access
    const enrollment = this.db.prepare(`
      SELECT user_id, course_id FROM enrollments WHERE id = ?
    `).get(enrollmentId) as { user_id: string; course_id: string } | undefined;

    if (!enrollment) {
      throw new NotFoundError("This page isn't available.");
    }

    if (enrollment.user_id !== requestingUserId) {
      // Check if teacher/owner of course or admin
      const course = this.db.prepare('SELECT owner_id FROM courses WHERE id = ?').get(enrollment.course_id) as { owner_id: string } | undefined;
      if (course?.owner_id !== requestingUserId) {
        throw new NotFoundError("This page isn't available.");
      }
    }

    const totalRow = this.db.prepare(`
      SELECT COUNT(*) as total
      FROM assessment_attempts
      WHERE enrollment_id = ? AND step_id = ?
    `).get(enrollmentId, stepId) as { total: number };

    const rows = this.db.prepare(`
      SELECT a.id, a.attempt_number, a.verdict, a.execution_time_ms, a.is_infrastructure_failure, a.created_at,
             (SELECT j.result_payload FROM execution_jobs j WHERE j.attempt_id = a.id AND j.job_type = 'submit' LIMIT 1) result_payload
      FROM assessment_attempts a
      WHERE enrollment_id = ? AND step_id = ?
      ORDER BY a.attempt_number DESC
      LIMIT ? OFFSET ?
    `).all(enrollmentId, stepId, limit, offset) as any[];

    const items: AttemptListItem[] = rows.map((r) => ({
      id: r.id,
      attemptNumber: r.attempt_number,
      verdict: r.verdict,
      ...(this.attemptHasHiddenFailure(r.result_payload) ? {} : { executionTimeMs: r.execution_time_ms }),
      isInfrastructureFailure: Boolean(r.is_infrastructure_failure),
      createdAt: r.created_at,
    }));

    return {
      items,
      total: totalRow.total,
      limit,
      offset,
      hasMore: offset + items.length < totalRow.total,
    };
  }

  getAttempt(attemptId: string, requestingUserId: string): AttemptDetail {
    const row = this.db.prepare(`
      SELECT a.id, a.user_id, a.enrollment_id, a.step_id, a.attempt_number,
             a.verdict, a.code_snapshot, a.execution_time_ms,
             a.is_infrastructure_failure, a.created_at,
             e.course_id,
             (SELECT j.result_payload FROM execution_jobs j WHERE j.attempt_id = a.id AND j.job_type = 'submit' LIMIT 1) result_payload
      FROM assessment_attempts a
      JOIN enrollments e ON a.enrollment_id = e.id
      WHERE a.id = ?
    `).get(attemptId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    const isOwnerStudent = row.user_id === requestingUserId;
    if (!isOwnerStudent) {
      const course = this.db.prepare('SELECT owner_id FROM courses WHERE id = ?').get(row.course_id) as { owner_id: string } | undefined;
      if (course?.owner_id !== requestingUserId) {
        throw new NotFoundError("This page isn't available.");
      }
    }

    return {
      id: row.id,
      attemptNumber: row.attempt_number,
      verdict: row.verdict,
      codeSnapshot: row.code_snapshot || '',
      ...(this.attemptHasHiddenFailure(row.result_payload) ? {} : { executionTimeMs: row.execution_time_ms }),
      isInfrastructureFailure: Boolean(row.is_infrastructure_failure),
      createdAt: row.created_at,
      canRestore: isOwnerStudent,
      runtimeVersion: 'Python 3.14',
    };
  }

  restoreAttempt(attemptId: string, userId: string): { success: boolean; code: string } {
    const row = this.db.prepare(`
      SELECT user_id, enrollment_id, step_id, code_snapshot
      FROM assessment_attempts
      WHERE id = ?
    `).get(attemptId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    // Only the student owner can restore code to their editor (design §11 P16)
    if (row.user_id !== userId) {
      throw new AuthorizationError('Cannot restore code from another user');
    }

    const currentDraft = this.draftService.getDraft(userId, row.enrollment_id, row.step_id);
    this.draftService.saveDraft(
      userId,
      row.enrollment_id,
      row.step_id,
      row.code_snapshot,
      currentDraft.revision
    );

    return {
      success: true,
      code: row.code_snapshot,
    };
  }

  private auditSupportView(actorId:string,action:string,targetId:string,reason:string,metadata:Record<string,string>):void {
    this.db.prepare(`INSERT INTO audit_events(id,actor_id,action,target_type,target_id,reason,metadata,correlation_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(crypto.randomUUID(),actorId,action,'assessment_attempt',targetId,reason,JSON.stringify(metadata),crypto.randomUUID(),new Date().toISOString());
  }
}

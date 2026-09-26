import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthorizationError,
  validatePythonSource,
  type CodeDraftResponse,
} from 'zur-shared';

export class DraftConflictError extends ConflictError {
  currentRevision: number;
  serverCode: string;

  constructor(currentRevision: number, serverCode: string) {
    super('Stale code revision: draft has been modified elsewhere');
    this.name = 'DraftConflictError';
    this.currentRevision = currentRevision;
    this.serverCode = serverCode;
  }

  override toJSON() {
    return {
      error: {
        code: 'STALE_REVISION',
        message: this.message,
        currentRevision: this.currentRevision,
        serverCode: this.serverCode,
      },
    };
  }
}

export class DraftService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private getEditableStep(userId: string, enrollmentId: string, stepId: string): any {
    const enrollment = this.db.prepare(`
      SELECT e.user_id, e.status, e.pinned_version_id, c.is_suspended
      FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.id=?
    `).get(enrollmentId) as any;
    if (!enrollment || enrollment.user_id !== userId || enrollment.status !== 'active') {
      throw new NotFoundError("This page isn't available.");
    }
    if (enrollment.is_suspended) throw new AuthorizationError('Course access is suspended.');
    const version = this.db.prepare('SELECT snapshot_data FROM course_versions WHERE id=?').get(enrollment.pinned_version_id) as any;
    if (!version) throw new NotFoundError("This page isn't available.");
    let snapshot: any;
    try { snapshot = JSON.parse(version.snapshot_data); }
    catch { throw new NotFoundError("This page isn't available."); }
    const step = (snapshot.modules || []).flatMap((module: any) => module.lessons || [])
      .flatMap((lesson: any) => lesson.steps || []).find((item: any) => item.id === stepId);
    if (!step || step.type !== 'python') throw new NotFoundError("This page isn't available.");
    return step;
  }

  getDraft(userId: string, enrollmentId: string, stepId: string): CodeDraftResponse {
    const step = this.getEditableStep(userId, enrollmentId, stepId);
    const row = this.db.prepare(`
      SELECT id, code, revision, updated_at
      FROM code_drafts
      WHERE user_id = ? AND enrollment_id = ? AND step_id = ?
    `).get(userId, enrollmentId, stepId) as {
      id: string;
      code: string;
      revision: number;
      updated_at: string;
    } | undefined;

    if (!row) {
      const starterCode = step.content?.starterCode || '';
      return {
        enrollmentId,
        stepId,
        code: starterCode,
        revision: 0,
        isStarter: true,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      id: row.id,
      enrollmentId,
      stepId,
      code: row.code,
      revision: row.revision,
      isStarter: false,
      updatedAt: row.updated_at,
    };
  }

  saveDraft(
    userId: string,
    enrollmentId: string,
    stepId: string,
    code: string,
    baseRevision: number
  ): CodeDraftResponse {
    this.getEditableStep(userId, enrollmentId, stepId);
    const validation = validatePythonSource(code);
    if (!validation.valid) {
      throw new ValidationError(validation.error || 'Invalid Python source code');
    }

    const now = new Date().toISOString();

    const existing = this.db.prepare(`
      SELECT id, code, revision
      FROM code_drafts
      WHERE user_id = ? AND enrollment_id = ? AND step_id = ?
    `).get(userId, enrollmentId, stepId) as {
      id: string;
      code: string;
      revision: number;
    } | undefined;

    if (existing) {
      if (existing.revision !== baseRevision) {
        throw new DraftConflictError(existing.revision, existing.code);
      }

      const nextRevision = existing.revision + 1;
      this.db.prepare(`
        UPDATE code_drafts
        SET code = ?, revision = ?, updated_at = ?
        WHERE id = ?
      `).run(code, nextRevision, now, existing.id);

      return {
        id: existing.id,
        enrollmentId,
        stepId,
        code,
        revision: nextRevision,
        isStarter: false,
        updatedAt: now,
      };
    }

    const newId = `draft-${crypto.randomUUID()}`;
    this.db.prepare(`
      INSERT INTO code_drafts (id, user_id, enrollment_id, step_id, code, revision, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(newId, userId, enrollmentId, stepId, code, now);

    return {
      id: newId,
      enrollmentId,
      stepId,
      code,
      revision: 1,
      isStarter: false,
      updatedAt: now,
    };
  }

  resetDraft(userId: string, enrollmentId: string, stepId: string, expectedRevision: number): CodeDraftResponse {
    const step = this.getEditableStep(userId, enrollmentId, stepId);
    const starterCode = step.content?.starterCode || '';
    const now = new Date().toISOString();

    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new ValidationError('A valid expected draft revision is required.');
    }

    const existing = this.db.prepare(`
      SELECT id, code, revision
      FROM code_drafts
      WHERE user_id = ? AND enrollment_id = ? AND step_id = ?
    `).get(userId, enrollmentId, stepId) as {
      id: string;
      revision: number;
    } | undefined;

    const currentRevision = existing?.revision ?? 0;
    if (currentRevision !== expectedRevision) {
      throw new DraftConflictError(currentRevision, existing?.code || starterCode);
    }

    if (existing) {
      const nextRevision = existing.revision + 1;
      this.db.prepare(`
        UPDATE code_drafts
        SET code = ?, revision = ?, updated_at = ?
        WHERE id = ?
      `).run(starterCode, nextRevision, now, existing.id);

      return {
        id: existing.id,
        enrollmentId,
        stepId,
        code: starterCode,
        revision: nextRevision,
        isStarter: true,
        updatedAt: now,
      };
    }

    const newId = `draft-${crypto.randomUUID()}`;
    this.db.prepare(`
      INSERT INTO code_drafts (id, user_id, enrollment_id, step_id, code, revision, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(newId, userId, enrollmentId, stepId, starterCode, now);

    return {
      id: newId,
      enrollmentId,
      stepId,
      code: starterCode,
      revision: 1,
      isStarter: true,
      updatedAt: now,
    };
  }
}

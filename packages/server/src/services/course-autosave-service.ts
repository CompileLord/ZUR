import { DatabaseSync } from 'node:sqlite';
import {
  NotFoundError,
  AuthorizationError,
  StaleRevisionError,
} from 'zur-shared';
import type { StepContentPayload } from 'zur-shared';

export interface StepContentResult {
  stepId: string;
  revision: number;
  updatedAt: string;
  content: StepContentPayload;
  title: string;
  type: string;
  isRequired: boolean;
  estimatedDurationMinutes: number;
}

export class CourseAutosaveService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private verifyStepOwner(userId: string, stepId: string): { courseId: string } {
    const row = this.db
      .prepare(
        `SELECT c.id as course_id, c.owner_id
         FROM steps s
         JOIN lessons l ON s.lesson_id = l.id
         JOIN modules m ON l.module_id = m.id
         JOIN courses c ON m.course_id = c.id
         WHERE s.id = ?`
      )
      .get(stepId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    if (row.owner_id !== userId) {
      const user = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(userId) as any;
      const caps = user ? JSON.parse(user.capabilities || '[]') : [];
      if (!caps.includes('admin')) {
        throw new AuthorizationError('Access denied');
      }
    }

    return { courseId: row.course_id };
  }

  getStepContent(userId: string, stepId: string): StepContentResult {
    this.verifyStepOwner(userId, stepId);

    const step = this.db
      .prepare('SELECT title, type, is_required, estimated_duration_minutes FROM steps WHERE id = ?')
      .get(stepId) as any;
    if (!step) {
      throw new NotFoundError('Step not found');
    }

    const contentRow = this.db
      .prepare('SELECT content_payload, revision, updated_at FROM step_contents WHERE step_id = ?')
      .get(stepId) as any;
    if (!contentRow) {
      throw new NotFoundError('Step content not found');
    }

    const content = JSON.parse(contentRow.content_payload) as StepContentPayload;

    return {
      stepId,
      revision: contentRow.revision,
      updatedAt: contentRow.updated_at,
      content,
      title: step.title,
      type: step.type,
      isRequired: Boolean(step.is_required),
      estimatedDurationMinutes: step.estimated_duration_minutes || 5,
    };
  }

  saveStepContent(
    userId: string,
    stepId: string,
    expectedRevision: number,
    payload: StepContentPayload,
    stepMeta?: { title?: string; isRequired?: boolean; estimatedDurationMinutes?: number }
  ): StepContentResult {
    const { courseId } = this.verifyStepOwner(userId, stepId);

    const contentRow = this.db
      .prepare('SELECT content_payload, revision FROM step_contents WHERE step_id = ?')
      .get(stepId) as any;
    if (!contentRow) {
      throw new NotFoundError('Step content not found');
    }

    // Revision conflict check (PRD §8.2, AC-02, T038)
    if (contentRow.revision !== expectedRevision) {
      let serverContent: any = null;
      try {
        serverContent = JSON.parse(contentRow.content_payload);
      } catch {
        serverContent = contentRow.content_payload;
      }
      throw new StaleRevisionError(
        'Step content was modified elsewhere.',
        contentRow.revision,
        {
          stepId,
          serverContent,
        }
      );
    }

    const newRevision = expectedRevision + 1;
    const now = new Date().toISOString();

    this.db
      .prepare(
        'UPDATE step_contents SET content_payload = ?, revision = ?, updated_at = ? WHERE step_id = ?'
      )
      .run(JSON.stringify(payload), newRevision, now, stepId);

    if (stepMeta) {
      const step = this.db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId) as any;
      const title = stepMeta.title !== undefined ? stepMeta.title.trim() : step.title;
      const isRequired =
        stepMeta.isRequired !== undefined ? (stepMeta.isRequired ? 1 : 0) : step.is_required;
      const duration =
        stepMeta.estimatedDurationMinutes !== undefined
          ? Math.max(1, stepMeta.estimatedDurationMinutes)
          : step.estimated_duration_minutes;

      this.db
        .prepare(
          'UPDATE steps SET title = ?, is_required = ?, estimated_duration_minutes = ?, updated_at = ? WHERE id = ?'
        )
        .run(title, isRequired, duration, now, stepId);
    }

    // Touch course revision
    this.db
      .prepare(
        "UPDATE courses SET draft_revision = draft_revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .run(courseId);

    return this.getStepContent(userId, stepId);
  }
}

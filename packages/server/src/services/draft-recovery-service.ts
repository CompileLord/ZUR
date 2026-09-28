import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { NotFoundError, ValidationError, StaleRevisionError } from 'zur-shared';

export interface RecoverySnapshotSummary {
  id: string;
  courseId: string;
  revisionNumber: number;
  createdBy: string;
  reason: string;
  createdAt: string;
}

export interface RestoreDraftResult {
  success: boolean;
  courseId: string;
  restoredRevisionNumber: number;
  newRevision: number;
}

export class DraftRecoveryService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private verifyCourseOwner(authorId: string, courseId: string): void {
    const course = this.db.prepare('SELECT owner_id FROM courses WHERE id = ?').get(courseId) as { owner_id: string } | undefined;
    if (!course || course.owner_id !== authorId) {
      throw new NotFoundError("This page isn't available.");
    }
  }

  createSnapshot(userId: string, courseId: string, reason: string): RecoverySnapshotSummary {
    this.verifyCourseOwner(userId, courseId);

    const course = this.db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    const modules = this.db
      .prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC, created_at ASC')
      .all(courseId) as any[];

    const moduleSnapshots = modules.map((m) => {
      const lessons = this.db
        .prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY position ASC, created_at ASC')
        .all(m.id) as any[];

      const lessonSnapshots = lessons.map((l) => {
        const steps = this.db
          .prepare('SELECT * FROM steps WHERE lesson_id = ? ORDER BY position ASC, created_at ASC')
          .all(l.id) as any[];

        const stepSnapshots = steps.map((s) => {
          const contentRow = this.db
            .prepare('SELECT content_payload FROM step_contents WHERE step_id = ?')
            .get(s.id) as any;

          let content = null;
          if (contentRow?.content_payload) {
            try {
              content = JSON.parse(contentRow.content_payload);
            } catch {
              content = contentRow.content_payload;
            }
          }

          let testCases: any[] = [];
          if (s.type === 'python') {
            const tcRows = this.db
              .prepare('SELECT * FROM test_cases WHERE step_id = ? ORDER BY position ASC, created_at ASC')
              .all(s.id) as any[];
            testCases = tcRows.map((tc) => ({
              id: tc.id,
              stdin: tc.stdin || '',
              expectedStdout: tc.expected_stdout || '',
              isHidden: Boolean(tc.is_hidden),
              position: tc.position,
            }));
          }

          return {
            id: s.id,
            lessonId: s.lesson_id,
            type: s.type,
            title: s.title,
            position: s.position,
            isRequired: Boolean(s.is_required),
            estimatedDurationMinutes: s.estimated_duration_minutes || 5,
            content,
            testCases,
          };
        });

        return {
          id: l.id,
          moduleId: l.module_id,
          title: l.title,
          description: l.description,
          position: l.position,
          steps: stepSnapshots,
        };
      });

      return {
        id: m.id,
        courseId: m.course_id,
        title: m.title,
        position: m.position,
        lessons: lessonSnapshots,
      };
    });

    const snapshot = {
      courseId: course.id,
      revisionNumber: course.draft_revision,
      title: course.title,
      description: course.description,
      categoryId: course.category_id,
      tags: course.tags ? JSON.parse(course.tags) : [],
      difficulty: course.difficulty,
      language: course.language,
      prerequisites: course.prerequisites,
      learningOutcomes: course.learning_outcomes ? JSON.parse(course.learning_outcomes) : [],
      modules: moduleSnapshots,
    };

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(
      `INSERT INTO recovery_revisions (
        id, course_id, revision_number, content_snapshot, created_by, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      courseId,
      course.draft_revision,
      JSON.stringify(snapshot),
      userId,
      reason,
      now
    );

    return {
      id,
      courseId,
      revisionNumber: course.draft_revision,
      createdBy: userId,
      reason,
      createdAt: now,
    };
  }

  listRecoveryRevisions(authorId: string, courseId: string): RecoverySnapshotSummary[] {
    this.verifyCourseOwner(authorId, courseId);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const rows = this.db.prepare(`
      SELECT id, course_id, revision_number, created_by, reason, created_at
      FROM recovery_revisions
      WHERE course_id = ? AND created_at >= ?
      ORDER BY revision_number DESC, created_at DESC
    `).all(courseId, thirtyDaysAgo) as any[];

    return rows.map((r) => ({
      id: r.id,
      courseId: r.course_id,
      revisionNumber: r.revision_number,
      createdBy: r.created_by,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  }

  getRecoveryRevision(authorId: string, courseId: string, revisionId: string): any {
    this.verifyCourseOwner(authorId, courseId);

    const row = this.db.prepare(`
      SELECT * FROM recovery_revisions WHERE id = ? AND course_id = ?
    `).get(revisionId, courseId) as any;

    if (!row) {
      throw new NotFoundError("This page isn't available.");
    }

    return {
      id: row.id,
      courseId: row.course_id,
      revisionNumber: row.revision_number,
      createdBy: row.created_by,
      reason: row.reason,
      createdAt: row.created_at,
      contentSnapshot: JSON.parse(row.content_snapshot),
    };
  }

  restoreDraftRevision(
    authorId: string,
    courseId: string,
    revisionId: string,
    expectedRevision: number
  ): RestoreDraftResult {
    this.verifyCourseOwner(authorId, courseId);

    const course = this.db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    if (course.draft_revision !== expectedRevision) {
      throw new StaleRevisionError(
        'The course draft has been modified since it was loaded. Please review changes before restoring.',
        course.draft_revision,
        { courseId, currentRevision: course.draft_revision, expectedRevision }
      );
    }

    let recoveryRecord = this.db.prepare(`
      SELECT * FROM recovery_revisions WHERE id = ? AND course_id = ?
    `).get(revisionId, courseId) as any;

    if (!recoveryRecord && Number.isInteger(Number(revisionId))) {
      recoveryRecord = this.db.prepare(`
        SELECT * FROM recovery_revisions WHERE revision_number = ? AND course_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(Number(revisionId), courseId) as any;
    }

    if (!recoveryRecord) {
      throw new NotFoundError("This page isn't available.");
    }

    let snapshot: any;
    try {
      snapshot = JSON.parse(recoveryRecord.content_snapshot);
    } catch {
      throw new ValidationError('Malformed recovery snapshot data');
    }

    this.createSnapshot(authorId, courseId, `Auto-backup before restoring revision ${recoveryRecord.revision_number}`);

    const newRevision = course.draft_revision + 1;
    const now = new Date().toISOString();

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const lockedCourse = this.db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
      if (lockedCourse.draft_revision !== expectedRevision) {
        throw new StaleRevisionError(
          'Course draft was concurrently modified.',
          lockedCourse.draft_revision,
          { courseId }
        );
      }

      this.db.prepare(`
        DELETE FROM test_cases WHERE step_id IN (
          SELECT s.id FROM steps s
          JOIN lessons l ON s.lesson_id = l.id
          JOIN modules m ON l.module_id = m.id
          WHERE m.course_id = ?
        )
      `).run(courseId);

      this.db.prepare(`
        DELETE FROM step_contents WHERE step_id IN (
          SELECT s.id FROM steps s
          JOIN lessons l ON s.lesson_id = l.id
          JOIN modules m ON l.module_id = m.id
          WHERE m.course_id = ?
        )
      `).run(courseId);

      this.db.prepare(`
        DELETE FROM steps WHERE lesson_id IN (
          SELECT l.id FROM lessons l
          JOIN modules m ON l.module_id = m.id
          WHERE m.course_id = ?
        )
      `).run(courseId);

      this.db.prepare(`
        DELETE FROM lessons WHERE module_id IN (
          SELECT m.id FROM modules m WHERE m.course_id = ?
        )
      `).run(courseId);

      this.db.prepare('DELETE FROM modules WHERE course_id = ?').run(courseId);

      for (const mod of snapshot.modules || []) {
        const modId = mod.id || crypto.randomUUID();
        this.db.prepare(`
          INSERT INTO modules (id, course_id, title, position, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(modId, courseId, mod.title, mod.position ?? 0, now);

        for (const les of mod.lessons || []) {
          const lesId = les.id || crypto.randomUUID();
          this.db.prepare(`
            INSERT INTO lessons (id, module_id, title, description, position, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(lesId, modId, les.title, les.description || null, les.position ?? 0, now);

          for (const st of les.steps || []) {
            const stId = st.id || crypto.randomUUID();
            this.db.prepare(`
              INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              stId,
              lesId,
              st.type,
              st.title,
              st.position ?? 0,
              st.isRequired ? 1 : 0,
              st.estimatedDurationMinutes || 5,
              now,
              now
            );

            if (st.content) {
              const contentPayload = typeof st.content === 'string' ? st.content : JSON.stringify(st.content);
              this.db.prepare(`
                INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
                VALUES (?, ?, ?, 1, ?)
              `).run(crypto.randomUUID(), stId, contentPayload, now);
            } else {
              this.db.prepare(`
                INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
                VALUES (?, ?, ?, 1, ?)
              `).run(crypto.randomUUID(), stId, '{}', now);
            }

            if (st.type === 'python' && Array.isArray(st.testCases)) {
              for (const tc of st.testCases) {
                this.db.prepare(`
                  INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                  tc.id || crypto.randomUUID(),
                  stId,
                  tc.stdin || '',
                  tc.expectedStdout || '',
                  tc.isHidden ? 1 : 0,
                  tc.position ?? 0,
                  now
                );
              }
            }
          }
        }
      }

      const courseTitle = snapshot.title || snapshot.courseTitle;
      if (courseTitle) {
        this.db.prepare(`
          UPDATE courses
          SET title = ?,
              description = COALESCE(?, description),
              draft_revision = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          courseTitle,
          snapshot.description || null,
          newRevision,
          now,
          courseId
        );
      } else {
        this.db.prepare('UPDATE courses SET draft_revision = ?, updated_at = ? WHERE id = ?')
          .run(newRevision, now, courseId);
      }

      this.db.exec('COMMIT');

      return {
        success: true,
        courseId,
        restoredRevisionNumber: recoveryRecord.revision_number,
        newRevision,
      };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

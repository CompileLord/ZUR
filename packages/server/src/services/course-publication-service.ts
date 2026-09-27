import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ConflictError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  StaleRevisionError,
} from 'zur-shared';
import type {
  CourseVersionSnapshot,
  ModuleSnapshot,
  LessonSnapshot,
  StepSnapshot,
  PublicationReceipt,
  StepContentPayload,
  TestCase,
} from 'zur-shared';
import { CourseValidationService } from './course-validation-service.ts';

export interface PublishCourseOptions {
  expectedRevision: number;
  changeSummary?: string;
  idempotencyKey?: string;
}

export class CoursePublicationService {
  private db: DatabaseSync;
  private validationService: CourseValidationService;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.validationService = new CourseValidationService(db);
    this.ensureIdempotencyTable();
  }

  private ensureIdempotencyTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS publication_idempotency (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL UNIQUE,
        request_payload_hash TEXT NOT NULL,
        response_payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pub_idempotency_lookup ON publication_idempotency(owner_id, course_id, idempotency_key);
    `);
  }

  private computePayloadHash(options: PublishCourseOptions): string {
    const normalized = {
      expectedRevision: options.expectedRevision,
      changeSummary: (options.changeSummary || '').trim(),
    };
    return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  private verifyCourseOwner(userId: string, courseId: string): any {
    const course = this.db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    if (course.owner_id !== userId) {
      const user = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(userId) as any;
      const caps = user ? JSON.parse(user.capabilities || '[]') : [];
      if (!caps.includes('admin')) {
        throw new AuthorizationError('You do not have permission to publish this course');
      }
    }

    return course;
  }

  async publishCourse(
    userId: string,
    courseId: string,
    options: PublishCourseOptions
  ): Promise<PublicationReceipt> {
    const course = this.verifyCourseOwner(userId, courseId);

    // Check duplicate idempotency key in durable store
    if (options.idempotencyKey) {
      const existing = this.db
        .prepare(
          'SELECT owner_id, course_id, request_payload_hash, response_payload FROM publication_idempotency WHERE idempotency_key = ?'
        )
        .get(options.idempotencyKey) as
        | { owner_id: string; course_id: string; request_payload_hash: string; response_payload: string }
        | undefined;

      if (existing) {
        const payloadHash = this.computePayloadHash(options);
        if (
          existing.owner_id === userId &&
          existing.course_id === courseId &&
          existing.request_payload_hash === payloadHash
        ) {
          return JSON.parse(existing.response_payload) as PublicationReceipt;
        }
        throw new ConflictError(
          'Idempotency key has already been used with different publication parameters or course.'
        );
      }
    }

    // Step 1: Re-validate draft tree and reference solutions
    const validation = await this.validationService.validateCourseDraft(userId, courseId);
    if (!validation.isValid) {
      throw new ValidationError('Course validation failed with blocking errors', {
        errors: validation.errors,
      });
    }

    // Check revision
    if (course.draft_revision !== options.expectedRevision) {
      throw new StaleRevisionError(
        'The course draft has been modified since it was loaded. Please review changes before publishing.',
        course.draft_revision,
        { courseId }
      );
    }

    const now = new Date().toISOString();
    const versionId = crypto.randomUUID();

    // Step 2-5: Atomic Transaction
    this.db.exec('BEGIN IMMEDIATE');

    try {
      if (options.idempotencyKey) {
        const existingLocked = this.db
          .prepare(
            'SELECT owner_id, course_id, request_payload_hash, response_payload FROM publication_idempotency WHERE idempotency_key = ?'
          )
          .get(options.idempotencyKey) as
          | { owner_id: string; course_id: string; request_payload_hash: string; response_payload: string }
          | undefined;

        if (existingLocked) {
          const payloadHash = this.computePayloadHash(options);
          if (
            existingLocked.owner_id === userId &&
            existingLocked.course_id === courseId &&
            existingLocked.request_payload_hash === payloadHash
          ) {
            this.db.exec('ROLLBACK');
            return JSON.parse(existingLocked.response_payload) as PublicationReceipt;
          }
          throw new ConflictError(
            'Idempotency key has already been used with different publication parameters or course.'
          );
        }
      }

      // Re-verify course under lock
      const lockedCourse = this.db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
      if (lockedCourse.draft_revision !== options.expectedRevision) {
        throw new StaleRevisionError(
          'The course draft was modified concurrently. Publication cancelled.',
          lockedCourse.draft_revision,
          { courseId }
        );
      }

      // Next version number
      const maxRow = this.db
        .prepare('SELECT MAX(version_number) as max_v FROM course_versions WHERE course_id = ?')
        .get(courseId) as any;
      const nextVersionNumber = (maxRow?.max_v || 0) + 1;

      // Build complete snapshot tree
      const modules = this.db
        .prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC, created_at ASC')
        .all(courseId) as any[];

      const moduleSnapshots: ModuleSnapshot[] = [];

      for (const mod of modules) {
        const lessons = this.db
          .prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY position ASC, created_at ASC')
          .all(mod.id) as any[];

        const lessonSnapshots: LessonSnapshot[] = [];

        for (const lesson of lessons) {
          const steps = this.db
            .prepare('SELECT * FROM steps WHERE lesson_id = ? ORDER BY position ASC, created_at ASC')
            .all(lesson.id) as any[];

          const stepSnapshots: StepSnapshot[] = [];

          for (const step of steps) {
            const contentRow = this.db
              .prepare('SELECT content_payload FROM step_contents WHERE step_id = ?')
              .get(step.id) as any;

            let contentPayload: StepContentPayload = contentRow ? JSON.parse(contentRow.content_payload) : ({} as any);

            // If Python step, include test cases inside snapshot
            if (step.type === 'python') {
              const testCases = this.db
                .prepare('SELECT * FROM test_cases WHERE step_id = ? ORDER BY is_hidden ASC, position ASC')
                .all(step.id) as any[];

              (contentPayload as any).testCases = testCases.map((tc) => ({
                id: tc.id,
                stepId: tc.step_id,
                stdin: tc.stdin || '',
                expectedStdout: tc.expected_stdout || '',
                isHidden: Boolean(tc.is_hidden),
                position: tc.position,
                createdAt: tc.created_at,
              }));
            }

            stepSnapshots.push({
              id: step.id,
              type: step.type,
              title: step.title,
              position: step.position,
              isRequired: Boolean(step.is_required),
              estimatedDurationMinutes: step.estimated_duration_minutes || 5,
              content: contentPayload,
            });
          }

          lessonSnapshots.push({
            id: lesson.id,
            title: lesson.title,
            description: lesson.description || undefined,
            position: lesson.position,
            steps: stepSnapshots,
          });
        }

        moduleSnapshots.push({
          id: mod.id,
          title: mod.title,
          position: mod.position,
          lessons: lessonSnapshots,
        });
      }

      let tags: string[] = [];
      let outcomes: string[] = [];
      try {
        tags = JSON.parse(course.tags || '[]');
      } catch {
        tags = [];
      }
      try {
        outcomes = JSON.parse(course.learning_outcomes || '[]');
      } catch {
        outcomes = [];
      }

      const snapshot: CourseVersionSnapshot = {
        courseId: course.id,
        versionNumber: nextVersionNumber,
        title: course.title,
        description: course.description || '',
        categoryId: course.category_id,
        tags,
        difficulty: course.difficulty,
        language: course.language,
        learningOutcomes: outcomes,
        prerequisites: course.prerequisites || '',
        estimatedDurationMinutes: course.estimated_duration_minutes || 0,
        modules: moduleSnapshots,
        publishedAt: now,
      };

      // Insert course version
      this.db
        .prepare(
          'INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(versionId, courseId, nextVersionNumber, JSON.stringify(snapshot), now);

      // Update course current version & bump revision
      const nextRevision = course.draft_revision + 1;
      this.db
        .prepare(
          `UPDATE courses SET
            current_version_id = ?,
            publication_status = 'published',
            draft_revision = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(versionId, nextRevision, now, courseId);

      // Count students pinned to older versions
      const countRow = this.db
        .prepare(
          "SELECT COUNT(*) as count FROM enrollments WHERE course_id = ? AND pinned_version_id != ? AND status = 'active'"
        )
        .get(courseId, versionId) as any;
      const studentCountPinnedToOldVersions = countRow?.count || 0;

      // Record audit event
      const auditId = crypto.randomUUID();
      this.db
        .prepare(
          `INSERT INTO audit_events (
            id, actor_id, action, target_type, target_id, reason, metadata, correlation_id, created_at
          ) VALUES (?, ?, 'course:publish', 'course', ?, ?, ?, ?, ?)`
        )
        .run(
          auditId,
          userId,
          courseId,
          options.changeSummary || 'Course published',
          JSON.stringify({
            versionNumber: nextVersionNumber,
            versionId,
            previousVersionId: course.current_version_id,
          }),
          options.idempotencyKey || null,
          now
        );

      const receipt: PublicationReceipt = {
        versionNumber: nextVersionNumber,
        versionId,
        publishedAt: now,
        studentCountPinnedToOldVersions,
      };

      if (options.idempotencyKey) {
        const payloadHash = this.computePayloadHash(options);
        const pubIdempId = crypto.randomUUID();
        this.db
          .prepare(
            `INSERT INTO publication_idempotency (
              id, owner_id, course_id, idempotency_key, request_payload_hash, response_payload, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            pubIdempId,
            userId,
            courseId,
            options.idempotencyKey,
            payloadHash,
            JSON.stringify(receipt),
            now
          );
      }

      this.db.exec('COMMIT');

      return receipt;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Rollback if active
      }
      throw err;
    }
  }
}

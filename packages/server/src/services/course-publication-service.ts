import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
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
  private idempotencyCache: Map<string, PublicationReceipt> = new Map();

  constructor(db: DatabaseSync) {
    this.db = db;
    this.validationService = new CourseValidationService(db);
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

    // Check duplicate idempotency key
    if (options.idempotencyKey && this.idempotencyCache.has(options.idempotencyKey)) {
      return this.idempotencyCache.get(options.idempotencyKey)!;
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

      this.db.exec('COMMIT');

      const receipt: PublicationReceipt = {
        versionNumber: nextVersionNumber,
        versionId,
        publishedAt: now,
        studentCountPinnedToOldVersions,
      };

      if (options.idempotencyKey) {
        this.idempotencyCache.set(options.idempotencyKey, receipt);
      }

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

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
} from 'zur-shared';
import type { CourseSummary } from './course-service.ts';
import { CourseService } from './course-service.ts';

export class CourseLifecycleService {
  private db: DatabaseSync;
  private courseService: CourseService;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.courseService = new CourseService(db);
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
        throw new AuthorizationError('You do not have permission to modify this course');
      }
    }

    return course;
  }

  setCourseAccessPolicy(
    userId: string,
    courseId: string,
    settings: { visibility: any; enrollmentPolicy: any }
  ): CourseSummary {
    if (settings.visibility === 'private' && settings.enrollmentPolicy === 'open') {
      throw new ValidationError('Private courses must use invitation_only enrollment policy');
    }
    return this.courseService.updateCourseAccessSettings(userId, courseId, {
      visibility: settings.visibility,
      enrollmentPolicy: settings.enrollmentPolicy,
      strict: true,
    });
  }

  archiveCourse(userId: string, courseId: string): CourseSummary {
    this.verifyCourseOwner(userId, courseId);
    const now = new Date().toISOString();

    this.db
      .prepare(
        "UPDATE courses SET publication_status = 'archived', updated_at = ? WHERE id = ?"
      )
      .run(now, courseId);

    // Record audit event
    const auditId = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, actor_id, action, target_type, target_id, reason, metadata, created_at
        ) VALUES (?, ?, 'course:archive', 'course', ?, 'Course archived by author', NULL, ?)`
      )
      .run(auditId, userId, courseId, now);

    return this.courseService.getCourse(userId, courseId);
  }

  restoreCourse(userId: string, courseId: string): CourseSummary {
    const course = this.verifyCourseOwner(userId, courseId);
    const nextStatus = course.current_version_id ? 'published' : 'draft';
    const now = new Date().toISOString();

    this.db
      .prepare('UPDATE courses SET publication_status = ?, updated_at = ? WHERE id = ?')
      .run(nextStatus, now, courseId);

    // Record audit event
    const auditId = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, actor_id, action, target_type, target_id, reason, metadata, created_at
        ) VALUES (?, ?, 'course:restore', 'course', ?, 'Course restored by author', NULL, ?)`
      )
      .run(auditId, userId, courseId, now);

    return this.courseService.getCourse(userId, courseId);
  }

  deleteCourseDraft(userId: string, courseId: string): { success: boolean } {
    const course = this.verifyCourseOwner(userId, courseId);

    const versionRow = this.db
      .prepare('SELECT COUNT(*) as count FROM course_versions WHERE course_id = ?')
      .get(courseId) as any;

    if (versionRow?.count > 0 || course.current_version_id || course.publication_status !== 'draft') {
      throw new ConflictError('Cannot delete a course that has been published. Use archive instead.');
    }

    this.db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);

    return { success: true };
  }

  setCourseSuspension(
    adminUserId: string,
    courseId: string,
    isSuspended: boolean,
    reason?: string
  ): CourseSummary {
    const adminUser = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(adminUserId) as any;
    if (!adminUser) {
      throw new AuthorizationError('Admin access required');
    }
    const caps = JSON.parse(adminUser.capabilities || '[]');
    if (!caps.includes('admin')) {
      throw new AuthorizationError('Admin capability required to suspend or unsuspend courses');
    }

    const course = this.db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    const now = new Date().toISOString();
    const suspendedVal = isSuspended ? 1 : 0;

    this.db
      .prepare('UPDATE courses SET is_suspended = ?, updated_at = ? WHERE id = ?')
      .run(suspendedVal, now, courseId);

    const auditId = crypto.randomUUID();
    const action = isSuspended ? 'course:suspend' : 'course:unsuspend';
    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, actor_id, action, target_type, target_id, reason, metadata, created_at
        ) VALUES (?, ?, ?, 'course', ?, ?, NULL, ?)`
      )
      .run(auditId, adminUserId, action, courseId, reason || (isSuspended ? 'Suspended by admin' : 'Unsuspended by admin'), now);

    return this.courseService.getCourse(adminUserId, courseId);
  }
}

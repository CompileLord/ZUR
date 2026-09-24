import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
} from 'zur-shared';
import type { Enrollment, EnrollmentStatus } from 'zur-shared';

export interface StudentEnrollmentItem {
  id: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  courseDescription: string;
  difficulty: string;
  pinnedVersionId: string;
  pinnedVersionNumber: number;
  status: EnrollmentStatus;
  lastVisitedStepId?: string | null;
  createdAt: string;
  updatedAt: string;
  isSuspended: boolean;
  publicationStatus: string;
}

export interface RosterStudentItem {
  enrollmentId: string;
  studentId: string;
  displayName: string;
  email: string;
  status: EnrollmentStatus;
  pinnedVersionNumber: number;
  enrolledAt: string;
  updatedAt: string;
}

export class EnrollmentService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private checkCourseOwnerOrAdmin(actorId: string, courseId: string): void {
    const course = this.db
      .prepare('SELECT owner_id FROM courses WHERE id = ?')
      .get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    const user = this.db
      .prepare('SELECT capabilities FROM users WHERE id = ?')
      .get(actorId) as any;
    let capabilities: string[] = [];
    try {
      capabilities = JSON.parse(user?.capabilities || '[]');
    } catch {
      capabilities = [];
    }

    const isAdmin = capabilities.includes('admin');
    if (course.owner_id !== actorId && !isAdmin) {
      throw new AuthorizationError('You do not have permission to manage students for this course.');
    }
  }

  enrollStudent(
    userId: string,
    courseId: string,
    options?: { isDirectOpen?: boolean }
  ): Enrollment {
    const course = this.db
      .prepare(
        'SELECT id, current_version_id, publication_status, enrollment_policy, is_suspended FROM courses WHERE id = ?'
      )
      .get(courseId) as any;

    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    if (course.is_suspended === 1) {
      throw new AuthorizationError('This course is currently suspended.');
    }

    if (!course.current_version_id || course.publication_status !== 'published') {
      throw new ValidationError('Course has no published version to enroll in.');
    }

    const now = new Date().toISOString();
    const existing = this.db
      .prepare('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(userId, courseId) as any;

    if (existing) {
      if (existing.status === 'active') {
        return this.mapEnrollmentRow(existing);
      }

      if (existing.status === 'revoked') {
        throw new AuthorizationError(
          'Enrollment has been revoked. Reinstatement by course owner required.'
        );
      }

      if (existing.status === 'left') {
        if (course.enrollment_policy === 'invitation_only' && !options?.isDirectOpen) {
          throw new AuthorizationError('This course requires an invitation to enroll.');
        }

        // Rejoin: preserves all step_progress records
        this.db
          .prepare(
            'UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ?'
          )
          .run('active', now, existing.id);

        const updated = this.db
          .prepare('SELECT * FROM enrollments WHERE id = ?')
          .get(existing.id) as any;
        return this.mapEnrollmentRow(updated);
      }
    }

    // Direct open join check
    if (course.enrollment_policy === 'invitation_only' && !options?.isDirectOpen) {
      throw new AuthorizationError('This course requires an invitation to enroll.');
    }

    const enrollmentId = `enr-${crypto.randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO enrollments (
          id, user_id, course_id, pinned_version_id, status, last_visited_step_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', NULL, ?, ?)`
      )
      .run(enrollmentId, userId, courseId, course.current_version_id, now, now);

    const created = this.db
      .prepare('SELECT * FROM enrollments WHERE id = ?')
      .get(enrollmentId) as any;
    return this.mapEnrollmentRow(created);
  }

  leaveCourse(userId: string, courseId: string): Enrollment {
    const enrollment = this.db
      .prepare('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(userId, courseId) as any;

    if (!enrollment || enrollment.status !== 'active') {
      throw new ValidationError('No active enrollment found for this course.');
    }

    const now = new Date().toISOString();
    // Sets status to 'left', preserves all step_progress records
    this.db
      .prepare('UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ?')
      .run('left', now, enrollment.id);

    const updated = this.db
      .prepare('SELECT * FROM enrollments WHERE id = ?')
      .get(enrollment.id) as any;
    return this.mapEnrollmentRow(updated);
  }

  revokeStudent(ownerId: string, courseId: string, studentId: string): Enrollment {
    this.checkCourseOwnerOrAdmin(ownerId, courseId);

    const enrollment = this.db
      .prepare('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(studentId, courseId) as any;

    if (!enrollment) {
      throw new NotFoundError('Student enrollment not found.');
    }

    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ?')
      .run('revoked', now, enrollment.id);

    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, actor_id, action, target_type, target_id, reason, created_at
        ) VALUES (?, ?, 'enrollment.revoke', 'enrollment', ?, 'Revoked by course owner', ?)`
      )
      .run(crypto.randomUUID(), ownerId, enrollment.id, now);

    const updated = this.db
      .prepare('SELECT * FROM enrollments WHERE id = ?')
      .get(enrollment.id) as any;
    return this.mapEnrollmentRow(updated);
  }

  reinstateStudent(ownerId: string, courseId: string, studentId: string): Enrollment {
    this.checkCourseOwnerOrAdmin(ownerId, courseId);

    const enrollment = this.db
      .prepare('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(studentId, courseId) as any;

    if (!enrollment) {
      throw new NotFoundError('Student enrollment not found.');
    }

    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ?')
      .run('active', now, enrollment.id);

    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, actor_id, action, target_type, target_id, reason, created_at
        ) VALUES (?, ?, 'enrollment.reinstate', 'enrollment', ?, 'Reinstated by course owner', ?)`
      )
      .run(crypto.randomUUID(), ownerId, enrollment.id, now);

    const updated = this.db
      .prepare('SELECT * FROM enrollments WHERE id = ?')
      .get(enrollment.id) as any;
    return this.mapEnrollmentRow(updated);
  }

  getEnrollment(userId: string, courseId: string): Enrollment | null {
    const row = this.db
      .prepare('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(userId, courseId) as any;
    return row ? this.mapEnrollmentRow(row) : null;
  }

  getEnrollmentById(enrollmentId: string): Enrollment | null {
    const row = this.db
      .prepare('SELECT * FROM enrollments WHERE id = ?')
      .get(enrollmentId) as any;
    return row ? this.mapEnrollmentRow(row) : null;
  }

  listStudentEnrollments(userId: string): StudentEnrollmentItem[] {
    const rows = this.db
      .prepare(
        `SELECT
          e.id,
          e.user_id,
          e.course_id,
          e.pinned_version_id,
          e.status,
          e.last_visited_step_id,
          e.created_at,
          e.updated_at,
          c.title AS course_title,
          c.description AS course_description,
          c.difficulty,
          c.is_suspended,
          c.publication_status,
          cv.version_number AS pinned_version_number
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        JOIN course_versions cv ON e.pinned_version_id = cv.id
        WHERE e.user_id = ?
        ORDER BY e.updated_at DESC`
      )
      .all(userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      courseId: r.course_id,
      courseTitle: r.course_title,
      courseDescription: r.course_description,
      difficulty: r.difficulty,
      pinnedVersionId: r.pinned_version_id,
      pinnedVersionNumber: r.pinned_version_number,
      status: r.status as EnrollmentStatus,
      lastVisitedStepId: r.last_visited_step_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      isSuspended: Boolean(r.is_suspended),
      publicationStatus: r.publication_status,
    }));
  }

  listCourseEnrollments(ownerId: string, courseId: string): RosterStudentItem[] {
    this.checkCourseOwnerOrAdmin(ownerId, courseId);

    const rows = this.db
      .prepare(
        `SELECT
          e.id AS enrollment_id,
          e.user_id AS student_id,
          e.status,
          e.created_at AS enrolled_at,
          e.updated_at,
          u.display_name,
          u.email,
          cv.version_number AS pinned_version_number
        FROM enrollments e
        JOIN users u ON e.user_id = u.id
        JOIN course_versions cv ON e.pinned_version_id = cv.id
        WHERE e.course_id = ?
        ORDER BY e.created_at DESC`
      )
      .all(courseId) as any[];

    return rows.map((r) => ({
      enrollmentId: r.enrollment_id,
      studentId: r.student_id,
      displayName: r.display_name,
      email: r.email,
      status: r.status as EnrollmentStatus,
      pinnedVersionNumber: r.pinned_version_number,
      enrolledAt: r.enrolled_at,
      updatedAt: r.updated_at,
    }));
  }

  private mapEnrollmentRow(row: any): Enrollment {
    return {
      id: row.id,
      userId: row.user_id,
      courseId: row.course_id,
      pinnedVersionId: row.pinned_version_id,
      status: row.status as EnrollmentStatus,
      lastVisitedStepId: row.last_visited_step_id ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

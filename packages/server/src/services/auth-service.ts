import { DatabaseSync } from 'node:sqlite';
import { NotFoundError, AuthorizationError } from 'zur-shared';

export interface UserContext {
  userId?: string | null;
  capabilities: ('student' | 'author' | 'admin')[];
  isSuspended: boolean;
}

export interface CourseAccess {
  allowed: boolean;
  role: 'visitor' | 'student' | 'owner' | 'admin';
  isEnrolled: boolean;
  pinnedVersionId?: string | null;
  course?: any;
}

export class AuthorizationService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /**
   * Safe unknown-resource denial (PRD §6, §17, AC-05, design P42)
   * Prevents leaking whether a private course, asset, draft, or submission exists.
   */
  safeNotFound(): NotFoundError {
    return new NotFoundError("This page isn't available.");
  }

  /**
   * Check access to a course (P02, P03, P11, P22, etc.)
   */
  getCourseAccess(user: UserContext, courseId: string): CourseAccess {
    if (user.isSuspended && !user.capabilities.includes('admin')) {
      return { allowed: false, role: 'visitor', isEnrolled: false };
    }

    const course = this.db.prepare(`
      SELECT id, owner_id, title, visibility, enrollment_policy, publication_status, is_suspended, current_version_id
      FROM courses WHERE id = ?
    `).get(courseId) as any;

    if (!course) {
      return { allowed: false, role: 'visitor', isEnrolled: false };
    }

    // Admin support review is confined to the dedicated records page, which shows the grant reason and expiry.
    if (user.capabilities.includes('admin')) {
      return { allowed: false, role: 'visitor', isEnrolled: false };
    }

    // Owner access
    if (user.userId && course.owner_id === user.userId) {
      return { allowed: true, role: 'owner', isEnrolled: false, course };
    }

    // Course suspended: non-admins cannot access
    if (course.is_suspended) {
      return { allowed: false, role: 'visitor', isEnrolled: false, course };
    }

    // Check enrollment
    let enrollment: any = null;
    if (user.userId) {
      enrollment = this.db.prepare(`
        SELECT id, pinned_version_id, status FROM enrollments
        WHERE user_id = ? AND course_id = ?
      `).get(user.userId, courseId);
    }

    const isEnrolled = Boolean(enrollment && enrollment.status === 'active');

    // Private courses: only owner, admin, or enrolled students
    if (course.visibility === 'private' && !isEnrolled) {
      return { allowed: false, role: 'visitor', isEnrolled: false };
    }

    return {
      allowed: true,
      role: isEnrolled ? 'student' : 'visitor',
      isEnrolled,
      pinnedVersionId: enrollment ? enrollment.pinned_version_id : null,
      course,
    };
  }

  /**
   * Check access to a student's submission / attempt (AC-05, PRD §6)
   * Students can view own submissions; course owners can view submissions in owned courses; admins with audited support access.
   */
  canAccessAttempt(user: UserContext, attemptId: string): boolean {
    if (user.isSuspended && !user.capabilities.includes('admin')) {
      return false;
    }

    const attempt = this.db.prepare(`
      SELECT a.id, a.user_id, e.course_id, c.owner_id
      FROM assessment_attempts a
      JOIN enrollments e ON a.enrollment_id = e.id
      JOIN courses c ON e.course_id = c.id
      WHERE a.id = ?
    `).get(attemptId) as any;

    if (!attempt) {
      return false;
    }

    // Student viewing own attempt
    if (user.userId && attempt.user_id === user.userId) {
      return true;
    }

    // Course owner viewing attempt in owned course
    if (user.userId && attempt.owner_id === user.userId) {
      return true;
    }

    return false;
  }

  /**
   * Check access to media asset (PRD §11, §17, §23.5)
   */
  canAccessAsset(user: UserContext, assetId: string): boolean {
    const asset = this.db.prepare(`
      SELECT id, course_id, processing_status FROM media_assets WHERE id = ?
    `).get(assetId) as any;

    if (!asset || asset.processing_status === 'quarantined') {
      return false;
    }

    const courseAccess = this.getCourseAccess(user, asset.course_id);
    return courseAccess.allowed;
  }
}

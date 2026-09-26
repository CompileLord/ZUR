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

    if (!asset || asset.processing_status !== 'ready') {
      return false;
    }

    const courseAccess = this.getCourseAccess(user, asset.course_id);
    if (!courseAccess.allowed) return false;
    // Public course descriptions do not support image assets. Course bodies remain
    // enrollment-only even when their syllabus is publicly visible.
    if (courseAccess.role === 'visitor') return false;
    // Students may only fetch media referenced by the immutable version pinned to
    // their enrollment. This prevents a leaked UUID from exposing private uploads.
    if (courseAccess.role === 'owner') return true;
    const versionId = courseAccess.role === 'student'
      ? courseAccess.pinnedVersionId
      : null;
    if (!versionId) return false;
    const row = this.db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ? AND course_id = ?').get(versionId, asset.course_id) as any;
    if (!row) return false;
    let snapshot: any;
    try { snapshot = JSON.parse(row.snapshot_data); } catch { return false; }
    const references = (value: any): boolean => {
      if (typeof value === 'string') {
        const expression = /zur-asset:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?=$|[)\s])/gi;
        for (const match of value.matchAll(expression)) {
          if (match[1].toLowerCase() === assetId.toLowerCase()) return true;
        }
        return false;
      }
      if (Array.isArray(value)) return value.some(references);
      if (!value || typeof value !== 'object') return false;
      if (value.assetId === assetId || value.asset_id === assetId) return true;
      return Object.values(value).some(references);
    };
    const enrollment = this.db.prepare(`
      SELECT id FROM enrollments
      WHERE user_id = ? AND course_id = ? AND pinned_version_id = ? AND status = 'active'
    `).get(user.userId, asset.course_id, versionId) as any;
    if (!enrollment) return false;

    for (const module of snapshot.modules || []) {
      for (const lesson of module.lessons || []) {
        for (const step of lesson.steps || []) {
          if (!step || typeof step !== 'object') continue;
          let content = step.content == null ? null : JSON.parse(JSON.stringify(step.content));
          if (!content || typeof content !== 'object') continue;

          if (step.type === 'python') {
            delete content.referenceSolution;
            if (Array.isArray(content.testCases)) {
              content.testCases = content.testCases
                .filter((testCase: any) => !testCase.isHidden)
                .map((testCase: any) => ({
                  id: testCase.id,
                  stdin: testCase.stdin,
                  expectedStdout: testCase.expectedStdout,
                  position: testCase.position,
                }));
            }
          } else if (step.type === 'quiz') {
            const progress = this.db.prepare(`
              SELECT is_completed, is_waived FROM step_progress
              WHERE enrollment_id = ? AND step_id = ?
            `).get(enrollment.id, step.id) as any;
            const isCompleted = Boolean(progress?.is_completed || progress?.is_waived);
            if (!isCompleted) {
              content = {
                ...content,
                options: (content.options || []).map((option: any) => ({ id: option.id, text: option.text })),
                explanation: undefined,
              };
            }
          }

          if (references(content)) return true;
        }
      }
    }
    return false;
  }
}

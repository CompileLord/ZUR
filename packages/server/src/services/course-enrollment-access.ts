import crypto from 'node:crypto';
import { ValidationError, AuthorizationError, NotFoundError } from 'zur-shared';
import { CourseReports } from './course-reports.ts';

/** Learner enrollment, enrolled step content and the author roster view. */
export abstract class CourseEnrollmentAccess extends CourseReports {
  enrollStudent(userId: string, courseId: string, invitationToken?: string): any {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      throw new NotFoundError("This page isn't available.");
    }
    if (!user.email_verified) {
      throw new ValidationError('Email verification is required before enrolling in courses');
    }

    const course = this.db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId) as any;
    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    if (course.is_suspended) {
      throw new AuthorizationError('Course access is suspended.');
    }

    if (course.publication_status !== 'published' || !course.current_version_id) {
      throw new ValidationError('This course is not available for enrollment.');
    }

    if (course.enrollment_policy === 'invitation_only') {
      if (!invitationToken) {
        throw new AuthorizationError('This course requires an invitation to enroll.');
      }
      const tokenHash = crypto.createHash('sha256').update(invitationToken).digest('hex');
      const invite = this.db
        .prepare('SELECT * FROM invitations WHERE (token_hash = ? OR id = ?) AND course_id = ? AND is_revoked = 0')
        .get(tokenHash, invitationToken, courseId) as any;
      if (!invite) {
        throw new AuthorizationError('Invalid or expired invitation token.');
      }
      if (new Date(invite.expires_at) < new Date()) {
        throw new AuthorizationError('This invitation has expired.');
      }
      if (invite.max_uses && invite.uses_count >= invite.max_uses) {
        throw new AuthorizationError('This invitation has reached its usage limit.');
      }
      this.db
        .prepare('UPDATE invitations SET uses_count = uses_count + 1 WHERE id = ?')
        .run(invite.id);
    }

    const existing = this.db
      .prepare('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(userId, courseId) as any;

    const now = new Date().toISOString();

    if (existing) {
      if (existing.status === 'active') {
        return existing;
      }
      if (existing.status === 'revoked') {
        throw new AuthorizationError('Your access to this course was revoked. Please contact the course author.');
      }
      if (existing.status === 'left') {
        this.db
          .prepare("UPDATE enrollments SET status = 'active', updated_at = ? WHERE id = ?")
          .run(now, existing.id);
        return {
          ...existing,
          status: 'active',
          updated_at: now,
        };
      }
    }

    const enrollmentId = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(enrollmentId, userId, courseId, course.current_version_id, now, now);

    return {
      id: enrollmentId,
      userId,
      courseId,
      pinnedVersionId: course.current_version_id,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  }

  getEnrolledStepContent(userId: string, enrollmentId: string, stepId: string, options: { includeQuizAnswers?: boolean } = {}): any {
    const enrollment = this.db
      .prepare('SELECT * FROM enrollments WHERE id = ?')
      .get(enrollmentId) as any;

    if (!enrollment || enrollment.user_id !== userId || enrollment.status !== 'active') {
      throw new NotFoundError("This page isn't available.");
    }

    const course = this.db
      .prepare('SELECT is_suspended FROM courses WHERE id = ?')
      .get(enrollment.course_id) as any;

    if (!course || course.is_suspended) {
      throw new AuthorizationError('Course access is suspended.');
    }

    const snapshot = this.getCourseVersionSnapshot(enrollment.pinned_version_id);

    let foundStep: any = null;
    let foundLesson: any = null;
    let foundModule: any = null;

    for (const mod of snapshot.modules || []) {
      for (const les of mod.lessons || []) {
        for (const st of les.steps || []) {
          if (st.id === stepId) {
            foundStep = st;
            foundLesson = les;
            foundModule = mod;
            break;
          }
        }
        if (foundStep) break;
      }
      if (foundStep) break;
    }

    if (!foundStep) {
      throw new NotFoundError("This page isn't available.");
    }

    const content = foundStep.content == null ? null : JSON.parse(JSON.stringify(foundStep.content));
    if (foundStep.type === 'python' && content) {
      delete content.referenceSolution;
      if (Array.isArray(content.testCases)) {
        content.testCases = content.testCases
          .filter((tc: any) => !tc.isHidden)
          .map((tc: any) => ({
            id: tc.id,
            stdin: tc.stdin,
            expectedStdout: tc.expectedStdout,
            position: tc.position,
          }));
      }
    }
    // Answer keys never leave through this generic content path (PRD 11.2).
    if (foundStep.type === 'quiz' && content && !options.includeQuizAnswers) {
      content.options = (content.options || []).map((o: any) => ({ id: o.id, text: o.text }));
      delete content.explanation;
    }

    return {
      courseId: snapshot.courseId,
      courseTitle: snapshot.title,
      pinnedVersionNumber: snapshot.versionNumber,
      moduleId: foundModule.id,
      lessonId: foundLesson.id,
      step: {
        id: foundStep.id,
        type: foundStep.type,
        title: foundStep.title,
        position: foundStep.position,
        isRequired: foundStep.isRequired,
        estimatedDurationMinutes: foundStep.estimatedDurationMinutes,
      },
      content,
    };
  }

  getCourseRoster(userId: string, courseId: string): any[] {
    this.getCourse(userId, courseId);

    const rows = this.db
      .prepare(
        `SELECT
          e.id as enrollment_id,
          e.user_id,
          u.display_name,
          u.email,
          e.pinned_version_id,
          cv.version_number as pinned_version_number,
          e.status,
          e.created_at,
          e.updated_at
        FROM enrollments e
        JOIN users u ON e.user_id = u.id
        JOIN course_versions cv ON e.pinned_version_id = cv.id
        WHERE e.course_id = ?
        ORDER BY e.created_at DESC`
      )
      .all(courseId) as any[];

    return rows.map((r) => ({
      enrollmentId: r.enrollment_id,
      userId: r.user_id,
      displayName: r.display_name,
      email: r.email,
      pinnedVersionId: r.pinned_version_id,
      pinnedVersionNumber: r.pinned_version_number,
      status: r.status,
      enrolledAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }
}

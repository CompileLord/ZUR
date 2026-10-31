import crypto from 'node:crypto';
import { ValidationError, NotFoundError } from 'zur-shared';
import { CoursePublicCatalog } from './course-public-catalog.ts';

/** Learner/author issue reports (broken exercise, inappropriate content, other). */
export abstract class CourseReports extends CoursePublicCatalog {
  createReport(
    reporterId: string,
    data: {
      courseId: string;
      courseVersionId?: string;
      stepId?: string;
      type: string;
      description: string;
      includeCodeConsent?: boolean;
      includeCode?: boolean;
    }
  ): { id: string; reference: string; status: string } {
    if (!data.type || !['broken_exercise', 'inappropriate_content', 'other'].includes(data.type)) {
      throw new ValidationError('Invalid report type. Must be broken_exercise, inappropriate_content, or other.');
    }

    const description = typeof data.description === 'string' ? data.description.trim() : '';
    if (description.length === 0) {
      throw new ValidationError('Report description is required.');
    }
    if (description.length > 5000) {
      throw new ValidationError('Report description must not exceed 5000 characters.');
    }

    if (!data.courseId || typeof data.courseId !== 'string') {
      throw new ValidationError('Course reference is required to submit a report.');
    }

    // 1. Verify Course and Caller Access (Preserve Safe Unknown-Resource Responses)
    const course = this.db.prepare(
      'SELECT id, owner_id, visibility, publication_status, is_suspended, current_version_id FROM courses WHERE id = ?'
    ).get(data.courseId) as any;

    if (!course) {
      throw new NotFoundError("This page isn't available.");
    }

    // Check reporter capabilities
    const reporterUser = this.db.prepare('SELECT capabilities FROM users WHERE id = ?').get(reporterId) as any;
    const reporterCaps: string[] = reporterUser ? JSON.parse(reporterUser.capabilities || '[]') : [];
    const isAdmin = reporterCaps.includes('admin');
    const isOwner = course.owner_id === reporterId;

    // Check enrollment
    const enrollment = this.db.prepare(
      'SELECT id, pinned_version_id, status FROM enrollments WHERE user_id = ? AND course_id = ?'
    ).get(reporterId, data.courseId) as any;
    const isEnrolled = Boolean(enrollment && enrollment.status === 'active');

    let effectiveVersionId: string | null = null;
    let validatedStepId: string | null = null;
    let authorizedCode: string | null = null;

    if (isEnrolled) {
      // 2A. Enrolled student context:
      // Must use pinned version V; ignore/reject forged versions.
      effectiveVersionId = enrollment.pinned_version_id;
      if (data.courseVersionId && data.courseVersionId !== effectiveVersionId) {
        throw new NotFoundError("This page isn't available.");
      }

      // "Validate step against V's immutable snapshot"
      if (data.stepId) {
        if (typeof data.stepId !== 'string') {
          throw new NotFoundError("This page isn't available.");
        }
        if (!effectiveVersionId) {
          throw new NotFoundError("This page isn't available.");
        }

        const snapshot = this.getCourseVersionSnapshot(effectiveVersionId);
        let stepInSnapshot = false;
        for (const mod of snapshot.modules || []) {
          for (const les of mod.lessons || []) {
            for (const st of les.steps || []) {
              if (st.id === data.stepId) {
                stepInSnapshot = true;
                break;
              }
            }
            if (stepInSnapshot) break;
          }
          if (stepInSnapshot) break;
        }

        if (!stepInSnapshot) {
          throw new NotFoundError("This page isn't available.");
        }
        validatedStepId = data.stepId;
      }

      // "bind any included code to the reporter's enrollment and authorized version."
      const hasCodeConsent = Boolean(data.includeCodeConsent ?? data.includeCode);
      if (hasCodeConsent && validatedStepId) {
        const draftRow = this.db.prepare(
          'SELECT code FROM code_drafts WHERE user_id = ? AND enrollment_id = ? AND step_id = ? ORDER BY id DESC LIMIT 1'
        ).get(reporterId, enrollment.id, validatedStepId) as any;

        if (draftRow?.code) {
          authorizedCode = draftRow.code;
        } else if (effectiveVersionId) {
          const attemptRow = this.db.prepare(
            'SELECT code_snapshot FROM assessment_attempts WHERE user_id = ? AND enrollment_id = ? AND course_version_id = ? AND step_id = ? ORDER BY created_at DESC LIMIT 1'
          ).get(reporterId, enrollment.id, effectiveVersionId, validatedStepId) as any;

          if (attemptRow?.code_snapshot) {
            authorizedCode = attemptRow.code_snapshot;
          }
        }
      }
    } else if (isOwner || isAdmin) {
      // 2B. Course author or administrator
      effectiveVersionId = course.current_version_id || null;
      if (data.courseVersionId) {
        const vRow = this.db.prepare(
          'SELECT id FROM course_versions WHERE id = ? AND course_id = ?'
        ).get(data.courseVersionId, data.courseId) as any;
        if (!vRow) throw new NotFoundError("This page isn't available.");
        effectiveVersionId = vRow.id;
      }

      if (data.stepId) {
        if (typeof data.stepId !== 'string') throw new NotFoundError("This page isn't available.");
        const stepRow = this.db.prepare(`
          SELECT s.id FROM steps s
          JOIN lessons l ON s.lesson_id = l.id
          JOIN modules m ON l.module_id = m.id
          WHERE s.id = ? AND m.course_id = ?
        `).get(data.stepId, data.courseId) as any;

        if (stepRow) {
          validatedStepId = stepRow.id;
        } else if (effectiveVersionId) {
          try {
            const snap = this.getCourseVersionSnapshot(effectiveVersionId);
            for (const mod of snap.modules || []) {
              for (const les of mod.lessons || []) {
                for (const st of les.steps || []) {
                  if (st.id === data.stepId) validatedStepId = st.id;
                }
              }
            }
          } catch {}
        }
        if (!validatedStepId) throw new NotFoundError("This page isn't available.");
      }
    } else {
      // 2C. Public/unlisted visitor who is signed in but not enrolled:
      // "allow only course-level inappropriate-content reports on visible published courses, not step/code reports or arbitrary old-version references. Avoid trusting client-supplied version."
      const isVisible = course.publication_status === 'published' &&
        (course.visibility === 'public' || course.visibility === 'unlisted') &&
        !course.is_suspended;

      if (!isVisible) {
        throw new NotFoundError("This page isn't available.");
      }

      if (data.stepId) {
        throw new NotFoundError("This page isn't available.");
      }

      if (data.courseVersionId && data.courseVersionId !== course.current_version_id) {
        throw new NotFoundError("This page isn't available.");
      }

      if (data.type !== 'inappropriate_content') {
        throw new ValidationError('Non-enrolled users can only submit course-level inappropriate content reports.');
      }

      effectiveVersionId = course.current_version_id || null;
      validatedStepId = null;
      authorizedCode = null;
    }

    const duplicate = this.db.prepare(
      `SELECT id FROM reports WHERE reporter_id = ? AND course_id = ? AND step_id IS ? AND type = ? AND description = ? AND status = 'open'`
    ).get(reporterId, data.courseId, validatedStepId, data.type, description) as { id: string } | undefined;
    if (duplicate) return { id: duplicate.id, reference: duplicate.id, status: 'open' };

    const reportId = `rep-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO reports (
          id, reporter_id, course_id, course_version_id, step_id, type, description, submitted_code, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      )
      .run(
        reportId,
        reporterId,
        data.courseId,
        effectiveVersionId,
        validatedStepId,
        data.type,
        description,
        authorizedCode,
        now,
        now
      );

    return { id: reportId, reference: reportId, status: 'open' };
  }
}

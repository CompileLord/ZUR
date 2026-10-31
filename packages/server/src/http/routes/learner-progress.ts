import { AuthenticationError, AuthorizationError, NotFoundError, ValidationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Hint reveal, course progress, student dashboard, my courses and enrolled step view.
export async function handleLearnerProgressRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, pathname, method, token, db, identityService, authService, courseService, enrollmentService, learningProgressService, parseJsonBody, sendJson, recordProductEvent } = rc;

  // 62b. Record Hint Reveal (T076)
  const hintRevealMatch = pathname.match(
    /^\/api\/enrollments\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)\/hint-reveal$/
  );
  if (method === 'POST' && hintRevealMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const enrollmentId = hintRevealMatch[1];
    const stepId = hintRevealMatch[2];

    const enrollment = db
      .prepare('SELECT user_id, status, course_id, pinned_version_id FROM enrollments WHERE id = ?')
      .get(enrollmentId) as { user_id: string; status: string; course_id: string; pinned_version_id: string } | undefined;
    if (!enrollment || enrollment.user_id !== user.id || enrollment.status !== 'active') {
      throw new NotFoundError("This page isn't available.");
    }

    const course = db.prepare('SELECT is_suspended FROM courses WHERE id = ?').get(enrollment.course_id) as { is_suspended: number } | undefined;
    if (!course || course.is_suspended) {
      throw new AuthorizationError('Course access is suspended.');
    }

    // Verify step exists in the enrollment's pinned version snapshot
    const versionRow = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(enrollment.pinned_version_id) as { snapshot_data: string } | undefined;
    if (!versionRow || !versionRow.snapshot_data) {
      throw new NotFoundError("This page isn't available.");
    }

    let snapshot: any;
    try {
      snapshot = JSON.parse(versionRow.snapshot_data);
    } catch {
      throw new NotFoundError("This page isn't available.");
    }

    let foundStep: any = null;
    for (const mod of snapshot.modules || []) {
      for (const les of mod.lessons || []) {
        for (const st of les.steps || []) {
          if (st.id === stepId) {
            foundStep = st;
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

    // Hint eligibility comes only from the immutable version pinned to this enrollment.
    const hints = foundStep.type === 'python' && Array.isArray(foundStep.content?.hints)
      ? foundStep.content.hints
      : [];
    if (hints.length === 0) {
      throw new ValidationError('This exercise does not have any hints.');
    }

    const body = await parseJsonBody(req);
    const hintIndex = body?.hintIndex;
    if (!Number.isInteger(hintIndex) || hintIndex < 0 || hintIndex >= hints.length) {
      throw new ValidationError(`Invalid hint index: must be between 0 and ${hints.length - 1}.`);
    }

    recordProductEvent({
      eventName: 'hint.revealed',
      userId: user.id,
      enrollmentId,
      stepId,
      idempotencyKey: `${enrollmentId}:${enrollment.pinned_version_id}:${stepId}:${hintIndex}`,
      metadata: { hintIndex },
    });

    sendJson(res, 200, { success: true, hintIndex });
    return true;
  }

  // 63. Get Course Progress (T047)
  const progressMatch = pathname.match(/^\/api\/enrollments\/([a-zA-Z0-9_-]+)\/progress$/);
  if (method === 'GET' && progressMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const enrollmentId = progressMatch[1];
    const progress = learningProgressService.getCourseProgress(user.id, enrollmentId);
    sendJson(res, 200, progress);
    return true;
  }

  // 64. Student Dashboard (T048, P09)
  if (method === 'GET' && pathname === '/api/student/dashboard') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const enrollments = enrollmentService.listStudentEnrollments(user.id);
    const activeEnrollments = enrollments.filter((e) => e.status === 'active' && !e.isSuspended);

    const coursesWithProgress = activeEnrollments.map((enr) => {
      const prog = learningProgressService.getCourseProgress(user.id, enr.id);
      return {
        enrollment: enr,
        progress: prog,
      };
    });

    const continueItem =
      coursesWithProgress.find((c) => !c.progress.isCompleted) ||
      coursesWithProgress[0] ||
      null;

    sendJson(res, 200, {
      continueCourse: continueItem
        ? {
            courseId: continueItem.enrollment.courseId,
            enrollmentId: continueItem.enrollment.id,
            title: continueItem.enrollment.courseTitle,
            description: continueItem.enrollment.courseDescription,
            pinnedVersionNumber: continueItem.enrollment.pinnedVersionNumber,
            percentage: continueItem.progress.percentage,
            completedRequired: continueItem.progress.completedRequired,
            totalRequired: continueItem.progress.totalRequired,
            isCompleted: continueItem.progress.isCompleted,
            nextIncompleteStepId: continueItem.progress.nextIncompleteStepId,
            lastVisitedStepId: continueItem.progress.lastVisitedStepId,
          }
        : null,
      recentCourses: coursesWithProgress.slice(0, 5).map((c) => ({
        courseId: c.enrollment.courseId,
        enrollmentId: c.enrollment.id,
        title: c.enrollment.courseTitle,
        description: c.enrollment.courseDescription,
        difficulty: c.enrollment.difficulty,
        level: c.enrollment.difficulty,
        pinnedVersionNumber: c.enrollment.pinnedVersionNumber,
        lastActivityAt: c.enrollment.updatedAt,
        completedRequired: c.progress.completedRequired,
        totalRequired: c.progress.totalRequired,
        percentage: c.progress.percentage,
        isCompleted: c.progress.isCompleted,
        status: c.enrollment.status,
        updatedAt: c.enrollment.updatedAt,
        nextStepId: c.progress.nextIncompleteStepId || c.progress.lastVisitedStepId,
      })),
    });
    return true;
  }

  // 65. Student My Courses (T048, P10)
  if (method === 'GET' && pathname === '/api/student/courses') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const enrollments = enrollmentService.listStudentEnrollments(user.id);
    const results = enrollments.map((enr) => {
      let prog: any = null;
      try {
        prog = learningProgressService.getCourseProgress(user.id, enr.id);
      } catch {
        prog = null;
      }
      return {
        ...enr,
        level: enr.difficulty,
        lastActivityAt: enr.updatedAt,
        progress: prog
          ? {
              percentage: prog.percentage,
              completedRequired: prog.completedRequired,
              totalRequired: prog.totalRequired,
              isCompleted: prog.isCompleted,
              nextIncompleteStepId: prog.nextIncompleteStepId,
              lastVisitedStepId: prog.lastVisitedStepId,
            }
          : null,
      };
    });
    sendJson(res, 200, { enrollments: results });
    return true;
  }

  // 66. Get Enrolled Step View (T049, T050, T051)
  const enrolledStepMatch = pathname.match(
    /^\/api\/enrollments\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)$/
  );
  if (method === 'GET' && enrolledStepMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const enrollmentId = enrolledStepMatch[1];
    const stepId = enrolledStepMatch[2];

    // Reuse the strict enrollment-state and pinned-snapshot authorization path
    // before exposing even step metadata/content to a learner.
    const progress = learningProgressService.getCourseProgress(user.id, enrollmentId);
    const stepMeta = progress.steps.find((s) => s.id === stepId);
    if (!stepMeta) throw authService.safeNotFound();
    const enrolledSnapshot = courseService.getEnrolledStepContent(user.id, enrollmentId, stepId, { includeQuizAnswers: stepMeta.isCompleted });

    const stepIdx = progress.steps.findIndex((s) => s.id === stepId);
    const previousStepId = stepIdx > 0 ? progress.steps[stepIdx - 1].id : null;
    const nextStepId = stepIdx < progress.steps.length - 1 ? progress.steps[stepIdx + 1].id : null;

    learningProgressService.recordStepVisit(user.id, enrollmentId, stepId);

    let studentContent = enrolledSnapshot.content;
    if (stepMeta.type === 'quiz' && studentContent && !stepMeta.isCompleted) {
      studentContent = {
        ...studentContent,
        options: (studentContent.options || []).map((o: any) => ({
          id: o.id,
          text: o.text,
        })),
        explanation: undefined,
      };
    }

    sendJson(res, 200, {
      step: {
        id: enrolledSnapshot.step.id,
        type: enrolledSnapshot.step.type,
        title: enrolledSnapshot.step.title,
        position: enrolledSnapshot.step.position,
        isRequired: enrolledSnapshot.step.isRequired,
        estimatedDurationMinutes: enrolledSnapshot.step.estimatedDurationMinutes,
        content: studentContent,
      },
      stepMeta,
      progress,
      previousStepId,
      nextStepId,
      courseTitle: progress.courseTitle,
      courseId: progress.courseId,
      courseVersionId: progress.pinnedVersionId,
      enrollmentId,
    });
    return true;
  }

  return false;
}

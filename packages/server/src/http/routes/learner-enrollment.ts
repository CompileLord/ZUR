import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Enroll, leave, revoke/reinstate, invitation accept and step completion/visit.
export async function handleLearnerEnrollmentRoutes(rc: RouteContext): Promise<boolean> {
  const { res, pathname, method, token, db, identityService, enrollmentService, invitationService, learningProgressService, sendJson, recordProductEvent } = rc;

  // --- Module S2-M03: Enrollment, Learning, and Completion (T045-T048) ---

  // 51. Enroll in course (T045)
  const enrollMatch = pathname.match(/^\/api\/courses\/([a-zA-Z0-9_-]+)\/enroll$/);
  if (method === 'POST' && enrollMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = enrollMatch[1];
    const priorEnrollment = db.prepare('SELECT id, status FROM enrollments WHERE user_id = ? AND course_id = ?').get(user.id, courseId) as { id: string; status: string } | undefined;
    const enrollment = enrollmentService.enrollStudent(user.id, courseId);
    if (!priorEnrollment || priorEnrollment.status !== 'active') recordProductEvent({ eventName: 'enrollment.accepted', userId: user.id, enrollmentId: enrollment.id });
    sendJson(res, 200, { enrollment });
    return true;
  }

  // 52. Leave course (T045)
  const leaveMatch = pathname.match(/^\/api\/courses\/([a-zA-Z0-9_-]+)\/leave$/);
  if (method === 'POST' && leaveMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = leaveMatch[1];
    const enrollment = enrollmentService.leaveCourse(user.id, courseId);
    sendJson(res, 200, { enrollment });
    return true;
  }

  // 53. Revoke student (T045)
  const revokeStudentMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/students\/([a-zA-Z0-9_-]+)\/revoke$/
  );
  if (method === 'POST' && revokeStudentMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = revokeStudentMatch[1];
    const studentId = revokeStudentMatch[2];
    const enrollment = enrollmentService.revokeStudent(user.id, courseId, studentId);
    sendJson(res, 200, { enrollment });
    return true;
  }

  // 54. Reinstate student (T045)
  const reinstateStudentMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/students\/([a-zA-Z0-9_-]+)\/reinstate$/
  );
  if (method === 'POST' && reinstateStudentMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = reinstateStudentMatch[1];
    const studentId = reinstateStudentMatch[2];
    const enrollment = enrollmentService.reinstateStudent(user.id, courseId, studentId);
    sendJson(res, 200, { enrollment });
    return true;
  }

  // 59. Preview Invitation (T046)
  const previewInviteMatch = pathname.match(/^\/api\/invitations\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && previewInviteMatch) {
    const inviteToken = previewInviteMatch[1];
    const preview = invitationService.getInvitationPreview(inviteToken);
    sendJson(res, 200, preview);
    return true;
  }

  // 60. Accept Invitation (T046)
  const acceptInviteMatch = pathname.match(/^\/api\/invitations\/([a-zA-Z0-9_-]+)\/accept$/);
  if (method === 'POST' && acceptInviteMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const inviteToken = acceptInviteMatch[1];
    const result = invitationService.acceptInvitation(user.id, inviteToken);
    if (result.enrollment?.id) recordProductEvent({ eventName: 'enrollment.accepted', userId: user.id, enrollmentId: result.enrollment.id });
    sendJson(res, 200, result);
    return true;
  }

  // 61. Mark Step Complete (T047)
  const stepCompleteMatch = pathname.match(
    /^\/api\/enrollments\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)\/complete$/
  );
  if (method === 'POST' && stepCompleteMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const enrollmentId = stepCompleteMatch[1];
    const stepId = stepCompleteMatch[2];
    const wasCourseComplete = learningProgressService.getCourseProgress(user.id, enrollmentId).isCompleted;
    const priorProgress = db.prepare('SELECT is_completed FROM step_progress WHERE enrollment_id = ? AND step_id = ?').get(enrollmentId, stepId) as { is_completed: number } | undefined;
    const progress = learningProgressService.markStepComplete(user.id, enrollmentId, stepId);
    if (!priorProgress?.is_completed) recordProductEvent({ eventName: 'step.completed', userId: user.id, enrollmentId, stepId });
    if (!wasCourseComplete && progress.isCompleted) recordProductEvent({ eventName: 'course.completed', userId: user.id, enrollmentId });
    sendJson(res, 200, progress);
    return true;
  }

  // 62. Record Step Visit (T047)
  const stepVisitMatch = pathname.match(
    /^\/api\/enrollments\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)\/visit$/
  );
  if (method === 'POST' && stepVisitMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const enrollmentId = stepVisitMatch[1];
    const stepId = stepVisitMatch[2];
    const result = learningProgressService.recordStepVisit(user.id, enrollmentId, stepId);
    sendJson(res, 200, result);
    return true;
  }

  return false;
}

import { AuthenticationError, NotFoundError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Author roster, student detail and enrollment revoke/reinstate.
export async function handleAuthorRosterRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, url, pathname, method, token, identityService, enrollmentService, teacherRosterService, sendJson } = rc;

  // 38. Author: Get Course Roster & Filters (P28, T073)
  const authorCourseRosterMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/roster$/);
  if (method === 'GET' && authorCourseRosterMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseRosterMatch[1];
    const search = url.searchParams.get('search') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const versionParam = url.searchParams.get('version') || url.searchParams.get('versionNumber');
    const versionNumber = versionParam ? Number(versionParam) : undefined;
    const limit = Number(url.searchParams.get('limit') || 20);
    const offset = Number(url.searchParams.get('offset') || 0);

    const roster = teacherRosterService.listRoster(user.id, courseId, {
      search,
      status,
      versionNumber,
      limit,
      offset,
    });
    sendJson(res, 200, roster);
    return true;
  }

  // 38b. Author: Student Detail for Course Owner (P29, T074)
  const authorStudentDetailMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/roster\/([a-zA-Z0-9_-]+)$/
  );
  if (method === 'GET' && authorStudentDetailMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorStudentDetailMatch[1];
    const enrollmentId = authorStudentDetailMatch[2];

    const detail = teacherRosterService.getStudentDetail(user.id, courseId, enrollmentId);
    sendJson(res, 200, detail);
    return true;
  }

  const studentAttemptsMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/roster\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)\/attempts$/);
  if (method === 'GET' && studentAttemptsMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const query = new URL(req.url || '/', 'http://localhost').searchParams;
    const page = teacherRosterService.listStudentAttempts(user.id, studentAttemptsMatch[1], studentAttemptsMatch[2], studentAttemptsMatch[3],
      Number(query.get('limit') || 10), Number(query.get('offset') || 0));
    sendJson(res, 200, page);
    return true;
  }
  const studentAttemptDetailMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/roster\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)\/attempts\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && studentAttemptDetailMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const attempt = teacherRosterService.getStudentAttempt(user.id, studentAttemptDetailMatch[1], studentAttemptDetailMatch[2], studentAttemptDetailMatch[3], studentAttemptDetailMatch[4]);
    sendJson(res, 200, attempt);
    return true;
  }

  // 38c. Author: Revoke Student Enrollment (P28, T073)
  const authorRevokeEnrollmentMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/roster\/([a-zA-Z0-9_-]+)\/revoke$/
  );
  if (method === 'POST' && authorRevokeEnrollmentMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorRevokeEnrollmentMatch[1];
    const enrollmentId = authorRevokeEnrollmentMatch[2];

    const enr = enrollmentService.getEnrollmentById(enrollmentId);
    if (!enr || enr.courseId !== courseId) {
      throw new NotFoundError("Student enrollment not found.");
    }
    const updated = enrollmentService.revokeStudent(user.id, courseId, enr.userId);
    sendJson(res, 200, updated);
    return true;
  }

  // 38d. Author: Reinstate Student Enrollment (P28, T073)
  const authorReinstateEnrollmentMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/roster\/([a-zA-Z0-9_-]+)\/reinstate$/
  );
  if (method === 'POST' && authorReinstateEnrollmentMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorReinstateEnrollmentMatch[1];
    const enrollmentId = authorReinstateEnrollmentMatch[2];

    const enr = enrollmentService.getEnrollmentById(enrollmentId);
    if (!enr || enr.courseId !== courseId) {
      throw new NotFoundError("Student enrollment not found.");
    }
    const updated = enrollmentService.reinstateStudent(user.id, courseId, enr.userId);
    sendJson(res, 200, updated);
    return true;
  }

  return false;
}

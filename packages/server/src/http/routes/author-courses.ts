import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Author course lifecycle: list, create, metadata, settings, validate, publish, archive, restore, delete.
export async function handleAuthorCourseRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, url, pathname, method, token, identityService, courseService, courseValidationService, coursePublicationService, courseLifecycleService, parseJsonBody, sendJson, recordProductEvent } = rc;

  // 27. Author: List Owned Courses (T029)
  if (method === 'GET' && pathname === '/api/author/courses') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const status = url.searchParams.get('status') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const limit = Number(url.searchParams.get('limit') || 20);
    const offset = Number(url.searchParams.get('offset') || 0);
    const result = courseService.listOwnedCourses(user.id, { status, search, limit, offset });
    sendJson(res, 200, result);
    return true;
  }

  // 28. Author: Create Course Draft (T029)
  if (method === 'POST' && pathname === '/api/author/courses') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const created = courseService.createCourseDraft(user.id, body);
    recordProductEvent({ eventName: 'course.created', userId: user.id, courseId: created.id });
    sendJson(res, 201, created);
    return true;
  }

  // 29. Author: Get Course Details (T030)
  const authorCourseMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && authorCourseMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseMatch[1];
    const course = courseService.getCourse(user.id, courseId);
    sendJson(res, 200, course);
    return true;
  }

  // 30. Author: Update Course Metadata (T030)
  const authorCourseMetaMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/metadata$/);
  if (method === 'PUT' && authorCourseMetaMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseMetaMatch[1];
    const body = await parseJsonBody(req);
    const updated = courseService.updateCourseMetadata(
      user.id,
      courseId,
      Number(body.expectedRevision),
      body.metadata || body
    );
    sendJson(res, 200, updated);
    return true;
  }

  // 31. Author: Update Course Access Settings (T030)
  const authorCourseSettingsMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/settings$/);
  if (method === 'PUT' && authorCourseSettingsMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseSettingsMatch[1];
    const body = await parseJsonBody(req);
    const updated = courseService.updateCourseAccessSettings(user.id, courseId, body);
    sendJson(res, 200, updated);
    return true;
  }

  // 32. Author: Validate Course Draft (T040)
  const authorCourseValidateMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/validate$/);
  if (method === 'POST' && authorCourseValidateMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseValidateMatch[1];
    const result = await courseValidationService.validateCourseDraft(user.id, courseId);
    sendJson(res, 200, result);
    return true;
  }

  // 33. Author: Publish Course (T041)
  const authorCoursePublishMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/publish$/);
  if (method === 'POST' && authorCoursePublishMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCoursePublishMatch[1];
    const body = await parseJsonBody(req);
    const receipt = await coursePublicationService.publishCourse(user.id, courseId, {
      expectedRevision: Number(body.expectedRevision),
      changeSummary: body.changeSummary,
      idempotencyKey: body.idempotencyKey,
    });
    recordProductEvent({ eventName: 'course.published', userId: user.id, courseId, courseVersionId: receipt.versionId });
    sendJson(res, 200, receipt);
    return true;
  }

  // 34. Author: Archive Course (T043)
  const authorCourseArchiveMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/archive$/);
  if (method === 'POST' && authorCourseArchiveMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseArchiveMatch[1];
    const updated = courseLifecycleService.archiveCourse(user.id, courseId);
    sendJson(res, 200, updated);
    return true;
  }

  // 35. Author: Restore Course (T043)
  const authorCourseRestoreMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/restore$/);
  if (method === 'POST' && authorCourseRestoreMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseRestoreMatch[1];
    const updated = courseLifecycleService.restoreCourse(user.id, courseId);
    sendJson(res, 200, updated);
    return true;
  }

  // 36. Author: Delete Course Draft (T043)
  if (method === 'DELETE' && authorCourseMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseMatch[1];
    const result = courseLifecycleService.deleteCourseDraft(user.id, courseId);
    sendJson(res, 200, result);
    return true;
  }

  return false;
}

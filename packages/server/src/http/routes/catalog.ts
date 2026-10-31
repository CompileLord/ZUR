import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Public catalog, categories, course overview, issue reports and enrollment entry points.
export async function handleCatalogRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, url, pathname, method, token, identityService, courseService, parseJsonBody, sendJson } = rc;

  // 39. Public: List Catalog (T044, T070)
  if (method === 'GET' && pathname === '/api/courses/catalog') {
    const search = url.searchParams.get('search') || url.searchParams.get('q') || undefined;
    const categoryId = url.searchParams.get('categoryId') || url.searchParams.get('category') || undefined;
    const level = url.searchParams.get('level') || url.searchParams.get('difficulty') || undefined;
    const language = url.searchParams.get('language') || undefined;
    const limit = Number(url.searchParams.get('limit') || 20);
    const offset = Number(url.searchParams.get('offset') || 0);
    const catalog = courseService.listPublicCatalog({ search, categoryId, level, language, limit, offset });
    sendJson(res, 200, catalog);
    return true;
  }

  // Public: List Categories (T070)
  if (method === 'GET' && pathname === '/api/categories') {
    const categories = courseService.listCategories();
    sendJson(res, 200, categories);
    return true;
  }

  // Public: Course Overview (P03, T071)
  const publicCourseMatch = pathname.match(/^\/api\/courses\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && publicCourseMatch && publicCourseMatch[1] !== 'catalog') {
    let currentUserId: string | undefined;
    if (token) {
      try {
        const { user } = identityService.authenticateSession(token);
        currentUserId = user.id;
      } catch {
        // Visitor / unauthenticated
      }
    }
    const courseId = publicCourseMatch[1];
    const overview = courseService.getPublicCourseOverview(courseId, currentUserId);
    sendJson(res, 200, overview);
    return true;
  }

  // Issue Reporting (P40, T072)
  if (method === 'POST' && pathname === '/api/reports') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    identityService.consumeRequestRateLimit('report', user.id, 20, 60 * 60 * 1000);
    const report = courseService.createReport(user.id, body);
    sendJson(res, 201, report);
    return true;
  }

  // 40. Student: Enroll in Course (T042, T071)
  const studentCourseEnrollMatch = pathname.match(/^\/api\/courses\/([a-zA-Z0-9_-]+)\/enroll$/);
  if (method === 'POST' && studentCourseEnrollMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = studentCourseEnrollMatch[1];
    const body = await parseJsonBody(req);
    const enrollment = courseService.enrollStudent(user.id, courseId, body.invitationToken);
    sendJson(res, 201, enrollment);
    return true;
  }

  // 41. Student: Get Enrolled Step Content (T042)
  const enrolledStepContentMatch = pathname.match(
    /^\/api\/learn\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)\/content$/
  );
  if (method === 'GET' && enrolledStepContentMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const enrollmentId = enrolledStepContentMatch[1];
    const stepId = enrolledStepContentMatch[2];
    const content = courseService.getEnrolledStepContent(user.id, enrollmentId, stepId);
    sendJson(res, 200, content);
    return true;
  }

  return false;
}

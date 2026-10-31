import { AuthenticationError, AuthorizationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Author course analytics and product event reads.
export async function handleAnalyticsRoutes(rc: RouteContext): Promise<boolean> {
  const { res, url, pathname, method, token, identityService, teacherRosterService, productAnalyticsService, sendJson } = rc;

  // 38f. Author: Course Analytics & Exact Metrics (P30, T075)
  const authorCourseAnalyticsMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/analytics$/);
  if (method === 'GET' && authorCourseAnalyticsMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseAnalyticsMatch[1];
    const versionParam = url.searchParams.get('version') || url.searchParams.get('versionNumber');
    const versionNumber = versionParam ? Number(versionParam) : undefined;
    const windowParam = url.searchParams.get('timeWindowDays') || url.searchParams.get('days');
    const timeWindowDays = windowParam ? Number(windowParam) : undefined;

    const metrics = teacherRosterService.getCourseMetrics(user.id, courseId, {
      versionNumber,
      timeWindowDays,
    });
    sendJson(res, 200, metrics);
    return true;
  }

  // Product events are created only after trusted domain operations.
  if (method === 'GET' && pathname === '/api/analytics/events') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    if (!user.capabilities.includes('admin')) {
      throw new AuthorizationError('Admin capability required to view raw product analytics events.');
    }
    const eventName = url.searchParams.get('eventName') || undefined;
    const courseId = url.searchParams.get('courseId') || undefined;
    const excludeStaff = url.searchParams.get('excludeStaff') === 'true';
    const limit = Number(url.searchParams.get('limit') || 50);

    const events = productAnalyticsService.listEvents({
      eventName,
      courseId,
      excludeStaffOrPreview: excludeStaff,
      limit,
    });
    sendJson(res, 200, { events });
    return true;
  }

  return false;
}

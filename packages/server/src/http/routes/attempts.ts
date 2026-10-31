import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Learner attempt history, detail and restore-to-draft.
export async function handleAttemptRoutes(rc: RouteContext): Promise<boolean> {
  const { res, url, pathname, method, token, identityService, attemptService, sendJson } = rc;

  // 24. List Attempts (T027)
  if (method === 'GET' && pathname === '/api/attempts') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const enrollmentId = url.searchParams.get('enrollmentId') || '';
    const stepId = url.searchParams.get('stepId') || '';
    const limit = Number(url.searchParams.get('limit') || 20);
    const offset = Number(url.searchParams.get('offset') || 0);

    const result = attemptService.listAttempts({
      enrollmentId,
      stepId,
      requestingUserId: user.id,
      limit,
      offset,
    });
    sendJson(res, 200, result);
    return true;
  }

  // 25. Get Attempt Detail (T027)
  const attemptDetailMatch = pathname.match(/^\/api\/attempts\/([^/]+)$/);
  if (method === 'GET' && attemptDetailMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const attemptId = attemptDetailMatch[1];
    const detail = attemptService.getAttempt(attemptId, user.id);
    sendJson(res, 200, detail);
    return true;
  }

  // 26. Restore Attempt Code to Draft (T027)
  const attemptRestoreMatch = pathname.match(/^\/api\/attempts\/([^/]+)\/restore$/);
  if (method === 'POST' && attemptRestoreMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const attemptId = attemptRestoreMatch[1];
    const result = attemptService.restoreAttempt(attemptId, user.id);
    sendJson(res, 200, result);
    return true;
  }

  return false;
}

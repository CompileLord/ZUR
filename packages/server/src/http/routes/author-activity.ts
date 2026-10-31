import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Agent activity and draft recovery for author courses.
export async function handleAuthorActivityRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, url, pathname, method, token, identityService, agentActivityService, draftRecoveryService, parseJsonBody, sendJson } = rc;

  // Agent Activity: List Course Agent Activity (T065)
  const authorCourseActivityMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/activity$/);
  if (method === 'GET' && authorCourseActivityMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseActivityMatch[1];
    const page = Number(url.searchParams.get('page') || 1);
    const limit = Number(url.searchParams.get('limit') || 20);
    const toolName = url.searchParams.get('toolName') || undefined;
    const outcome = url.searchParams.get('outcome') || undefined;
    const tokenId = url.searchParams.get('tokenId') || undefined;
    const date = url.searchParams.get('date') || undefined;
    const dateFrom = url.searchParams.get('dateFrom') || undefined;
    const dateTo = url.searchParams.get('dateTo') || undefined;
    const result = agentActivityService.listAgentActivity(user.id, courseId, { page, limit, toolName, outcome, tokenId, date, dateFrom, dateTo });
    sendJson(res, 200, result);
    return true;
  }

  // Agent Activity: Get Mutation Detail (T065)
  const authorMutationDetailMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/activity\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && authorMutationDetailMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const mutationId = authorMutationDetailMatch[2];
    const result = agentActivityService.getMutationDetail(user.id, mutationId);
    sendJson(res, 200, result);
    return true;
  }

  // Draft Recovery: List Recovery Revisions (T066)
  const authorRecoveryListMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/recovery$/);
  if (method === 'GET' && authorRecoveryListMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorRecoveryListMatch[1];
    const revisions = draftRecoveryService.listRecoveryRevisions(user.id, courseId);
    sendJson(res, 200, { revisions });
    return true;
  }

  // Draft Recovery: Restore Draft Revision (T066)
  const authorRecoveryRestoreMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/recovery\/([a-zA-Z0-9_-]+)\/restore$/);
  if (method === 'POST' && authorRecoveryRestoreMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorRecoveryRestoreMatch[1];
    const revisionId = authorRecoveryRestoreMatch[2];
    const body = await parseJsonBody(req);
    const expectedRevision = Number(body.expectedRevision);
    const result = draftRecoveryService.restoreDraftRevision(user.id, courseId, revisionId, expectedRevision);
    sendJson(res, 200, result);
    return true;
  }

  return false;
}

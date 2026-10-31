import { AuthenticationError } from 'zur-shared';
import type { RouteContext } from './context.ts';

// Author course invitations: list, create, revoke, resend.
export async function handleAuthorInvitationRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, pathname, method, token, identityService, invitationService, parseJsonBody, sendJson, deliverCourseInvitation } = rc;

  // 38e. Author: Course Invitations (P28, T073)
  const authorCourseInvitationsMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/invitations$/);
  if (method === 'GET' && authorCourseInvitationsMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseInvitationsMatch[1];
    const invitations = invitationService.listInvitations(user.id, courseId);
    sendJson(res, 200, { invitations: invitations.map(({ tokenHash, inviterId, ...safe }) => safe) });
    return true;
  }

  if (method === 'POST' && authorCourseInvitationsMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorCourseInvitationsMatch[1];
    const body = await parseJsonBody(req);
    const result = invitationService.createInvitation(user.id, courseId, body);
    const delivery = result.invitation.type === 'email'
      ? await deliverCourseInvitation(user.id, result.invitation.id, courseId, result.token)
      : null;
    const updatedInvitation = delivery
      ? invitationService.listInvitations(user.id, courseId).find((row) => row.id === result.invitation.id) || result.invitation
      : result.invitation;
    const { tokenHash, inviterId, ...safe } = updatedInvitation;
    sendJson(res, 201, { invitation: safe, token: result.token, delivery });
    return true;
  }

  const authorRevokeInvitationMatch = pathname.match(/^\/api\/author\/invitations\/([a-zA-Z0-9_-]+)\/revoke$/);
  if (method === 'POST' && authorRevokeInvitationMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const invitationId = authorRevokeInvitationMatch[1];
    const result = invitationService.revokeInvitation(user.id, invitationId);
    sendJson(res, 200, result);
    return true;
  }

  const authorResendInvitationMatch = pathname.match(/^\/api\/author\/invitations\/([a-zA-Z0-9_-]+)\/resend$/);
  if (method === 'POST' && authorResendInvitationMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const invitationId = authorResendInvitationMatch[1];
    const result = invitationService.resendOrRegenerateInvitation(user.id, invitationId);
    const delivery = result.invitation.type === 'email'
      ? await deliverCourseInvitation(user.id, invitationId, result.invitation.courseId, result.token)
      : null;
    const updatedInvitation = delivery
      ? invitationService.listInvitations(user.id, result.invitation.courseId).find((row) => row.id === invitationId) || result.invitation
      : result.invitation;
    const { tokenHash, inviterId, ...safe } = updatedInvitation;
    sendJson(res, 200, { invitation: safe, token: result.token, delivery });
    return true;
  }

  return false;
}

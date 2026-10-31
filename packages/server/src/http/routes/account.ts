import { AuthenticationError } from 'zur-shared';
import { createJsonZip } from '../../services/export-archive.ts';
import { clearSessionCookie } from '../security.ts';
import type { RouteContext } from './context.ts';

// Current user, profile, appearance, password change and privacy (export/deletion).
export async function handleAccountRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, url, pathname, method, token, identityService, draftService, parseJsonBody, sendJson } = rc;

  // 9. Current User Profile & Preferences (T014, T016)
  if (method === 'GET' && pathname === '/api/auth/me') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const preferences = identityService.getPreferences(user.id);
    sendJson(res, 200, { user, preferences });
    return true;
  }

  // 10. Update Profile (T016)
  if (method === 'PUT' && pathname === '/api/settings/profile') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const updated = identityService.updateProfile(user.id, body);
    sendJson(res, 200, { user: updated });
    return true;
  }

  // 11. Appearance Preferences (T016)
  if (method === 'GET' && pathname === '/api/settings/appearance') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const preferences = identityService.getPreferences(user.id);
    sendJson(res, 200, preferences);
    return true;
  }

  if (method === 'PUT' && pathname === '/api/settings/appearance') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const updated = identityService.updatePreferences(user.id, body);
    sendJson(res, 200, updated);
    return true;
  }

  // 12. Change Password (T015)
  if (method === 'POST' && pathname === '/api/settings/security/change-password') {
    if (!token) throw new AuthenticationError();
    const { user, session } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const success = identityService.changePassword(user.id, body.currentPassword, body.newPassword, session.id);
    sendJson(res, 200, { success });
    return true;
  }

  // 13. Privacy Status (T017)
  if (method === 'GET' && pathname === '/api/settings/privacy/status') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const status = identityService.getPrivacyStatus(user.id);
    sendJson(res, 200, status);
    return true;
  }

  const privacyExportDownload=pathname.match(/^\/api\/settings\/privacy\/exports\/([a-zA-Z0-9_-]+)$/);
  if(method==='GET'&&privacyExportDownload){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=identityService.getPrivacyExport(user.id,privacyExportDownload[1]);const bytes=createJsonZip('account-export.json',body);res.writeHead(200,{'Content-Type':'application/zip','Content-Length':bytes.length,'Content-Disposition':`attachment; filename="zur-account-export-${privacyExportDownload[1]}.zip"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return true;}

  // 14. Data Export (T017)
  if (method === 'POST' && pathname === '/api/settings/privacy/export') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const result = identityService.requestDataExport(user.id, typeof body?.currentPassword === 'string' ? body.currentPassword : undefined);
    sendJson(res, 200, result);
    return true;
  }

  // 15. Account Deletion (T017)
  if (method === 'POST' && pathname === '/api/settings/privacy/delete') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const body = await parseJsonBody(req);
    const result = identityService.requestAccountDeletion(user.id, Boolean(body.consequenceAcknowledged), typeof body.currentPassword === 'string' ? body.currentPassword : undefined);
    const clearCookie = clearSessionCookie(req);
    sendJson(res, 200, result, { 'Set-Cookie': clearCookie });
    return true;
  }

  // 16. Get Code Draft (T025)
  if (method === 'GET' && pathname === '/api/drafts') {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const enrollmentId = url.searchParams.get('enrollmentId') || '';
    const stepId = url.searchParams.get('stepId') || '';
    const draft = draftService.getDraft(user.id, enrollmentId, stepId);
    sendJson(res, 200, draft);
    return true;
  }

  return false;
}

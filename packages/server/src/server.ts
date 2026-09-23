import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { ZURError, AuthenticationError } from 'zur-shared';
import { IdentityService } from './services/identity-service.ts';
import { AuthorizationService } from './services/auth-service.ts';
import { ExecutionService } from './services/execution-service.ts';
import { DraftService } from './services/draft-service.ts';
import { AttemptService } from './services/attempt-service.ts';

export function createServer(db: DatabaseSync): http.Server {
  const identityService = new IdentityService(db);
  const authService = new AuthorizationService(db);
  const executionService = new ExecutionService(db);
  const draftService = new DraftService(db);
  const attemptService = new AttemptService(db);

  function parseCookies(req: http.IncomingMessage): Record<string, string> {
    const header = req.headers.cookie;
    if (!header) return {};
    return Object.fromEntries(
      header.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
    );
  }

  function getSessionToken(req: http.IncomingMessage): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    const cookies = parseCookies(req);
    return cookies.zur_session || null;
  }

  async function parseJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1024 * 1024) {
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (!data) return resolve({});
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON payload'));
        }
      });
      req.on('error', reject);
    });
  }

  function sendJson(res: http.ServerResponse, status: number, body: any, headers: Record<string, string> = {}): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      ...headers,
    });
    res.end(payload);
  }

  return http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    try {
      // 1. Sign Up (T013)
      if (method === 'POST' && pathname === '/api/auth/sign-up') {
        const body = await parseJsonBody(req);
        const result = identityService.signUp(body);
        sendJson(res, 201, result);
        return;
      }

      // 2. Email Verification (T013)
      if (method === 'POST' && pathname === '/api/auth/verify-email') {
        const body = await parseJsonBody(req);
        const result = identityService.verifyEmail(body.token);
        sendJson(res, 200, result);
        return;
      }

      // 3. Resend Verification (T013)
      if (method === 'POST' && pathname === '/api/auth/resend-verification') {
        const body = await parseJsonBody(req);
        const result = identityService.resendVerificationEmail(body.email);
        sendJson(res, 200, result);
        return;
      }

      // 4. Sign In (T014)
      if (method === 'POST' && pathname === '/api/auth/sign-in') {
        const body = await parseJsonBody(req);
        const session = identityService.signIn({
          email: body.email,
          password: body.password,
          ipAddress: req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        });

        // Set HttpOnly session cookie
        const cookieHeader = `zur_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`;
        sendJson(res, 200, session, { 'Set-Cookie': cookieHeader });
        return;
      }

      // 5. Sign Out (T014)
      if (method === 'POST' && pathname === '/api/auth/sign-out') {
        const token = getSessionToken(req);
        if (token) {
          identityService.signOut(token);
        }
        const clearCookie = 'zur_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
        sendJson(res, 200, { success: true }, { 'Set-Cookie': clearCookie });
        return;
      }

      // 6. Sign Out All Devices (T014)
      if (method === 'POST' && pathname === '/api/auth/sign-out-all') {
        const token = getSessionToken(req);
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        identityService.signOutAll(user.id);
        const clearCookie = 'zur_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
        sendJson(res, 200, { success: true }, { 'Set-Cookie': clearCookie });
        return;
      }

      // 7. Password Recovery Request (T015)
      if (method === 'POST' && pathname === '/api/auth/forgot-password') {
        const body = await parseJsonBody(req);
        const result = identityService.requestPasswordReset(body.email);
        sendJson(res, 200, result);
        return;
      }

      // 8. Password Reset (T015)
      if (method === 'POST' && pathname === '/api/auth/reset-password') {
        const body = await parseJsonBody(req);
        const success = identityService.resetPassword(body.token, body.password);
        const clearCookie = 'zur_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
        sendJson(res, 200, { success }, { 'Set-Cookie': clearCookie });
        return;
      }

      // Authenticated endpoints below:
      const token = getSessionToken(req);

      // 9. Current User Profile & Preferences (T014, T016)
      if (method === 'GET' && pathname === '/api/auth/me') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const preferences = identityService.getPreferences(user.id);
        sendJson(res, 200, { user, preferences });
        return;
      }

      // 10. Update Profile (T016)
      if (method === 'PUT' && pathname === '/api/settings/profile') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const updated = identityService.updateProfile(user.id, body);
        sendJson(res, 200, { user: updated });
        return;
      }

      // 11. Appearance Preferences (T016)
      if (method === 'GET' && pathname === '/api/settings/appearance') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const preferences = identityService.getPreferences(user.id);
        sendJson(res, 200, preferences);
        return;
      }

      if (method === 'PUT' && pathname === '/api/settings/appearance') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const updated = identityService.updatePreferences(user.id, body);
        sendJson(res, 200, updated);
        return;
      }

      // 12. Change Password (T015)
      if (method === 'POST' && pathname === '/api/settings/security/change-password') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const success = identityService.changePassword(user.id, body.currentPassword, body.newPassword);
        sendJson(res, 200, { success });
        return;
      }

      // 13. Privacy Status (T017)
      if (method === 'GET' && pathname === '/api/settings/privacy/status') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const status = identityService.getPrivacyStatus(user.id);
        sendJson(res, 200, status);
        return;
      }

      // 14. Data Export (T017)
      if (method === 'POST' && pathname === '/api/settings/privacy/export') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const result = identityService.requestDataExport(user.id);
        sendJson(res, 200, result);
        return;
      }

      // 15. Account Deletion (T017)
      if (method === 'POST' && pathname === '/api/settings/privacy/delete') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const result = identityService.requestAccountDeletion(user.id, Boolean(body.consequenceAcknowledged));
        const clearCookie = 'zur_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
        sendJson(res, 200, result, { 'Set-Cookie': clearCookie });
        return;
      }

      // 16. Get Code Draft (T025)
      if (method === 'GET' && pathname === '/api/drafts') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const enrollmentId = url.searchParams.get('enrollmentId') || '';
        const stepId = url.searchParams.get('stepId') || '';
        const draft = draftService.getDraft(user.id, enrollmentId, stepId);
        sendJson(res, 200, draft);
        return;
      }

      // 17. Save Code Draft (T025)
      if (method === 'PUT' && pathname === '/api/drafts') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const result = draftService.saveDraft(
          user.id,
          body.enrollmentId,
          body.stepId,
          body.code,
          body.baseRevision
        );
        sendJson(res, 200, result);
        return;
      }

      // 18. Reset Code Draft to Starter Code (T025)
      if (method === 'POST' && pathname === '/api/drafts/reset') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const result = draftService.resetDraft(user.id, body.enrollmentId, body.stepId);
        sendJson(res, 200, result);
        return;
      }

      // 19. Run Samples (T022)
      if (method === 'POST' && pathname === '/api/execution/run-samples') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const result = await executionService.executeJobSynchronously({
          userId: user.id,
          enrollmentId: body.enrollmentId,
          stepId: body.stepId,
          jobType: 'run_samples',
          code: body.code,
          idempotencyKey: body.idempotencyKey,
        });
        sendJson(res, 200, result);
        return;
      }

      // 20. Run Custom Input (T022)
      if (method === 'POST' && pathname === '/api/execution/run-custom') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const result = await executionService.executeJobSynchronously({
          userId: user.id,
          enrollmentId: body.enrollmentId,
          stepId: body.stepId,
          jobType: 'run_custom',
          code: body.code,
          stdin: body.stdin || '',
          idempotencyKey: body.idempotencyKey,
        });
        sendJson(res, 200, result);
        return;
      }

      // 21. Submit Solution (T023)
      if (method === 'POST' && pathname === '/api/execution/submit') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const result = await executionService.executeJobSynchronously({
          userId: user.id,
          enrollmentId: body.enrollmentId,
          stepId: body.stepId,
          jobType: 'submit',
          code: body.code,
          idempotencyKey: body.idempotencyKey,
        });
        sendJson(res, 200, result);
        return;
      }

      // 22. Get Execution Job Status by ID (T021)
      const jobMatch = pathname.match(/^\/api\/execution\/jobs\/([^/]+)$/);
      if (method === 'GET' && jobMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const jobId = jobMatch[1];
        const status = executionService.getJob(jobId, user.id);
        sendJson(res, 200, status);
        return;
      }

      // 23. Operator Kill Switch: Status, Pause, Resume (T024)
      if (method === 'GET' && pathname === '/api/admin/execution/status') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        authService.requireAdmin(user);
        const isPaused = executionService.getQuotaService().isExecutionPaused();
        sendJson(res, 200, { executionPaused: isPaused });
        return;
      }

      if (method === 'POST' && pathname === '/api/admin/execution/pause') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        authService.requireAdmin(user);
        executionService.getQuotaService().setExecutionPaused(true);
        sendJson(res, 200, { executionPaused: true });
        return;
      }

      if (method === 'POST' && pathname === '/api/admin/execution/resume') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        authService.requireAdmin(user);
        executionService.getQuotaService().setExecutionPaused(false);
        sendJson(res, 200, { executionPaused: false });
        return;
      }

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
        return;
      }

      // 25. Get Attempt Detail (T027)
      const attemptDetailMatch = pathname.match(/^\/api\/attempts\/([^/]+)$/);
      if (method === 'GET' && attemptDetailMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const attemptId = attemptDetailMatch[1];
        const detail = attemptService.getAttempt(attemptId, user.id);
        sendJson(res, 200, detail);
        return;
      }

      // 26. Restore Attempt Code to Draft (T027)
      const attemptRestoreMatch = pathname.match(/^\/api\/attempts\/([^/]+)\/restore$/);
      if (method === 'POST' && attemptRestoreMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const attemptId = attemptRestoreMatch[1];
        const result = attemptService.restoreAttempt(attemptId, user.id);
        sendJson(res, 200, result);
        return;
      }

      // Fallback: Safe 404 (T018)
      throw authService.safeNotFound();

    } catch (err) {
      if (err instanceof ZURError) {
        sendJson(res, err.statusCode, err.toJSON());
      } else {
        sendJson(res, 500, {
          error: {
            code: 'INFRASTRUCTURE_ERROR',
            message: "This page isn't available.",
          },
        });
      }
    }
  });
}

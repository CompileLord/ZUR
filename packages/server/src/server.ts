import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { ZURError, AuthenticationError, AuthorizationError, NotFoundError, ValidationError } from 'zur-shared';
import { IdentityService } from './services/identity-service.ts';
import { AuthorizationService } from './services/auth-service.ts';
import { ExecutionService } from './services/execution-service.ts';
import { DraftService } from './services/draft-service.ts';
import { AttemptService } from './services/attempt-service.ts';
import { CourseService } from './services/course-service.ts';
import { CourseStructureService } from './services/course-structure-service.ts';
import { MediaService } from './services/media-service.ts';
import { createJsonZip } from './services/export-archive.ts';
import { QuizService } from './services/quiz-service.ts';
import { ExerciseAuthoringService } from './services/exercise-authoring-service.ts';
import { CourseAutosaveService } from './services/course-autosave-service.ts';
import { CourseValidationService } from './services/course-validation-service.ts';
import { CoursePublicationService } from './services/course-publication-service.ts';
import { CourseLifecycleService } from './services/course-lifecycle-service.ts';
import { EnrollmentService } from './services/enrollment-service.ts';
import { InvitationService } from './services/invitation-service.ts';
import { LearningProgressService } from './services/learning-progress-service.ts';
import { McpTokenService } from './services/mcp-token-service.ts';
import { McpAuthService } from './services/mcp-auth-service.ts';
import { McpServer } from './mcp/mcp-server.ts';
import { McpHttpTransport } from './mcp/transport.ts';
import { AgentActivityService } from './services/agent-activity-service.ts';
import { DraftRecoveryService } from './services/draft-recovery-service.ts';
import { TeacherRosterService } from './services/teacher-roster-service.ts';
import { ProductAnalyticsService } from './services/product-analytics-service.ts';
import { EmailDeliveryService } from './services/email-delivery-service.ts';
import { AdminService } from './services/admin-service.ts';

export function createServer(
  db: DatabaseSync,
  dependencies: { emailDeliveryService?: EmailDeliveryService } = {}
): http.Server {

  const identityService = new IdentityService(db);
  const authService = new AuthorizationService(db);
  const executionService = new ExecutionService(db);
  const draftService = new DraftService(db);
  const attemptService = new AttemptService(db);
  const courseService = new CourseService(db);
  const courseStructureService = new CourseStructureService(db);
  const mediaService = new MediaService(db);
  const quizService = new QuizService(db);
  const exerciseAuthoringService = new ExerciseAuthoringService(db);
  const courseAutosaveService = new CourseAutosaveService(db);
  const courseValidationService = new CourseValidationService(db);
  const coursePublicationService = new CoursePublicationService(db);
  const courseLifecycleService = new CourseLifecycleService(db);
  const enrollmentService = new EnrollmentService(db);
  const invitationService = new InvitationService(db, enrollmentService);
  const learningProgressService = new LearningProgressService(db);
  const mcpTokenService = new McpTokenService(db);
  const mcpAuthService = new McpAuthService(db);
  const mcpServer = new McpServer(db);
  const mcpTransport = new McpHttpTransport(mcpServer);
  const agentActivityService = new AgentActivityService(db);
  const draftRecoveryService = new DraftRecoveryService(db);
  const teacherRosterService = new TeacherRosterService(db);
  const productAnalyticsService = new ProductAnalyticsService(db);
  const emailDeliveryService = dependencies.emailDeliveryService || new EmailDeliveryService();
  const adminService = new AdminService(db);

  async function deliverCourseInvitation(ownerId: string, invitationId: string, courseId: string, token: string) {
    const invitation = db.prepare(`SELECT i.recipient_email, i.expires_at, c.title, u.display_name
      FROM invitations i JOIN courses c ON c.id = i.course_id
      JOIN users u ON u.id = i.inviter_id WHERE i.id = ? AND i.course_id = ?`).get(invitationId, courseId) as any;
    if (!invitation?.recipient_email) return null;
    const delivery = await emailDeliveryService.sendInvitation({
      recipientEmail: invitation.recipient_email,
      courseTitle: invitation.title,
      inviterName: invitation.display_name,
      invitationUrl: `/join/${encodeURIComponent(token)}`,
      expiresAt: invitation.expires_at,
    });
    invitationService.recordEmailDelivery(ownerId, invitationId, delivery.status, delivery.sentAt);
    return delivery;
  }

  function recordProductEvent(input: {
    eventName: import('zur-shared').DomainEventName;
    userId: string;
    courseId?: string;
    enrollmentId?: string;
    stepId?: string;
    courseVersionId?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): void {
    const enrollment = input.enrollmentId
      ? db.prepare('SELECT course_id, pinned_version_id FROM enrollments WHERE id = ? AND user_id = ?')
          .get(input.enrollmentId, input.userId) as { course_id: string; pinned_version_id: string } | undefined
      : undefined;
    if (input.enrollmentId && !enrollment) return;
    try {
      productAnalyticsService.recordEvent({
        eventName: input.eventName,
        userId: input.userId,
        courseId: enrollment?.course_id || input.courseId,
        courseVersionId: enrollment?.pinned_version_id || input.courseVersionId,
        stepId: input.stepId,
        metadata: input.metadata,
        idempotencyKey: input.idempotencyKey,
      });
    } catch {
      // A telemetry outage cannot turn an acknowledged domain mutation into an apparent failure.
    }
  }

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
        if (data.length > 10 * 1024 * 1024) {
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

    // Streamable HTTP MCP (T057)
    if (mcpTransport.isMcpRequest(pathname)) {
      await mcpTransport.handleHttpRequest(req, res);
      return;
    }

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

      const privacyExportDownload=pathname.match(/^\/api\/settings\/privacy\/exports\/([a-zA-Z0-9_-]+)$/);
      if(method==='GET'&&privacyExportDownload){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=identityService.getPrivacyExport(user.id,privacyExportDownload[1]);const bytes=createJsonZip('account-export.json',body);res.writeHead(200,{'Content-Type':'application/zip','Content-Length':bytes.length,'Content-Disposition':`attachment; filename="zur-account-export-${privacyExportDownload[1]}.zip"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return;}

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
        recordProductEvent({ eventName: 'exercise.run', userId: user.id, enrollmentId: body.enrollmentId, stepId: body.stepId, metadata: { mode: 'samples' } });
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
        recordProductEvent({ eventName: 'exercise.run', userId: user.id, enrollmentId: body.enrollmentId, stepId: body.stepId, metadata: { mode: 'custom' } });
        sendJson(res, 200, result);
        return;
      }

      // 21. Submit Solution (T023)
      if (method === 'POST' && pathname === '/api/execution/submit') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const wasCourseComplete = learningProgressService.getCourseProgress(user.id, body.enrollmentId).isCourseCompleted;
        const priorStep = db.prepare('SELECT is_completed FROM step_progress WHERE enrollment_id = ? AND step_id = ?').get(body.enrollmentId, body.stepId) as { is_completed: number } | undefined;
        const result = await executionService.executeJobSynchronously({
          userId: user.id,
          enrollmentId: body.enrollmentId,
          stepId: body.stepId,
          jobType: 'submit',
          code: body.code,
          idempotencyKey: body.idempotencyKey,
        });
        recordProductEvent({ eventName: 'exercise.submitted', userId: user.id, enrollmentId: body.enrollmentId, stepId: body.stepId, metadata: { verdict: result.result?.verdict } });
        if (result.result?.verdict === 'PASSED' && !priorStep?.is_completed) recordProductEvent({ eventName: 'step.completed', userId: user.id, enrollmentId: body.enrollmentId, stepId: body.stepId });
        if (!wasCourseComplete && learningProgressService.getCourseProgress(user.id, body.enrollmentId).isCourseCompleted) recordProductEvent({ eventName: 'course.completed', userId: user.id, enrollmentId: body.enrollmentId });
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
        const overview = adminService.getOperationsOverview(user.id);
        sendJson(res, 200, { executionPaused: overview.execution.paused, updatedAt: overview.execution.updatedAt });
        return;
      }

      if (method === 'POST' && pathname === '/api/admin/execution/pause') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        authService.requireAdmin(user);
        const body = await parseJsonBody(req);
        identityService.verifyCurrentPassword(user.id, body.currentPassword);
        sendJson(res, 200, adminService.setExecutionPaused(user.id, true, body.reason));
        return;
      }

      if (method === 'POST' && pathname === '/api/admin/execution/resume') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        authService.requireAdmin(user);
        const body = await parseJsonBody(req);
        identityService.verifyCurrentPassword(user.id, body.currentPassword);
        sendJson(res, 200, adminService.setExecutionPaused(user.id, false, body.reason));
        return;
      }

      const adminPage = (limitName='limit', offsetName='offset') => ({ limit: Number(url.searchParams.get(limitName) || 20), offset: Number(url.searchParams.get(offsetName) || 0) });
      if (method === 'GET' && pathname === '/api/admin/operations') {
        if (!token) throw new AuthenticationError(); const { user } = identityService.authenticateSession(token);
        sendJson(res,200,adminService.getOperationsOverview(user.id)); return;
      }
      if (method === 'GET' && pathname === '/api/admin/execution/jobs') {
        if (!token) throw new AuthenticationError(); const { user } = identityService.authenticateSession(token); const page=adminPage();
        sendJson(res,200,adminService.listExecutionJobs(user.id,url.searchParams.get('from')||undefined,url.searchParams.get('to')||undefined,page.limit,page.offset)); return;
      }
      if (method === 'GET' && pathname === '/api/admin/users') {
        if (!token) throw new AuthenticationError(); const { user } = identityService.authenticateSession(token); const page=adminPage();
        sendJson(res,200,adminService.listUsers(user.id,{search:url.searchParams.get('search')||undefined,status:url.searchParams.get('status')||undefined,capability:url.searchParams.get('capability')||undefined,...page})); return;
      }
      const adminUserMatch=pathname.match(/^\/api\/admin\/users\/([a-zA-Z0-9_-]+)$/);
      if(method==='GET'&&adminUserMatch){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,adminService.getUserDetail(user.id,adminUserMatch[1]));return;}
      const adminUserActionMatch=pathname.match(/^\/api\/admin\/users\/([a-zA-Z0-9_-]+)\/(grant-author|revoke-author|suspend|restore)$/);
      if(method==='POST'&&adminUserActionMatch){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);const action=adminUserActionMatch[2].replace('-','_') as any;sendJson(res,200,adminService.changeUserState(user.id,adminUserActionMatch[1],action,body.reason));return;}
      if(method==='POST'&&pathname==='/api/admin/support-access'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);const grant=adminService.beginSupportAccess(user.id,body.userId,body.courseId,body.reason);sendJson(res,201,grant);return;}
      const supportRecords=pathname.match(/^\/api\/admin\/support-access\/([a-zA-Z0-9_-]+)\/records$/);
      if(method==='GET'&&supportRecords){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,adminService.getSupportedStudentRecords(user.id,supportRecords[1]));return;}
      const supportRevoke=pathname.match(/^\/api\/admin\/support-access\/([a-zA-Z0-9_-]+)\/revoke$/);
      if(method==='POST'&&supportRevoke){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.revokeSupportAccess(user.id,supportRevoke[1],body.reason));return;}
      if(method==='GET'&&pathname==='/api/admin/courses'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const page=adminPage();sendJson(res,200,adminService.listCourses(user.id,url.searchParams.get('search')||'',page.limit,page.offset));return;}
      const adminCourseMatch=pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9_-]+)$/);
      if(method==='GET'&&adminCourseMatch){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,adminService.getCourseDetail(user.id,adminCourseMatch[1]));return;}
      const adminCourseSuspend=pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9_-]+)\/suspension$/);
      if(method==='POST'&&adminCourseSuspend){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);if(typeof body.suspended!=='boolean'&&body.suspended!=='true'&&body.suspended!=='false')throw new ValidationError('Choose whether to suspend or restore the course.');sendJson(res,200,adminService.setCourseSuspended(user.id,adminCourseSuspend[1],body.suspended===true||body.suspended==='true',body.reason));return;}
      const adminArchiveCourse=pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9_-]+)\/archive-for-deletion$/);
      if(method==='POST'&&adminArchiveCourse){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.archiveCourseForDeletion(user.id,adminArchiveCourse[1],body.reason));return;}
      const adminWaiver=pathname.match(/^\/api\/admin\/courses\/([a-zA-Z0-9_-]+)\/waivers$/);
      if(method==='GET'&&adminWaiver){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const query=url.searchParams;sendJson(res,200,adminService.previewWaiver(user.id,adminWaiver[1],query.get('versionId')||'',query.get('stepId')||''));return;}
      if(method==='POST'&&adminWaiver){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.waiveStep(user.id,adminWaiver[1],body.versionId,body.stepId,body.reason,body.enrollmentIds,Number(body.reviewedAffectedCount)));return;}
      if(method==='GET'&&pathname==='/api/admin/categories'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,{items:adminService.listCategories(user.id)});return;}
      if(method==='POST'&&pathname==='/api/admin/categories'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,201,adminService.saveCategory(user.id,body.name,undefined,undefined,body.reason));return;}
      const adminCategory=pathname.match(/^\/api\/admin\/categories\/([a-zA-Z0-9_-]+)$/);
      if(method==='PUT'&&adminCategory){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.saveCategory(user.id,body.name,adminCategory[1],undefined,body.reason));return;}
      if(method==='DELETE'&&adminCategory){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.removeCategory(user.id,adminCategory[1],body.replacementId,body.reason));return;}
      if(method==='GET'&&pathname==='/api/admin/reports'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const page=adminPage();sendJson(res,200,adminService.listReports(user.id,url.searchParams.get('status')||undefined,page.limit,page.offset));return;}
      const reportDetail=pathname.match(/^\/api\/admin\/reports\/([a-zA-Z0-9_-]+)$/);
      if(method==='GET'&&reportDetail){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,adminService.getReport(user.id,reportDetail[1]));return;}
      if(method==='PATCH'&&reportDetail){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.updateReport(user.id,reportDetail[1],body.status,body.outcome||'',body.internalNotes||'',body.reason));return;}
      if(method==='GET'&&pathname==='/api/admin/media'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const page=adminPage();sendJson(res,200,adminService.listMedia(user.id,page.limit,page.offset));return;}
      const adminMediaPreview=pathname.match(/^\/api\/admin\/media\/([a-zA-Z0-9_-]+)\/preview$/);
      if(method==='POST'&&adminMediaPreview){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);adminService.authorizeMediaPreview(user.id,adminMediaPreview[1],body.reason);const file=mediaService.getAdminPreviewFile(user.id,adminMediaPreview[1]);res.writeHead(200,{'Content-Type':file.mimeType,'Content-Length':file.buffer.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(file.buffer);return;}
      const adminMediaReview=pathname.match(/^\/api\/admin\/media\/([a-zA-Z0-9_-]+)\/(quarantine|restore)$/);
      if(method==='POST'&&adminMediaReview){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.reviewMedia(user.id,adminMediaReview[1],adminMediaReview[2],body.reason));return;}
      const adminMediaDelete=pathname.match(/^\/api\/admin\/media\/([a-zA-Z0-9_-]+)$/);
      if(method==='DELETE'&&adminMediaDelete){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.deleteMedia(user.id,adminMediaDelete[1],body.reason));return;}
      if(method==='GET'&&pathname==='/api/admin/audit'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const page=adminPage('limit','offset');sendJson(res,200,adminService.listAudit(user.id,{actorId:url.searchParams.get('actorId')||undefined,action:url.searchParams.get('action')||undefined,targetType:url.searchParams.get('targetType')||undefined,targetId:url.searchParams.get('targetId')||undefined,reason:url.searchParams.get('reason')||undefined,correlationId:url.searchParams.get('correlationId')||undefined,from:url.searchParams.get('from')||undefined,to:url.searchParams.get('to')||undefined,...page}));return;}
      const auditDetail=pathname.match(/^\/api\/admin\/audit\/([a-zA-Z0-9_-]+)$/);
      if(method==='GET'&&auditDetail){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);sendJson(res,200,adminService.getAuditEvent(user.id,auditDetail[1]));return;}
      if(method==='GET'&&pathname==='/api/admin/privacy-requests'){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const page=adminPage();sendJson(res,200,adminService.listPrivacyRequests(user.id,url.searchParams.get('status')||undefined,page.limit,page.offset));return;}
      const privacyAction=pathname.match(/^\/api\/admin\/privacy-requests\/([a-zA-Z0-9_-]+)$/);
      if(method==='PATCH'&&privacyAction){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.updatePrivacyRequest(user.id,privacyAction[1],body.status,body.reason));return;}
      if(method==='POST'&&privacyAction){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);sendJson(res,200,adminService.purgeAccount(user.id,privacyAction[1],body.reason));return;}
      const privacyExport=pathname.match(/^\/api\/admin\/privacy-requests\/([a-zA-Z0-9_-]+)\/export$/);
      if(method==='POST'&&privacyExport){if(!token)throw new AuthenticationError();const {user}=identityService.authenticateSession(token);const body=await parseJsonBody(req);identityService.verifyCurrentPassword(user.id,body.currentPassword);const bundle=adminService.exportAccount(user.id,privacyExport[1],body.reason);const bytes=Buffer.from(JSON.stringify(bundle,null,2));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length,'Content-Disposition':`attachment; filename="zur-account-export-${privacyExport[1]}.json"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return;}

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
        return;
      }

      // 28. Author: Create Course Draft (T029)
      if (method === 'POST' && pathname === '/api/author/courses') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const created = courseService.createCourseDraft(user.id, body);
        recordProductEvent({ eventName: 'course.created', userId: user.id, courseId: created.id });
        sendJson(res, 201, created);
        return;
      }

      // 29. Author: Get Course Details (T030)
      const authorCourseMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)$/);
      if (method === 'GET' && authorCourseMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseMatch[1];
        const course = courseService.getCourse(user.id, courseId);
        sendJson(res, 200, course);
        return;
      }

      // 30. Author: Update Course Metadata (T030)
      const authorCourseMetaMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)\/metadata$/);
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
        return;
      }

      // 31. Author: Update Course Access Settings (T030)
      const authorCourseSettingsMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)\/settings$/);
      if (method === 'PUT' && authorCourseSettingsMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseSettingsMatch[1];
        const body = await parseJsonBody(req);
        const updated = courseService.updateCourseAccessSettings(user.id, courseId, body);
        sendJson(res, 200, updated);
        return;
      }

      // 32. Author: Validate Course Draft (T040)
      const authorCourseValidateMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)\/validate$/);
      if (method === 'POST' && authorCourseValidateMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseValidateMatch[1];
        const result = await courseValidationService.validateCourseDraft(user.id, courseId);
        sendJson(res, 200, result);
        return;
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
        return;
      }

      // 34. Author: Archive Course (T043)
      const authorCourseArchiveMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)\/archive$/);
      if (method === 'POST' && authorCourseArchiveMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseArchiveMatch[1];
        const updated = courseLifecycleService.archiveCourse(user.id, courseId);
        sendJson(res, 200, updated);
        return;
      }

      // 35. Author: Restore Course (T043)
      const authorCourseRestoreMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)\/restore$/);
      if (method === 'POST' && authorCourseRestoreMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseRestoreMatch[1];
        const updated = courseLifecycleService.restoreCourse(user.id, courseId);
        sendJson(res, 200, updated);
        return;
      }

      // 36. Author: Delete Course Draft (T043)
      if (method === 'DELETE' && authorCourseMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseMatch[1];
        const result = courseLifecycleService.deleteCourseDraft(user.id, courseId);
        sendJson(res, 200, result);
        return;
      }

      // 37. Admin: Suspend or Unsuspend Course (T043)
      const adminCourseSuspendMatch = pathname.match(/^\/api\/admin\/courses\/([0-9a-fA-F-]+)\/suspend$/);
      if (method === 'POST' && adminCourseSuspendMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = adminCourseSuspendMatch[1];
        const body = await parseJsonBody(req);
        identityService.verifyCurrentPassword(user.id, body.currentPassword);
        if (typeof body.isSuspended !== 'boolean') throw new ValidationError('Choose whether to suspend or restore the course.');
        const updated = adminService.setCourseSuspended(user.id, courseId, body.isSuspended, body.reason);
        sendJson(res, 200, updated);
        return;
      }

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
        return;
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
        return;
      }

      const studentAttemptsMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/roster\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)\/attempts$/);
      if (method === 'GET' && studentAttemptsMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const query = new URL(req.url || '/', 'http://localhost').searchParams;
        const page = teacherRosterService.listStudentAttempts(user.id, studentAttemptsMatch[1], studentAttemptsMatch[2], studentAttemptsMatch[3],
          Number(query.get('limit') || 10), Number(query.get('offset') || 0));
        sendJson(res, 200, page);
        return;
      }
      const studentAttemptDetailMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/roster\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)\/attempts\/([a-zA-Z0-9_-]+)$/);
      if (method === 'GET' && studentAttemptDetailMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const attempt = teacherRosterService.getStudentAttempt(user.id, studentAttemptDetailMatch[1], studentAttemptDetailMatch[2], studentAttemptDetailMatch[3], studentAttemptDetailMatch[4]);
        sendJson(res, 200, attempt);
        return;
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
        return;
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
        return;
      }

      // 38e. Author: Course Invitations (P28, T073)
      const authorCourseInvitationsMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/invitations$/);
      if (method === 'GET' && authorCourseInvitationsMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseInvitationsMatch[1];
        const invitations = invitationService.listInvitations(user.id, courseId);
        sendJson(res, 200, { invitations: invitations.map(({ tokenHash, inviterId, ...safe }) => safe) });
        return;
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
        return;
      }

      const authorRevokeInvitationMatch = pathname.match(/^\/api\/author\/invitations\/([a-zA-Z0-9_-]+)\/revoke$/);
      if (method === 'POST' && authorRevokeInvitationMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const invitationId = authorRevokeInvitationMatch[1];
        const result = invitationService.revokeInvitation(user.id, invitationId);
        sendJson(res, 200, result);
        return;
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
        return;
      }

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
        return;
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
        return;
      }

      // Author Access Tokens (T053)
      if (method === 'POST' && pathname === '/api/author/tokens') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const result = mcpTokenService.createToken(user.id, body);
        sendJson(res, 201, result);
        return;
      }

      if (method === 'GET' && pathname === '/api/author/tokens') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const status = (url.searchParams.get('status') as any) || undefined;
        const tokens = mcpTokenService.listTokens(user.id, status);
        sendJson(res, 200, { tokens });
        return;
      }

      const authorTokenReplaceMatch = pathname.match(/^\/api\/author\/tokens\/([a-zA-Z0-9_-]+)\/replace$/);
      if (method === 'POST' && authorTokenReplaceMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const tokenId = authorTokenReplaceMatch[1];
        const body = await parseJsonBody(req);
        const result = mcpTokenService.replaceToken(user.id, tokenId, body);
        sendJson(res, 201, result);
        return;
      }

      const authorTokenDetailMatch = pathname.match(/^\/api\/author\/tokens\/([a-zA-Z0-9_-]+)$/);
      if (method === 'GET' && authorTokenDetailMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const tokenId = authorTokenDetailMatch[1];
        const tokenData = mcpTokenService.getToken(user.id, tokenId);
        sendJson(res, 200, tokenData);
        return;
      }

      if (method === 'DELETE' && authorTokenDetailMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const tokenId = authorTokenDetailMatch[1];
        mcpTokenService.revokeToken(user.id, tokenId);
        sendJson(res, 200, { success: true });
        return;
      }

      // Agent Activity: List Course Agent Activity (T065)
      const authorCourseActivityMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/activity$/);
      if (method === 'GET' && authorCourseActivityMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseActivityMatch[1];
        const page = Number(url.searchParams.get('page') || 1);
        const limit = Number(url.searchParams.get('limit') || 20);
        const toolName = url.searchParams.get('toolName') || undefined;
        const result = agentActivityService.listAgentActivity(user.id, courseId, { page, limit, toolName });
        sendJson(res, 200, result);
        return;
      }

      // Agent Activity: Get Mutation Detail (T065)
      const authorMutationDetailMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/activity\/([a-zA-Z0-9_-]+)$/);
      if (method === 'GET' && authorMutationDetailMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const mutationId = authorMutationDetailMatch[2];
        const result = agentActivityService.getMutationDetail(user.id, mutationId);
        sendJson(res, 200, result);
        return;
      }

      // Draft Recovery: List Recovery Revisions (T066)
      const authorRecoveryListMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/recovery$/);
      if (method === 'GET' && authorRecoveryListMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorRecoveryListMatch[1];
        const revisions = draftRecoveryService.listRecoveryRevisions(user.id, courseId);
        sendJson(res, 200, { revisions });
        return;
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
        return;
      }

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
        return;
      }

      // Public: List Categories (T070)
      if (method === 'GET' && pathname === '/api/categories') {
        const categories = courseService.listCategories();
        sendJson(res, 200, categories);
        return;
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
        return;
      }

      // Issue Reporting (P40, T072)
      if (method === 'POST' && pathname === '/api/reports') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const body = await parseJsonBody(req);
        const report = courseService.createReport(user.id, body);
        sendJson(res, 201, report);
        return;
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
        return;
      }

      // 41. Student: Get Enrolled Step Content (T042)
      const enrolledStepContentMatch = pathname.match(
        /^\/api\/learn\/([0-9a-fA-F-]+)\/steps\/([0-9a-fA-F-]+)\/content$/
      );
      if (method === 'GET' && enrolledStepContentMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const enrollmentId = enrolledStepContentMatch[1];
        const stepId = enrolledStepContentMatch[2];
        const content = courseService.getEnrolledStepContent(user.id, enrollmentId, stepId);
        sendJson(res, 200, content);
        return;
      }

      // 35. Author: Get Course Tree Structure (T031)
      const authorCourseStructureMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)\/structure$/);
      if (method === 'GET' && authorCourseStructureMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseStructureMatch[1];
        const tree = courseStructureService.getCourseTree(user.id, courseId);
        sendJson(res, 200, tree);
        return;
      }

      // 36. Author: Add Module (T031)
      const authorCourseModulesMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)\/modules$/);
      if (method === 'POST' && authorCourseModulesMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseModulesMatch[1];
        const body = await parseJsonBody(req);
        const mod = courseStructureService.addModule(user.id, courseId, body.title, body.position);
        sendJson(res, 201, mod);
        return;
      }

      // 37. Author: Update / Delete Module (T031)
      const authorCourseModuleItemMatch = pathname.match(
        /^\/api\/author\/courses\/([0-9a-fA-F-]+)\/modules\/([0-9a-fA-F-]+)$/
      );
      if (method === 'PUT' && authorCourseModuleItemMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseModuleItemMatch[1];
        const moduleId = authorCourseModuleItemMatch[2];
        const body = await parseJsonBody(req);
        const mod = courseStructureService.updateModule(user.id, courseId, moduleId, body.title);
        sendJson(res, 200, mod);
        return;
      }
      if (method === 'DELETE' && authorCourseModuleItemMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseModuleItemMatch[1];
        const moduleId = authorCourseModuleItemMatch[2];
        const result = courseStructureService.deleteModule(user.id, courseId, moduleId);
        sendJson(res, 200, result);
        return;
      }

      // 38. Author: Add Lesson (T031)
      const authorCourseLessonsMatch = pathname.match(
        /^\/api\/author\/courses\/([0-9a-fA-F-]+)\/modules\/([0-9a-fA-F-]+)\/lessons$/
      );
      if (method === 'POST' && authorCourseLessonsMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseLessonsMatch[1];
        const moduleId = authorCourseLessonsMatch[2];
        const body = await parseJsonBody(req);
        const lesson = courseStructureService.addLesson(
          user.id,
          courseId,
          moduleId,
          body.title,
          body.description,
          body.position
        );
        sendJson(res, 201, lesson);
        return;
      }

      // 39. Author: Update / Delete Lesson (T031)
      const authorCourseLessonItemMatch = pathname.match(
        /^\/api\/author\/courses\/([0-9a-fA-F-]+)\/lessons\/([0-9a-fA-F-]+)$/
      );
      if (method === 'PUT' && authorCourseLessonItemMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseLessonItemMatch[1];
        const lessonId = authorCourseLessonItemMatch[2];
        const body = await parseJsonBody(req);
        const lesson = courseStructureService.updateLesson(user.id, courseId, lessonId, body.title, body.description);
        sendJson(res, 200, lesson);
        return;
      }
      if (method === 'DELETE' && authorCourseLessonItemMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseLessonItemMatch[1];
        const lessonId = authorCourseLessonItemMatch[2];
        const result = courseStructureService.deleteLesson(user.id, courseId, lessonId);
        sendJson(res, 200, result);
        return;
      }

      // 40. Author: Add Step (T031)
      const authorCourseStepsMatch = pathname.match(
        /^\/api\/author\/courses\/([0-9a-fA-F-]+)\/lessons\/([0-9a-fA-F-]+)\/steps$/
      );
      if (method === 'POST' && authorCourseStepsMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseStepsMatch[1];
        const lessonId = authorCourseStepsMatch[2];
        const body = await parseJsonBody(req);
        const step = courseStructureService.addStep(user.id, courseId, lessonId, body);
        sendJson(res, 201, step);
        return;
      }

      // 41. Author: Update / Delete Step (T031)
      const authorCourseStepItemMatch = pathname.match(
        /^\/api\/author\/courses\/([0-9a-fA-F-]+)\/steps\/([0-9a-fA-F-]+)$/
      );
      if (method === 'PUT' && authorCourseStepItemMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseStepItemMatch[1];
        const stepId = authorCourseStepItemMatch[2];
        const body = await parseJsonBody(req);
        const step = courseStructureService.updateStep(user.id, courseId, stepId, body);
        sendJson(res, 200, step);
        return;
      }
      if (method === 'DELETE' && authorCourseStepItemMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseStepItemMatch[1];
        const stepId = authorCourseStepItemMatch[2];
        const result = courseStructureService.deleteStep(user.id, courseId, stepId);
        sendJson(res, 200, result);
        return;
      }

      // 42. Author: Duplicate Step (T031)
      const authorCourseStepDupMatch = pathname.match(
        /^\/api\/author\/courses\/([0-9a-fA-F-]+)\/steps\/([0-9a-fA-F-]+)\/duplicate$/
      );
      if (method === 'POST' && authorCourseStepDupMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseStepDupMatch[1];
        const stepId = authorCourseStepDupMatch[2];
        const duplicated = courseStructureService.duplicateStep(user.id, courseId, stepId);
        sendJson(res, 201, duplicated);
        return;
      }

      // 43. Author: Step Content Autosave & Recovery (T038)
      const authorStepContentMatch = pathname.match(/^\/api\/author\/steps\/([0-9a-fA-F-]+)\/content$/);
      if (method === 'GET' && authorStepContentMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const stepId = authorStepContentMatch[1];
        const content = courseAutosaveService.getStepContent(user.id, stepId);
        sendJson(res, 200, content);
        return;
      }
      if (method === 'PUT' && authorStepContentMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const stepId = authorStepContentMatch[1];
        const body = await parseJsonBody(req);
        const updated = courseAutosaveService.saveStepContent(
          user.id,
          stepId,
          Number(body.expectedRevision),
          body.payload,
          body.stepMeta
        );
        sendJson(res, 200, updated);
        return;
      }

      // 44. Author: Media Asset Upload & Listing (T033)
      const authorCourseAssetsMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)\/assets$/);
      if (method === 'POST' && authorCourseAssetsMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseAssetsMatch[1];
        const body = await parseJsonBody(req);
        let buffer: Buffer;
        if (body.base64) {
          buffer = Buffer.from(body.base64, 'base64');
        } else {
          buffer = Buffer.from(body.data || '');
        }
        const asset = mediaService.uploadAsset(user.id, courseId, {
          buffer,
          filename: body.filename || 'image.png',
          mimeType: body.mimeType || 'image/png',
          altText: body.altText,
          isDecorative: body.isDecorative,
          caption: body.caption,
        });
        sendJson(res, 201, asset);
        return;
      }
      if (method === 'GET' && authorCourseAssetsMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseAssetsMatch[1];
        const assets = mediaService.listCourseAssets(user.id, courseId);
        sendJson(res, 200, { assets });
        return;
      }

      // 45. Author: Update Media Asset Metadata (T033)
      const authorAssetItemMatch = pathname.match(/^\/api\/author\/assets\/([0-9a-fA-F-]+)$/);
      if (method === 'PUT' && authorAssetItemMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const assetId = authorAssetItemMatch[1];
        const body = await parseJsonBody(req);
        const updated = mediaService.updateAssetMetadata(user.id, assetId, body);
        sendJson(res, 200, updated);
        return;
      }

      // 46. Public / Authorized Asset Delivery (T033)
      const assetServeMatch = pathname.match(/^\/api\/assets\/([0-9a-fA-F-]+)$/);
      if (method === 'GET' && assetServeMatch) {
        const assetId = assetServeMatch[1];
        let userContext = { userId: null as string | null, capabilities: ['student'] as any, isSuspended: false };
        if (token) {
          try {
            const { user } = identityService.authenticateSession(token);
            userContext = {
              userId: user.id,
              capabilities: user.capabilities,
              isSuspended: user.accountStatus === 'suspended',
            };
          } catch {}
        }
        const file = mediaService.getAssetFile(assetId, userContext);
        res.writeHead(200, {
          'Content-Type': file.mimeType,
          'Content-Length': file.buffer.length,
          'Access-Control-Allow-Origin': '*',
        });
        res.end(file.buffer);
        return;
      }

      // 47. Quiz Student View & Grading (T036)
      const studentQuizMatch = pathname.match(/^\/api\/steps\/([0-9a-fA-F-]+)\/quiz$/);
      if (method === 'GET' && studentQuizMatch) {
        const stepId = studentQuizMatch[1];
        const quiz = quizService.getStudentQuiz(stepId);
        sendJson(res, 200, quiz);
        return;
      }

      const studentQuizSubmitMatch = pathname.match(/^\/api\/steps\/([0-9a-fA-F-]+)\/quiz\/submit$/);
      if (method === 'POST' && studentQuizSubmitMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const stepId = studentQuizSubmitMatch[1];
        const body = await parseJsonBody(req);
        const enrollmentId = body.enrollmentId || null;
        const isPreview = Boolean(body.isPreview);
        const wasCourseComplete = !isPreview && enrollmentId ? learningProgressService.getCourseProgress(user.id, enrollmentId).isCourseCompleted : false;
        const priorProgress = !isPreview && enrollmentId ? db.prepare('SELECT is_completed FROM step_progress WHERE enrollment_id = ? AND step_id = ?').get(enrollmentId, stepId) as { is_completed: number } | undefined : undefined;
        const result = quizService.gradeQuiz(user.id, enrollmentId, stepId, body.selectedOptionIds || [], isPreview);
        if (!isPreview && enrollmentId) {
          recordProductEvent({ eventName: 'exercise.submitted', userId: user.id, enrollmentId, stepId, metadata: { verdict: result.verdict } });
          if (result.isPassed && !priorProgress?.is_completed) recordProductEvent({ eventName: 'step.completed', userId: user.id, enrollmentId, stepId });
          if (!wasCourseComplete && learningProgressService.getCourseProgress(user.id, enrollmentId).isCourseCompleted) recordProductEvent({ eventName: 'course.completed', userId: user.id, enrollmentId });
        }
        sendJson(res, 200, result);
        return;
      }

      // 48. Quiz Author View & Update (T036)
      const authorQuizMatch = pathname.match(/^\/api\/author\/steps\/([0-9a-fA-F-]+)\/quiz$/);
      if (method === 'GET' && authorQuizMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const stepId = authorQuizMatch[1];
        const quiz = quizService.getAuthorQuiz(user.id, stepId);
        sendJson(res, 200, quiz);
        return;
      }
      if (method === 'PUT' && authorQuizMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const stepId = authorQuizMatch[1];
        const body = await parseJsonBody(req);
        const updated = quizService.updateQuiz(user.id, stepId, Number(body.expectedRevision), body.quiz || body);
        sendJson(res, 200, updated);
        return;
      }

      // 49. Python Exercise Author View & Update (T037)
      const authorPythonMatch = pathname.match(/^\/api\/author\/steps\/([0-9a-fA-F-]+)\/python$/);
      if (method === 'GET' && authorPythonMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const stepId = authorPythonMatch[1];
        const ex = exerciseAuthoringService.getAuthorExercise(user.id, stepId);
        sendJson(res, 200, ex);
        return;
      }
      if (method === 'PUT' && authorPythonMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const stepId = authorPythonMatch[1];
        const body = await parseJsonBody(req);
        const updated = exerciseAuthoringService.updateExercise(
          user.id,
          stepId,
          Number(body.expectedRevision),
          body.exercise || body
        );
        sendJson(res, 200, updated);
        return;
      }

      // 50. True Student Preview Payload (T039)
      const authorPreviewStepMatch = pathname.match(
        /^\/api\/author\/courses\/([0-9a-fA-F-]+)\/preview\/([0-9a-fA-F-]+)$/
      );
      if (method === 'GET' && authorPreviewStepMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorPreviewStepMatch[1];
        const stepId = authorPreviewStepMatch[2];
        const course = courseService.getCourse(user.id, courseId);
        const step = db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId) as any;
        if (!step) throw authService.safeNotFound();

        let previewData: any = null;
        if (step.type === 'quiz') {
          previewData = quizService.getStudentQuiz(stepId);
        } else if (step.type === 'python') {
          previewData = exerciseAuthoringService.getStudentExercise(stepId);
        } else {
          const rawContent = db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(stepId) as any;
          previewData = rawContent ? JSON.parse(rawContent.content_payload) : {};
        }

        sendJson(res, 200, {
          courseTitle: course.title,
          courseId,
          stepId,
          stepTitle: step.title,
          stepType: step.type,
          isRequired: Boolean(step.is_required),
          estimatedDurationMinutes: step.estimated_duration_minutes,
          content: previewData,
          isPreview: true,
        });
        return;
      }

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
        return;
      }

      // 52. Leave course (T045)
      const leaveMatch = pathname.match(/^\/api\/courses\/([a-zA-Z0-9_-]+)\/leave$/);
      if (method === 'POST' && leaveMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = leaveMatch[1];
        const enrollment = enrollmentService.leaveCourse(user.id, courseId);
        sendJson(res, 200, { enrollment });
        return;
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
        return;
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
        return;
      }

      // 55. Create Invitation (T046)
      const createInviteMatch = pathname.match(/^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/invitations$/);
      if (method === 'POST' && createInviteMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = createInviteMatch[1];
        const body = await parseJsonBody(req);
        const result = invitationService.createInvitation(user.id, courseId, body);
        sendJson(res, 201, result);
        return;
      }

      // 56. List Invitations (T046)
      if (method === 'GET' && createInviteMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = createInviteMatch[1];
        const invitations = invitationService.listInvitations(user.id, courseId);
        sendJson(res, 200, { invitations });
        return;
      }

      // 57. Revoke Invitation (T046)
      const revokeInviteMatch = pathname.match(/^\/api\/author\/invitations\/([a-zA-Z0-9_-]+)\/revoke$/);
      if (method === 'POST' && revokeInviteMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const invitationId = revokeInviteMatch[1];
        const result = invitationService.revokeInvitation(user.id, invitationId);
        sendJson(res, 200, result);
        return;
      }

      // 58. Resend / Regenerate Invitation (T046)
      const resendInviteMatch = pathname.match(/^\/api\/author\/invitations\/([a-zA-Z0-9_-]+)\/resend$/);
      if (method === 'POST' && resendInviteMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const invitationId = resendInviteMatch[1];
        const result = invitationService.resendOrRegenerateInvitation(user.id, invitationId);
        sendJson(res, 200, result);
        return;
      }

      // 59. Preview Invitation (T046)
      const previewInviteMatch = pathname.match(/^\/api\/invitations\/([a-zA-Z0-9_-]+)$/);
      if (method === 'GET' && previewInviteMatch) {
        const inviteToken = previewInviteMatch[1];
        const preview = invitationService.getInvitationPreview(inviteToken);
        sendJson(res, 200, preview);
        return;
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
        return;
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
        const wasCourseComplete = learningProgressService.getCourseProgress(user.id, enrollmentId).isCourseCompleted;
        const priorProgress = db.prepare('SELECT is_completed FROM step_progress WHERE enrollment_id = ? AND step_id = ?').get(enrollmentId, stepId) as { is_completed: number } | undefined;
        const progress = learningProgressService.markStepComplete(user.id, enrollmentId, stepId);
        if (!priorProgress?.is_completed) recordProductEvent({ eventName: 'step.completed', userId: user.id, enrollmentId, stepId });
        if (!wasCourseComplete && progress.isCourseCompleted) recordProductEvent({ eventName: 'course.completed', userId: user.id, enrollmentId });
        sendJson(res, 200, progress);
        return;
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
        return;
      }

      // 62b. Record Hint Reveal (T076)
      const hintRevealMatch = pathname.match(
        /^\/api\/enrollments\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)\/hint-reveal$/
      );
      if (method === 'POST' && hintRevealMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const enrollmentId = hintRevealMatch[1];
        const stepId = hintRevealMatch[2];

        const enrollment = db
          .prepare('SELECT user_id, status, course_id, pinned_version_id FROM enrollments WHERE id = ?')
          .get(enrollmentId) as { user_id: string; status: string; course_id: string; pinned_version_id: string } | undefined;
        if (!enrollment || enrollment.user_id !== user.id || enrollment.status !== 'active') {
          throw new NotFoundError("This page isn't available.");
        }

        const course = db.prepare('SELECT is_suspended FROM courses WHERE id = ?').get(enrollment.course_id) as { is_suspended: number } | undefined;
        if (!course || course.is_suspended) {
          throw new AuthorizationError('Course access is suspended.');
        }

        // Verify step exists in the enrollment's pinned version snapshot
        const versionRow = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(enrollment.pinned_version_id) as { snapshot_data: string } | undefined;
        if (!versionRow || !versionRow.snapshot_data) {
          throw new NotFoundError("This page isn't available.");
        }

        let snapshot: any;
        try {
          snapshot = JSON.parse(versionRow.snapshot_data);
        } catch {
          throw new NotFoundError("This page isn't available.");
        }

        let foundStep: any = null;
        for (const mod of snapshot.modules || []) {
          for (const les of mod.lessons || []) {
            for (const st of les.steps || []) {
              if (st.id === stepId) {
                foundStep = st;
                break;
              }
            }
            if (foundStep) break;
          }
          if (foundStep) break;
        }

        if (!foundStep) {
          throw new NotFoundError("This page isn't available.");
        }

        // Hint eligibility comes only from the immutable version pinned to this enrollment.
        const hints = foundStep.type === 'python' && Array.isArray(foundStep.content?.hints)
          ? foundStep.content.hints
          : [];
        if (hints.length === 0) {
          throw new ValidationError('This exercise does not have any hints.');
        }

        const body = await parseJsonBody(req);
        const hintIndex = body?.hintIndex;
        if (!Number.isInteger(hintIndex) || hintIndex < 0 || hintIndex >= hints.length) {
          throw new ValidationError(`Invalid hint index: must be between 0 and ${hints.length - 1}.`);
        }

        recordProductEvent({
          eventName: 'hint.revealed',
          userId: user.id,
          enrollmentId,
          stepId,
          idempotencyKey: `${enrollmentId}:${enrollment.pinned_version_id}:${stepId}:${hintIndex}`,
          metadata: { hintIndex },
        });

        sendJson(res, 200, { success: true, hintIndex });
        return;
      }

      // 63. Get Course Progress (T047)
      const progressMatch = pathname.match(/^\/api\/enrollments\/([a-zA-Z0-9_-]+)\/progress$/);
      if (method === 'GET' && progressMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const enrollmentId = progressMatch[1];
        const progress = learningProgressService.getCourseProgress(user.id, enrollmentId);
        sendJson(res, 200, progress);
        return;
      }

      // 64. Student Dashboard (T048, P09)
      if (method === 'GET' && pathname === '/api/student/dashboard') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const enrollments = enrollmentService.listStudentEnrollments(user.id);
        const activeEnrollments = enrollments.filter((e) => e.status === 'active' && !e.isSuspended);

        const coursesWithProgress = activeEnrollments.map((enr) => {
          const prog = learningProgressService.getCourseProgress(user.id, enr.id);
          return {
            enrollment: enr,
            progress: prog,
          };
        });

        const continueItem =
          coursesWithProgress.find((c) => !c.progress.isCompleted) ||
          coursesWithProgress[0] ||
          null;

        sendJson(res, 200, {
          continueCourse: continueItem
            ? {
                courseId: continueItem.enrollment.courseId,
                enrollmentId: continueItem.enrollment.id,
                title: continueItem.enrollment.courseTitle,
                description: continueItem.enrollment.courseDescription,
                pinnedVersionNumber: continueItem.enrollment.pinnedVersionNumber,
                percentage: continueItem.progress.percentage,
                completedRequired: continueItem.progress.completedRequired,
                totalRequired: continueItem.progress.totalRequired,
                isCompleted: continueItem.progress.isCompleted,
                nextIncompleteStepId: continueItem.progress.nextIncompleteStepId,
                lastVisitedStepId: continueItem.progress.lastVisitedStepId,
              }
            : null,
          recentCourses: coursesWithProgress.slice(0, 5).map((c) => ({
            courseId: c.enrollment.courseId,
            enrollmentId: c.enrollment.id,
            title: c.enrollment.courseTitle,
            description: c.enrollment.courseDescription,
            difficulty: c.enrollment.difficulty,
            percentage: c.progress.percentage,
            isCompleted: c.progress.isCompleted,
            status: c.enrollment.status,
            updatedAt: c.enrollment.updatedAt,
            nextStepId: c.progress.nextIncompleteStepId || c.progress.lastVisitedStepId,
          })),
        });
        return;
      }

      // 65. Student My Courses (T048, P10)
      if (method === 'GET' && pathname === '/api/student/courses') {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const enrollments = enrollmentService.listStudentEnrollments(user.id);
        const results = enrollments.map((enr) => {
          let prog: any = null;
          try {
            prog = learningProgressService.getCourseProgress(user.id, enr.id);
          } catch {
            prog = null;
          }
          return {
            ...enr,
            progress: prog
              ? {
                  percentage: prog.percentage,
                  completedRequired: prog.completedRequired,
                  totalRequired: prog.totalRequired,
                  isCompleted: prog.isCompleted,
                  nextIncompleteStepId: prog.nextIncompleteStepId,
                  lastVisitedStepId: prog.lastVisitedStepId,
                }
              : null,
          };
        });
        sendJson(res, 200, { enrollments: results });
        return;
      }

      // 66. Get Enrolled Step View (T049, T050, T051)
      const enrolledStepMatch = pathname.match(
        /^\/api\/enrollments\/([a-zA-Z0-9_-]+)\/steps\/([a-zA-Z0-9_-]+)$/
      );
      if (method === 'GET' && enrolledStepMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const enrollmentId = enrolledStepMatch[1];
        const stepId = enrolledStepMatch[2];

        const progress = learningProgressService.getCourseProgress(user.id, enrollmentId);
        const stepMeta = progress.steps.find((s) => s.id === stepId);
        if (!stepMeta) throw authService.safeNotFound();

        const enr = db.prepare('SELECT pinned_version_id FROM enrollments WHERE id = ?').get(enrollmentId) as any;
        const ver = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(enr.pinned_version_id) as any;
        const snapshot = JSON.parse(ver.snapshot_data);
        let stepSnapshot: any = null;
        for (const m of snapshot.modules || []) {
          for (const l of m.lessons || []) {
            for (const s of l.steps || []) {
              if (s.id === stepId) {
                stepSnapshot = s;
                break;
              }
            }
          }
        }

        const stepIdx = progress.steps.findIndex((s) => s.id === stepId);
        const previousStepId = stepIdx > 0 ? progress.steps[stepIdx - 1].id : null;
        const nextStepId = stepIdx < progress.steps.length - 1 ? progress.steps[stepIdx + 1].id : null;

        learningProgressService.recordStepVisit(user.id, enrollmentId, stepId);

        let studentContent = stepSnapshot?.content;
        if (stepMeta.type === 'quiz' && studentContent && !stepMeta.isCompleted) {
          studentContent = {
            ...studentContent,
            options: (studentContent.options || []).map((o: any) => ({
              id: o.id,
              text: o.text,
            })),
            explanation: undefined,
          };
        }

        sendJson(res, 200, {
          step: {
            ...(stepSnapshot || stepMeta),
            content: studentContent,
          },
          stepMeta,
          progress,
          previousStepId,
          nextStepId,
          courseTitle: progress.courseTitle,
          courseId: progress.courseId,
          enrollmentId,
        });
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

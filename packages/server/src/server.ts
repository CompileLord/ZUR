import http from 'node:http';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ZURError } from 'zur-shared';
import { runPythonIsolated } from 'zur-worker';

import { IdentityService } from './services/identity-service.ts';
import { AuthorizationService } from './services/auth-service.ts';
import { ExecutionService } from './services/execution-service.ts';
import { DraftService } from './services/draft-service.ts';
import { AttemptService } from './services/attempt-service.ts';
import { CourseService } from './services/course-service.ts';
import { CourseStructureService } from './services/course-structure-service.ts';
import { MediaService } from './services/media-service.ts';
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
import { OperationalMetricsService } from './services/operational-metrics-service.ts';
import { parseJsonBody as parseJsonBodyLimited, HttpRejection } from './http/body.ts';
import { getClientIp } from './http/client-ip.ts';
import { applySecurityHeaders, applyCorsHeaders, handlePreflight, assertCsrfSafe } from './http/security.ts';
import { accessLogEnabled, writeAccessLog, requestContext, resolveRequestId, checkReadiness } from './http/observability.ts';
import type { RouteContext, RouteDependencies } from './http/routes/context.ts';
import { handleAuthRoutes } from './http/routes/auth.ts';
import { handleAccountRoutes } from './http/routes/account.ts';
import { handleDraftAndExecutionRoutes } from './http/routes/drafts-execution.ts';
import { handleAdminOperationsRoutes } from './http/routes/admin-operations.ts';
import { handleAdminModerationRoutes } from './http/routes/admin-moderation.ts';
import { handleAttemptRoutes } from './http/routes/attempts.ts';
import { handleAuthorCourseRoutes } from './http/routes/author-courses.ts';
import { handleAuthorRosterRoutes } from './http/routes/author-roster.ts';
import { handleAuthorInvitationRoutes } from './http/routes/author-invitations.ts';
import { handleAnalyticsRoutes } from './http/routes/analytics.ts';
import { handleAuthorTokenRoutes } from './http/routes/author-tokens.ts';
import { handleAuthorActivityRoutes } from './http/routes/author-activity.ts';
import { handleCatalogRoutes } from './http/routes/catalog.ts';
import { handleAuthorStructureRoutes } from './http/routes/author-structure.ts';
import { handleAuthorStepContentRoutes } from './http/routes/author-step-content.ts';
import { handleAssetRoutes } from './http/routes/assets.ts';
import { handleAuthorReferencePreviewRoutes } from './http/routes/author-reference-preview.ts';
import { handleLearnerEnrollmentRoutes } from './http/routes/learner-enrollment.ts';
import { handleLearnerProgressRoutes } from './http/routes/learner-progress.ts';

// Order matters: several path patterns overlap, so the first handler that matches wins.
const routeHandlers: Array<(rc: RouteContext) => Promise<boolean>> = [
  handleAuthRoutes,
  handleAccountRoutes,
  handleDraftAndExecutionRoutes,
  handleAdminOperationsRoutes,
  handleAdminModerationRoutes,
  handleAttemptRoutes,
  handleAuthorCourseRoutes,
  handleAuthorRosterRoutes,
  handleAuthorInvitationRoutes,
  handleAnalyticsRoutes,
  handleAuthorTokenRoutes,
  handleAuthorActivityRoutes,
  handleCatalogRoutes,
  handleAuthorStructureRoutes,
  handleAuthorStepContentRoutes,
  handleAssetRoutes,
  handleAuthorReferencePreviewRoutes,
  handleLearnerEnrollmentRoutes,
  handleLearnerProgressRoutes,
];

export function createServer(
  db: DatabaseSync,
  dependencies: { emailDeliveryService?: EmailDeliveryService; operationalMetrics?: OperationalMetricsService; uploadDir?: string; runner?: typeof runPythonIsolated; timeouts?: Partial<{ headersTimeout: number; requestTimeout: number; keepAliveTimeout: number; maxHeadersCount: number; connectionsCheckingInterval: number }> } = {}
): http.Server {

  const runPython = dependencies.runner || runPythonIsolated;
  const identityService = new IdentityService(db);
  const authService = new AuthorizationService(db);
  const executionService = new ExecutionService(db);
  const draftService = new DraftService(db);
  const attemptService = new AttemptService(db);
  const courseService = new CourseService(db);
  const courseStructureService = new CourseStructureService(db);
  const mediaService = new MediaService(db, dependencies.uploadDir);
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
  const operationalMetrics = dependencies.operationalMetrics || new OperationalMetricsService();
  const adminService = new AdminService(db, operationalMetrics);

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
        try { return [k, decodeURIComponent(v.join('='))]; } catch { return [k, '']; }
      })
    );
  }

  // Token create/replace re-verify the account password; bound guessing from a stolen session.
  function limitTokenPasswordChecks(userId: string): void {
    identityService.consumeRequestRateLimit('token-reauth', userId, 10, 15 * 60 * 1000);
  }

  function getSessionToken(req: http.IncomingMessage): string | null {
    const bearer = /^Bearer\s+(\S+)/i.exec(req.headers.authorization || '')?.[1];
    if (bearer) return bearer;
    const cookies = parseCookies(req);
    return cookies.zur_session || null;
  }

  // Default 1 MiB cap; only the base64 asset upload route passes a larger one.
  function parseJsonBody(req: http.IncomingMessage, limit?: number): Promise<any> {
    return parseJsonBodyLimited(req, limit);
  }

  function sendJson(res: http.ServerResponse, status: number, body: any, headers: Record<string, string> = {}): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      ...headers,
    });
    res.end(payload);
  }

  const routeDependencies: RouteDependencies = {
    db, runPython, identityService, authService, executionService, draftService, attemptService, courseService,
    courseStructureService, mediaService, quizService, exerciseAuthoringService, courseAutosaveService,
    courseValidationService, coursePublicationService, courseLifecycleService, enrollmentService, invitationService,
    learningProgressService, mcpTokenService, agentActivityService, draftRecoveryService, teacherRosterService,
    productAnalyticsService, emailDeliveryService, operationalMetrics, adminService,
    parseJsonBody, sendJson, getSessionToken, limitTokenPasswordChecks, recordProductEvent, deliverCourseInvitation,
  };

  const timeouts = { headersTimeout: 10_000, requestTimeout: 30_000, keepAliveTimeout: 65_000, maxHeadersCount: 100, connectionsCheckingInterval: 2_000, ...dependencies.timeouts };

  // Remember the authenticated user per request for the access log (no re-lookup, no extra DB work).
  const originalAuthenticateSession = identityService.authenticateSession.bind(identityService);
  (identityService as any).authenticateSession = (...args: Parameters<typeof originalAuthenticateSession>) => {
    const result = originalAuthenticateSession(...args);
    const store = requestContext.getStore();
    if (store && result?.user?.id) store.userId = result.user.id;
    return result;
  };

  const server = http.createServer({ connectionsCheckingInterval: timeouts.connectionsCheckingInterval }, (req, res) => {
    void requestContext.run({}, () => handleRequest(req, res));
  });
  server.headersTimeout = timeouts.headersTimeout;
  server.requestTimeout = timeouts.requestTimeout;
  server.keepAliveTimeout = timeouts.keepAliveTimeout;
  server.maxHeadersCount = timeouts.maxHeadersCount;

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const requestStartedAt = performance.now();
    const requestId = resolveRequestId(req.headers['x-request-id'], () => crypto.randomUUID());
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    res.setHeader('X-Request-Id', requestId);
    applySecurityHeaders(req, res);
    const logEnabled = accessLogEnabled();
    const ctx = requestContext.getStore();
    res.once('finish', () => {
      const ms = performance.now() - requestStartedAt;
      operationalMetrics.recordRequest(req.method || 'GET', pathname, res.statusCode, ms);
      if (logEnabled) writeAccessLog({ requestId, method: req.method || 'GET', path: pathname, status: res.statusCode, ms, userId: ctx?.userId, ip: getClientIp(req) });
    });

    // MCP clients are not browsers; the MCP transport owns its own Origin/CORS policy.
    if (mcpTransport.isMcpRequest(pathname)) {
      await mcpTransport.handleHttpRequest(req, res);
      return;
    }

    // CORS preflight: allowlisted origins only (default: none in production).
    if (req.method === 'OPTIONS') {
      handlePreflight(req, res);
      return;
    }
    applyCorsHeaders(req, res);

    const method = req.method?.toUpperCase();

    try {
      assertCsrfSafe(req);

      if (method === 'GET' && pathname === '/healthz') {
        db.prepare('SELECT 1').get();
        sendJson(res, 200, { status: 'ok' });
        return;
      }

      if (method === 'GET' && pathname === '/readyz') {
        const readiness = checkReadiness(db);
        sendJson(res, readiness.ok ? 200 : 503, readiness.body);
        return;
      }

      // Route modules run in the order the handlers were originally declared; the first to handle the request wins.
      const token = getSessionToken(req);
      const routeContext: RouteContext = {
        ...routeDependencies,
        req, res, url, pathname, method, token,
        adminPage: (limitName='limit', offsetName='offset') => ({ limit: Number(url.searchParams.get(limitName) || 20), offset: Number(url.searchParams.get(offsetName) || 0) }),
      };
      for (const handleRoutes of routeHandlers) {
        if (await handleRoutes(routeContext)) return;
      }

      // Fallback: Safe 404 (T018)
      throw authService.safeNotFound();

    } catch (err) {
      if (err instanceof HttpRejection) {
        // The request body was not consumed: answer, then drop the connection.
        res.once('finish', () => req.destroy());
        sendJson(res, err.statusCode, err.toJSON(), { Connection: 'close' });
      } else if (err instanceof ZURError) {
        sendJson(res, err.statusCode, err.toJSON());
      } else {
        console.error(JSON.stringify({ level: 'error', event: 'http.unhandled', requestId, err: err instanceof Error ? err.stack : String(err) }));
        sendJson(res, 500, {
          error: {
            code: 'INFRASTRUCTURE_ERROR',
            message: "This page isn't available.",
            requestId,
          },
        });
      }
    }
  }
  (server as any).mcpServer = mcpServer;
  (server as any).mcpAuthService = mcpServer.getAuthService();
  (server as any).mcpTokenService = mcpTokenService;
  return server;
}

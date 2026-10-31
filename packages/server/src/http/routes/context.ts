import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { runPythonIsolated } from 'zur-worker';
import type { IdentityService } from '../../services/identity-service.ts';
import type { AuthorizationService } from '../../services/auth-service.ts';
import type { ExecutionService } from '../../services/execution-service.ts';
import type { DraftService } from '../../services/draft-service.ts';
import type { AttemptService } from '../../services/attempt-service.ts';
import type { CourseService } from '../../services/course-service.ts';
import type { CourseStructureService } from '../../services/course-structure-service.ts';
import type { MediaService } from '../../services/media-service.ts';
import type { QuizService } from '../../services/quiz-service.ts';
import type { ExerciseAuthoringService } from '../../services/exercise-authoring-service.ts';
import type { CourseAutosaveService } from '../../services/course-autosave-service.ts';
import type { CourseValidationService } from '../../services/course-validation-service.ts';
import type { CoursePublicationService } from '../../services/course-publication-service.ts';
import type { CourseLifecycleService } from '../../services/course-lifecycle-service.ts';
import type { EnrollmentService } from '../../services/enrollment-service.ts';
import type { InvitationService } from '../../services/invitation-service.ts';
import type { LearningProgressService } from '../../services/learning-progress-service.ts';
import type { McpTokenService } from '../../services/mcp-token-service.ts';
import type { AgentActivityService } from '../../services/agent-activity-service.ts';
import type { DraftRecoveryService } from '../../services/draft-recovery-service.ts';
import type { TeacherRosterService } from '../../services/teacher-roster-service.ts';
import type { ProductAnalyticsService } from '../../services/product-analytics-service.ts';
import type { EmailDeliveryService } from '../../services/email-delivery-service.ts';
import type { AdminService } from '../../services/admin-service.ts';
import type { OperationalMetricsService } from '../../services/operational-metrics-service.ts';

// Services and helpers created once per server instance in createServer.
export interface RouteDependencies {
  db: DatabaseSync;
  runPython: typeof runPythonIsolated;
  identityService: IdentityService;
  authService: AuthorizationService;
  executionService: ExecutionService;
  draftService: DraftService;
  attemptService: AttemptService;
  courseService: CourseService;
  courseStructureService: CourseStructureService;
  mediaService: MediaService;
  quizService: QuizService;
  exerciseAuthoringService: ExerciseAuthoringService;
  courseAutosaveService: CourseAutosaveService;
  courseValidationService: CourseValidationService;
  coursePublicationService: CoursePublicationService;
  courseLifecycleService: CourseLifecycleService;
  enrollmentService: EnrollmentService;
  invitationService: InvitationService;
  learningProgressService: LearningProgressService;
  mcpTokenService: McpTokenService;
  agentActivityService: AgentActivityService;
  draftRecoveryService: DraftRecoveryService;
  teacherRosterService: TeacherRosterService;
  productAnalyticsService: ProductAnalyticsService;
  emailDeliveryService: EmailDeliveryService;
  operationalMetrics: OperationalMetricsService;
  adminService: AdminService;
  parseJsonBody(req: http.IncomingMessage, limit?: number): Promise<any>;
  sendJson(res: http.ServerResponse, status: number, body: any, headers?: Record<string, string>): void;
  getSessionToken(req: http.IncomingMessage): string | null;
  limitTokenPasswordChecks(userId: string): void;
  recordProductEvent(input: {
    eventName: import('zur-shared').DomainEventName;
    userId: string;
    courseId?: string;
    enrollmentId?: string;
    stepId?: string;
    courseVersionId?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): void;
  deliverCourseInvitation(ownerId: string, invitationId: string, courseId: string, token: string): Promise<any>;
}

// Per-request view handed to every route module: dependencies plus the parsed request.
export interface RouteContext extends RouteDependencies {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  pathname: string;
  method: string | undefined;
  // Session token from the Bearer header or session cookie; null when absent.
  token: string | null;
  adminPage(limitName?: string, offsetName?: string): { limit: number; offset: number };
}

export type UserCapability = 'student' | 'author' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'pending_deletion' | 'purged';

export interface User {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  capabilities: UserCapability[];
  accountStatus: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export type CourseVisibility = 'public' | 'unlisted' | 'private';
export type EnrollmentPolicy = 'open' | 'invitation_only';
export type PublicationStatus = 'draft' | 'published' | 'archived';

export interface Category {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface Course {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  categoryId: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  language: string;
  learningOutcomes: string[];
  prerequisites: string;
  estimatedDurationMinutes: number;
  visibility: CourseVisibility;
  enrollmentPolicy: EnrollmentPolicy;
  publicationStatus: PublicationStatus;
  isSuspended: boolean;
  draftRevision: number;
  currentVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseVersion {
  id: string;
  courseId: string;
  versionNumber: number;
  snapshotData: CourseVersionSnapshot;
  createdAt: string;
}

export interface CourseVersionSnapshot {
  courseId: string;
  versionNumber: number;
  title: string;
  description: string;
  categoryId: string;
  tags: string[];
  difficulty: string;
  language: string;
  learningOutcomes: string[];
  prerequisites: string;
  estimatedDurationMinutes: number;
  modules: ModuleSnapshot[];
  publishedAt: string;
}

export interface ModuleSnapshot {
  id: string;
  title: string;
  position: number;
  lessons: LessonSnapshot[];
}

export interface LessonSnapshot {
  id: string;
  title: string;
  description?: string;
  position: number;
  steps: StepSnapshot[];
}

export type StepType = 'theory' | 'video' | 'quiz' | 'python';

export interface StepSnapshot {
  id: string;
  type: StepType;
  title: string;
  position: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
  content: StepContentPayload;
}

export interface Module {
  id: string;
  courseId: string;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  description?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Step {
  id: string;
  lessonId: string;
  type: StepType;
  title: string;
  position: number;
  isRequired: boolean;
  estimatedDurationMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface TheoryContent {
  kind: 'theory';
  markdown: string;
}

export interface VideoContent {
  kind: 'video';
  videoUrl: string;
  provider: 'youtube' | 'vimeo';
  transcript: string;
  captionVerified: boolean;
}

export interface QuizOption {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface QuizContent {
  kind: 'quiz';
  quizType: 'single_choice' | 'multiple_choice';
  prompt: string;
  options: QuizOption[];
  explanation?: string;
}

export interface TestCase {
  id: string;
  stepId: string;
  stdin: string;
  expectedStdout: string;
  isHidden: boolean;
  position: number;
  createdAt: string;
}

export interface PythonExerciseContent {
  kind: 'python';
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  referenceSolution?: string;
  hints: string[];
  solutionExplanation?: string;
  runtimeLimits: {
    cpuTimeoutSeconds: number;
    wallTimeoutSeconds: number;
    memoryLimitMib: number;
  };
  testCases?: TestCase[];
}

export type StepContentPayload = TheoryContent | VideoContent | QuizContent | PythonExerciseContent;

export type EnrollmentStatus = 'active' | 'left' | 'revoked';

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  pinnedVersionId: string;
  status: EnrollmentStatus;
  lastVisitedStepId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InvitationType = 'email' | 'shareable_link';

export interface Invitation {
  id: string;
  courseId: string;
  inviterId: string;
  tokenHash: string;
  recipientEmail?: string | null;
  type: InvitationType;
  maxUses?: number | null;
  usesCount: number;
  expiresAt: string;
  isRevoked: boolean;
  createdAt: string;
  emailDeliveryStatus?: 'not_applicable' | 'pending' | 'sent' | 'failed' | 'not_configured';
  emailSentAt?: string | null;
}

export interface CodeDraft {
  id: string;
  userId: string;
  enrollmentId: string;
  stepId: string;
  code: string;
  revision: number;
  updatedAt: string;
}

export type JobType = 'run_samples' | 'run_custom' | 'submit' | 'author_validation';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ExecutionJob {
  id: string;
  userId: string;
  enrollmentId?: string | null;
  stepId: string;
  jobType: JobType;
  code: string;
  stdin?: string | null;
  idempotencyKey?: string | null;
  status: JobStatus;
  leaseExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TerminalVerdict =
  | 'PASSED'
  | 'WRONG_ANSWER'
  | 'SYNTAX_ERROR'
  | 'RUNTIME_ERROR'
  | 'TIME_LIMIT'
  | 'MEMORY_LIMIT'
  | 'OUTPUT_LIMIT'
  | 'INTERNAL_ERROR';

export interface AssessmentAttempt {
  id: string;
  userId: string;
  enrollmentId: string;
  stepId: string;
  courseVersionId: string;
  attemptNumber: number;
  type: 'quiz' | 'python';
  verdict: TerminalVerdict;
  codeSnapshot?: string | null;
  selectedOptionIds?: string[] | null;
  executionTimeMs?: number | null;
  isInfrastructureFailure: boolean;
  createdAt: string;
}

export interface StepProgress {
  id: string;
  userId: string;
  enrollmentId: string;
  stepId: string;
  isCompleted: boolean;
  completedAt?: string | null;
  isWaived: boolean;
  waiverReason?: string | null;
  waivedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MediaProcessingStatus = 'processing' | 'ready' | 'quarantined' | 'failed';

export interface MediaAsset {
  id: string;
  courseId: string;
  uploaderId: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  dimensions?: { width: number; height: number } | null;
  altText?: string | null;
  isDecorative: boolean;
  caption?: string | null;
  processingStatus: MediaProcessingStatus;
  referenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ReportStatus = 'open' | 'investigating' | 'resolved';
export type ReportType = 'broken_exercise' | 'inappropriate_content' | 'other';

export interface Report {
  id: string;
  reporterId: string;
  courseId: string;
  courseVersionId?: string | null;
  stepId?: string | null;
  type: ReportType;
  description: string;
  submittedCode?: string | null;
  status: ReportStatus;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  correlationId?: string | null;
  createdAt: string;
}

export type TokenScope =
  | 'courses:read'
  | 'courses:create'
  | 'content:write'
  | 'content:delete'
  | 'media:write'
  | 'exercises:validate'
  | 'courses:publish'
  | 'courses:manage';

export interface AuthorAccessToken {
  id: string;
  authorId: string;
  tokenIdentifier: string;
  tokenHash: string;
  label: string;
  scopes: TokenScope[];
  courseRestrictions: string[] | null;
  expiresAt: string;
  isRevoked: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
}

export interface AgentMutation {
  id: string;
  tokenId: string;
  authorId: string;
  courseId: string;
  toolName: string;
  idempotencyKey: string;
  baseRevision: number;
  newRevision: number;
  affectedEntities: string[];
  priorContent?: string | null;
  outcome: string;
  correlationId?: string | null;
  createdAt: string;
}

export interface RecoveryRevision {
  id: string;
  courseId: string;
  revisionNumber: number;
  contentSnapshot: string;
  createdBy: string;
  reason: string;
  createdAt: string;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface UserPreferences {
  userId: string;
  theme: 'dark' | 'light' | 'system';
  editorFontSize: number;
  indentationSpaces: number;
  updatedAt: string;
}

export type PrivacyRequestType = 'export' | 'deletion';
export type PrivacyRequestStatus = 'submitted' | 'pending' | 'completed' | 'failed';

export interface PrivacyRequest {
  id: string;
  userId: string;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;
  consequenceAcknowledged: boolean;
  blockerReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  sessionId: string;
  token: string;
  expiresAt: string;
  user: User;
}

export interface TestCaseResult {
  position: number;
  passed: boolean;
  verdict: TerminalVerdict;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  stderr?: string;
  executionTimeMs?: number;
  isHidden?: boolean;
  errorMessage?: string;
}

export interface ExecutionResult {
  jobId: string;
  attemptId?: string;
  verdict: TerminalVerdict;
  isInfrastructureFailure: boolean;
  executionTimeMs: number;
  testResults: TestCaseResult[];
  guidance?: string;
  completedAt?: string;
}

export interface CodeDraftResponse {
  id?: string;
  enrollmentId: string;
  stepId: string;
  code: string;
  revision: number;
  isStarter?: boolean;
  updatedAt: string;
}

export interface DraftConflictResponse {
  error: 'STALE_REVISION';
  currentRevision: number;
  serverCode: string;
}

export interface ValidationErrorItem {
  moduleId?: string;
  lessonId?: string;
  stepId?: string;
  field?: string;
  message: string;
  blocking: boolean;
}

export interface ValidationWarningItem {
  moduleId?: string;
  lessonId?: string;
  stepId?: string;
  field?: string;
  message: string;
}

export interface CourseValidationResult {
  isValid: boolean;
  draftRevision: number;
  errors: ValidationErrorItem[];
  warnings: ValidationWarningItem[];
}

export interface PublicationReceipt {
  versionNumber: number;
  versionId: string;
  publishedAt: string;
  studentCountPinnedToOldVersions: number;
}

export interface RosterItem {
  enrollmentId: string;
  studentId: string;
  displayName: string;
  maskedEmail: string;
  pinnedVersionNumber: number;
  status: EnrollmentStatus;
  enrolledAt: string;
  lastActivityAt?: string | null;
  completedStepsCount: number;
  totalRequiredStepsCount: number;
  progressPercent: number;
}

export interface CourseRosterResponse {
  students: RosterItem[];
  total: number;
  limit: number;
  offset: number;
  versions: Array<{ id: string; versionNumber: number }>;
}

export interface OwnerStudentStepProgress {
  id?: string;
  stepId: string;
  title?: string;
  type?: StepType;
  isRequired?: boolean;
  position?: number;
  ordinal?: number;
  isCompleted: boolean;
  satisfied?: boolean;
  completedAt?: string | null;
  isWaived: boolean;
  waiverReason?: string | null;
  waivedAt?: string | null;
  attemptsCount: number;
  submissionCount?: number;
  bestScore?: number | null;
}

export interface OwnerStudentLessonItem {
  id?: string;
  lessonId: string;
  title: string;
  position: number;
  ordinal?: number;
  steps: OwnerStudentStepProgress[];
}

export interface OwnerStudentModuleItem {
  id?: string;
  moduleId: string;
  title: string;
  position: number;
  ordinal?: number;
  lessons: OwnerStudentLessonItem[];
}

export interface OwnerAssessmentAttemptItem {
  id?: string;
  attemptId: string;
  stepId: string;
  attemptNumber: number;
  type: 'quiz' | 'python';
  verdict: TerminalVerdict | string;
  codeSnapshot?: string | null;
  submittedCode?: string | null;
  selectedOptionIds?: string[] | null;
  executionTimeMs?: number | null;
  isInfrastructureFailure: boolean;
  createdAt: string;
  submittedAt?: string;
  score?: number | null;
  isLatest?: boolean;
}

export interface OwnerStudentDetailResponse {
  enrollment: {
    id: string;
    courseId: string;
    courseTitle: string;
    courseVersionId: string;
    versionNumber: number | null;
    status: EnrollmentStatus;
    enrolledAt: string;
    revokedAt?: string | null;
    revocationReason?: string | null;
    completedAt?: string | null;
  };
  student: {
    id?: string;
    enrollmentId: string;
    studentId: string;
    displayName: string;
    email?: string | null;
    maskedEmail?: string;
    status: EnrollmentStatus;
    pinnedVersionNumber: number;
    pinnedVersionId: string;
    enrolledAt: string;
    lastActivityAt?: string | null;
    completedRequired: number;
    totalRequired: number;
    progressPercent: number;
  };
  overallProgress: {
    requiredStepsCompleted: number;
    totalRequiredSteps: number;
    percentage: number;
    lastLearningActivityAt?: string | null;
  };
  curriculum: OwnerStudentModuleItem[];
  stepProgress: Record<string, OwnerStudentStepProgress>;
  attempts: Record<string, OwnerAssessmentAttemptItem[]>;
  attemptList?: OwnerAssessmentAttemptItem[];
  waivers: Record<string, { waivedAt?: string | null; reason: string }>;
}

export interface ExerciseInsightItem {
  stepId: string;
  stepTitle: string;
  lessonTitle: string;
  moduleTitle: string;
  type: StepType;
  distinctParticipants: number;
  distinctPassingStudents: number;
  passRatePercent: number | null;
  medianAttemptsToPass: number | null;
  lastActivityAt?: string | null;
  waiverCount: number;
  infrastructureFailureCount: number;
}

export interface CourseAnalyticsResponse {
  courseId: string;
  versions?: Array<{ id: string; versionNumber: number }>;
  versionNumber?: number | null;
  timeWindowDays?: number | null;
  activeEnrollments: number;
  learningActiveStudents: number;
  completion: {
    completedCount: number;
    totalActive: number;
    ratePercent: number | null;
    count?: number;
    total?: number;
    percentage?: number;
  };
  averageProgressPercent: number | null;
  exercises: ExerciseInsightItem[];
  exerciseInsights?: ExerciseInsightItem[];
}

export type DomainEventName =
  | 'course.created'
  | 'course.published'
  | 'enrollment.accepted'
  | 'step.completed'
  | 'exercise.run'
  | 'exercise.submitted'
  | 'hint.revealed'
  | 'course.completed';

export interface ProductAnalyticsEvent {
  id: string;
  eventName: DomainEventName;
  pseudonymousUserId: string;
  courseId?: string | null;
  courseVersionId?: string | null;
  stepId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

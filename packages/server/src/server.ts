import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { ZURError, AuthenticationError } from 'zur-shared';
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

export function createServer(db: DatabaseSync): http.Server {
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

      // 32. Author: Archive Course
      const authorCourseArchiveMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)\/archive$/);
      if (method === 'POST' && authorCourseArchiveMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseArchiveMatch[1];
        const updated = courseService.archiveCourse(user.id, courseId);
        sendJson(res, 200, updated);
        return;
      }

      // 33. Author: Restore Course
      const authorCourseRestoreMatch = pathname.match(/^\/api\/author\/courses\/([0-9a-fA-F-]+)\/restore$/);
      if (method === 'POST' && authorCourseRestoreMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseRestoreMatch[1];
        const updated = courseService.restoreCourse(user.id, courseId);
        sendJson(res, 200, updated);
        return;
      }

      // 34. Author: Delete Course Draft
      if (method === 'DELETE' && authorCourseMatch) {
        if (!token) throw new AuthenticationError();
        const { user } = identityService.authenticateSession(token);
        const courseId = authorCourseMatch[1];
        const result = courseService.deleteDraft(user.id, courseId);
        sendJson(res, 200, result);
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
        const result = quizService.gradeQuiz(user.id, enrollmentId, stepId, body.selectedOptionIds || [], isPreview);
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

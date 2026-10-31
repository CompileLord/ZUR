import { AuthenticationError, ValidationError, RateLimitError, compareOutput } from 'zur-shared';
import type { RouteContext } from './context.ts';

const activeReferenceChecksPerUser = new Map<string, number>();
let globalActiveReferenceChecks = 0;

// Author reference-solution check and true student preview.
export async function handleAuthorReferencePreviewRoutes(rc: RouteContext): Promise<boolean> {
  const { req, res, pathname, method, token, db, runPython, identityService, authService, courseService, quizService, exerciseAuthoringService, parseJsonBody, sendJson } = rc;

  // Author: Check Reference Solution against Test Cases (F03)
  const authorCheckRefMatch = pathname.match(/^\/api\/author\/steps\/([a-zA-Z0-9_-]+)\/check-reference$/);
  if (method === 'POST' && authorCheckRefMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const stepId = authorCheckRefMatch[1];

    // 1. Check platform execution pause
    const isPaused = (db.prepare("SELECT value FROM system_settings WHERE key='execution_paused'").get() as any)?.value === 'true';
    if (isPaused) {
      throw new ValidationError('Python execution is temporarily paused for maintenance.');
    }

    // 2. Concurrency guard (max 2 per author, max 5 global)
    const userActive = activeReferenceChecksPerUser.get(user.id) || 0;
    if (userActive >= 2 || globalActiveReferenceChecks >= 5) {
      throw new RateLimitError('Too many concurrent reference checks. Please wait.', 2);
    }
    activeReferenceChecksPerUser.set(user.id, userActive + 1);
    globalActiveReferenceChecks += 1;

    try {
      const body = await parseJsonBody(req).catch(() => ({}));
      const ex = exerciseAuthoringService.getAuthorExercise(user.id, stepId);
      const referenceSolution = body.referenceSolution !== undefined
        ? body.referenceSolution
        : ex.referenceSolution;
      if (typeof referenceSolution !== 'string' || !referenceSolution.trim()) {
        throw new ValidationError('Reference solution cannot be empty.');
      }
      if (Buffer.byteLength(referenceSolution, 'utf-8') > 65536) {
        throw new ValidationError('Reference solution exceeds maximum allowed size of 64 KiB.');
      }

      if (body.publicTests !== undefined && !Array.isArray(body.publicTests)) {
        throw new ValidationError('Public tests must be an array.');
      }
      if (body.hiddenTests !== undefined && !Array.isArray(body.hiddenTests)) {
        throw new ValidationError('Hidden tests must be an array.');
      }

      const validateTestCase = (tc: any) => {
        if (!tc || typeof tc !== 'object') throw new ValidationError('Invalid test case payload.');
        if (tc.stdin !== undefined && typeof tc.stdin !== 'string') throw new ValidationError('Test case stdin must be a string.');
        if (tc.expectedStdout !== undefined && typeof tc.expectedStdout !== 'string') throw new ValidationError('Test case expectedStdout must be a string.');
        if (tc.stdin && Buffer.byteLength(tc.stdin, 'utf-8') > 65536) throw new ValidationError('Test case stdin exceeds 64 KiB limit.');
        if (tc.expectedStdout && Buffer.byteLength(tc.expectedStdout, 'utf-8') > 65536) throw new ValidationError('Test case expectedStdout exceeds 64 KiB limit.');
      };

      const publicTests: Array<{ name?: string; stdin: string; expectedStdout: string }> = Array.isArray(body.publicTests)
        ? body.publicTests
        : (ex.publicTests || []);
      const hiddenTests: Array<{ name?: string; stdin: string; expectedStdout: string }> = Array.isArray(body.hiddenTests)
        ? body.hiddenTests
        : (ex.hiddenTests || []);

      for (const tc of publicTests) validateTestCase(tc);
      for (const tc of hiddenTests) validateTestCase(tc);

      const allTests: Array<{ name: string; stdin: string; expectedStdout: string; isHidden: boolean }> = [
        ...publicTests.map((tc, idx) => ({ name: tc.name || `Public Test ${idx + 1}`, stdin: tc.stdin || '', expectedStdout: tc.expectedStdout || '', isHidden: false })),
        ...hiddenTests.map((tc, idx) => ({ name: tc.name || `Hidden Test ${idx + 1}`, stdin: tc.stdin || '', expectedStdout: tc.expectedStdout || '', isHidden: true })),
      ];

      if (allTests.length === 0) {
        throw new ValidationError('Exercise has no test cases configured.');
      }
      if (allTests.length > 25) {
        throw new ValidationError('Reference check is limited to 25 test cases maximum.');
      }

      // 3. Honor configured limits up to safe system maximum
      const configuredWall = Math.min(Math.max(1, Number(ex.runtimeLimits?.wallTimeoutSeconds) || 3), 10);
      const configuredCpu = Math.min(Math.max(1, Number(ex.runtimeLimits?.cpuTimeoutSeconds) || 2), 5);
      const configuredMem = Math.min(Math.max(16, Number(ex.runtimeLimits?.memoryLimitMib) || 128), 256);

      const validationResults: Array<{ name: string; passed: boolean; error?: string; executionTimeMs?: number }> = [];
      let allPassed = true;
      const aggregateDeadline = Date.now() + 12000;

      for (let i = 0; i < allTests.length; i++) {
        const remainingMs = aggregateDeadline - Date.now();
        if (remainingMs < 500) {
          allPassed = false;
          validationResults.push({
            name: allTests[i].name,
            passed: false,
            error: 'Execution budget exceeded. Check stopped before completing remaining tests.',
          });
          break;
        }

        const tc = allTests[i];
        const perTestWallTimeout = Math.min(configuredWall, Math.max(1, Math.floor(remainingMs / 1000)));
        const runOptions = {
          wallTimeoutSeconds: perTestWallTimeout,
          cpuTimeoutSeconds: Math.min(configuredCpu, perTestWallTimeout),
          memoryLimitMib: configuredMem,
        };

        const outcome = await runPython(referenceSolution, tc.stdin || '', runOptions);

        if (outcome.verdict !== 'PASSED') {
          allPassed = false;
          validationResults.push({
            name: tc.name,
            passed: false,
            error: tc.isHidden ? outcome.verdict : (outcome.errorMessage || outcome.verdict),
            executionTimeMs: outcome.executionTimeMs,
          });
          continue;
        }

        const diff = compareOutput(outcome.stdout, tc.expectedStdout || '');
        if (!diff.passed) {
          allPassed = false;
          validationResults.push({
            name: tc.name,
            passed: false,
            error: tc.isHidden
              ? 'Output mismatch on hidden test case.'
              : `Output mismatch. Expected: "${tc.expectedStdout.slice(0, 40)}" · Got: "${outcome.stdout.slice(0, 40)}"`,
            executionTimeMs: outcome.executionTimeMs,
          });
        } else {
          validationResults.push({
            name: tc.name,
            passed: true,
            error: `Passed in ${outcome.executionTimeMs} ms`,
            executionTimeMs: outcome.executionTimeMs,
          });
        }
      }

      sendJson(res, 200, {
        allPassed,
        validationStatus: allPassed ? 'valid' : 'invalid',
        validationResults,
        tests: validationResults,
      });
      return true;
    } finally {
      const current = activeReferenceChecksPerUser.get(user.id) || 1;
      if (current <= 1) activeReferenceChecksPerUser.delete(user.id);
      else activeReferenceChecksPerUser.set(user.id, current - 1);
      globalActiveReferenceChecks = Math.max(0, globalActiveReferenceChecks - 1);
    }
  }

  // 50. True Student Preview Payload (T039)
  const authorPreviewStepMatch = pathname.match(
    /^\/api\/author\/courses\/([a-zA-Z0-9_-]+)\/preview\/([a-zA-Z0-9_-]+)$/
  );
  if (method === 'GET' && authorPreviewStepMatch) {
    if (!token) throw new AuthenticationError();
    const { user } = identityService.authenticateSession(token);
    const courseId = authorPreviewStepMatch[1];
    const stepId = authorPreviewStepMatch[2];
    const course = courseService.getCourse(user.id, courseId);
    const step = db.prepare(`
          SELECT s.* FROM steps s
          JOIN lessons l ON s.lesson_id = l.id
          JOIN modules m ON l.module_id = m.id
          WHERE s.id = ? AND m.course_id = ?
        `).get(stepId, courseId) as any;
    if (!step) throw authService.safeNotFound();

    let previewData: any = null;
    if (step.type === 'quiz') {
      previewData = quizService.getStudentQuiz(user.id, null, stepId, true);
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
    return true;
  }

  return false;
}

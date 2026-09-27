import { DatabaseSync } from 'node:sqlite';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  compareOutput,
  validatePythonSource,
  validateTestCaseInputOutput,
  validateTestCount,
} from 'zur-shared';
import { runPythonIsolated } from 'zur-worker';
import { AuthorValidationQuota } from '../../services/author-validation-quota.ts';
import type { ValidatedMcpToken } from '../../services/mcp-token-service.ts';
import type { McpAuthService } from '../../services/mcp-auth-service.ts';
import type { CourseValidationService } from '../../services/course-validation-service.ts';
import type { CoursePublicationService } from '../../services/course-publication-service.ts';
import type { McpTool, McpToolResult } from '../types.ts';

export function createAssessmentPublicationTools(): McpTool[] {
  return [
    {
      name: 'validate_exercise',
      description: 'Executes a Python reference solution against public and hidden test cases in an isolated runner.',
      inputSchema: {
        type: 'object',
        properties: {
          step_id: { type: 'string', description: 'Optional step ID if validating an existing step' },
          starter_code: { type: 'string', description: 'Initial code provided to learners' },
          reference_solution: { type: 'string', description: 'Authoritative solution code (must pass all tests)' },
          test_cases: {
            type: 'array',
            description: 'Array of test cases to validate against',
            items: {
              type: 'object',
              required: ['stdin', 'expected_stdout'],
              properties: {
                stdin: { type: 'string' },
                expected_stdout: { type: 'string' },
                is_hidden: { type: 'boolean' },
              },
            },
          },
          runtime_limits: {
            type: 'object',
            properties: {
              cpu_timeout_seconds: { type: 'integer', minimum: 1, maximum: 5 },
              wall_timeout_seconds: { type: 'integer', minimum: 1, maximum: 5 },
              memory_limit_mib: { type: 'integer', minimum: 16, maximum: 256 },
            },
          },
        },
        required: ['reference_solution', 'test_cases'],
      },
      annotations: {
        readOnly: true,
      },
      requiredScope: 'exercises:validate',
    },
    {
      name: 'validate_course',
      description: 'Performs full validation of a draft course, checking hierarchy, required steps, media readiness, quiz keys, and exercise solutions.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID to validate' },
        },
        required: ['course_id'],
      },
      annotations: {
        readOnly: true,
      },
      requiredScope: 'exercises:validate',
    },
    {
      name: 'publish_course',
      description: 'Publishes an exact validated revision of a course, creating an immutable snapshot version and updating publication state.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID to publish' },
          expected_revision: { type: 'integer', description: 'Exact draft_revision expected' },
          idempotency_key: { type: 'string', description: 'Optional idempotency key for safe retries' },
          change_summary: { type: 'string', description: 'Description of changes in this release' },
        },
        required: ['course_id', 'expected_revision'],
      },
      annotations: {
        destructive: false,
      },
      requiredScope: 'courses:publish',
    },
  ];
}

export async function executeAssessmentPublicationTool(
  name: string,
  args: any,
  token: ValidatedMcpToken,
  db: DatabaseSync,
  authService: McpAuthService,
  validationService: CourseValidationService,
  publicationService: CoursePublicationService
): Promise<McpToolResult> {
  switch (name) {
    case 'validate_exercise': {
      authService.verifyMcpPermission(token, 'exercises:validate');

      const referenceSolution = args?.reference_solution;
      if (!referenceSolution || typeof referenceSolution !== 'string') {
        throw new ValidationError('reference_solution string is required');
      }
      const sourceCheck = validatePythonSource(referenceSolution);
      if (!sourceCheck.valid) throw new ValidationError(sourceCheck.error || 'Invalid reference solution');

      const testCases = args?.test_cases;
      if (!Array.isArray(testCases) || testCases.length === 0) {
        throw new ValidationError('test_cases array with at least one item is required');
      }
      const testCount = validateTestCount(testCases.length);
      if (!testCount.valid) throw new ValidationError(testCount.error || 'Too many tests');
      for (const tc of testCases) {
        const check = validateTestCaseInputOutput(tc.stdin ?? '', tc.expected_stdout ?? '');
        if (!check.valid) throw new ValidationError(check.error || 'Invalid test case');
      }

      const runLimits = {
        cpuTimeoutSeconds: args?.runtime_limits?.cpu_timeout_seconds || 2,
        wallTimeoutSeconds: args?.runtime_limits?.wall_timeout_seconds || 5,
        memoryLimitMib: args?.runtime_limits?.memory_limit_mib || 128,
      };
      if (runLimits.cpuTimeoutSeconds > 5 || runLimits.wallTimeoutSeconds > 5 || runLimits.memoryLimitMib > 256) {
        throw new ValidationError('Requested runtime limit exceeds the supported execution envelope.');
      }

      const releaseValidation = new AuthorValidationQuota(db).acquire(token.authorId);
      try {

      const results = [];
      let allPassed = true;
      let failedIndex: number | undefined;

      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const stdin = tc.stdin ?? '';
        const expectedStdout = tc.expected_stdout ?? '';

        const outcome = await runPythonIsolated(referenceSolution, stdin, runLimits);
        const passed = outcome.verdict === 'PASSED' && compareOutput(outcome.stdout, expectedStdout).passed;

        results.push({
          index: i,
          isHidden: Boolean(tc.is_hidden),
          verdict: passed ? 'PASSED' : outcome.verdict !== 'PASSED' ? outcome.verdict : 'WRONG_ANSWER',
          passed,
          stdout: outcome.stdout,
          stderr: outcome.stderr,
          wallDurationMs: outcome.executionTimeMs,
        });

        if (!passed && allPassed) {
          allPassed = false;
          failedIndex = i;
        }
      }

      const response = {
        valid: allPassed,
        totalTests: testCases.length,
        passedTests: results.filter((r) => r.passed).length,
        failedIndex,
        results,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
      } finally { releaseValidation(); }
    }

    case 'validate_course': {
      const courseId = args?.course_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');

      authService.verifyMcpPermission(token, 'exercises:validate', courseId);

      const validation = await validationService.validateCourseDraft(token.authorId, courseId);
      return {
        content: [{ type: 'text', text: JSON.stringify(validation, null, 2) }],
      };
    }

    case 'publish_course': {
      const courseId = args?.course_id?.trim();
      if (!courseId) throw new ValidationError('course_id is required');
      const expectedRevision = Number(args?.expected_revision);
      if (!Number.isInteger(expectedRevision)) {
        throw new ValidationError('expected_revision integer is required');
      }

      authService.verifyMcpPermission(token, 'courses:publish', courseId);

      const receipt = await publicationService.publishCourse(token.authorId, courseId, {
        expectedRevision,
        idempotencyKey: args.idempotency_key,
        changeSummary: args.change_summary,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify({ courseId, ...receipt }, null, 2) }],
      };
    }

    default:
      throw new ValidationError(`Unknown assessment publication tool: ${name}`);
  }
}

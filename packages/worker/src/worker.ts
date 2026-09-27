import { compareOutput, isValidUtf8, EXECUTION_BUDGETS } from 'zur-shared';
import type {
  ExecutionResult,
  TestCaseResult,
  TerminalVerdict,
  TestCase,
} from 'zur-shared';
import { runPythonIsolated, type RunOptions } from './runner.ts';

export interface ExecutionJobPayload {
  jobId: string;
  userId: string;
  enrollmentId?: string | null;
  stepId: string;
  jobType: 'run_samples' | 'run_custom' | 'submit' | 'author_validation';
  code: string;
  stdin?: string | null;
  testCases: TestCase[];
  limits?: RunOptions;
  deadlineAt?: string;
}

export async function processExecutionJob(job: ExecutionJobPayload): Promise<ExecutionResult> {
  const { jobId, jobType, code, stdin, testCases, limits } = job;
  const remainingWallSeconds = () => job.deadlineAt
    ? Math.max(0, (Date.parse(job.deadlineAt) - Date.now()) / 1000)
    : 60;
  const boundedLimits = (): RunOptions => ({ ...limits,
    wallTimeoutSeconds: Math.min(limits?.wallTimeoutSeconds ?? 5, remainingWallSeconds()),
  });

  if (!isValidUtf8(code) || Buffer.byteLength(code, 'utf-8') > EXECUTION_BUDGETS.MAX_SOURCE_CODE_BYTES) {
    return {
      jobId,
      verdict: 'INTERNAL_ERROR',
      isInfrastructureFailure: true,
      executionTimeMs: 0,
      testResults: [],
      guidance: 'Source code exceeds size limit (64 KiB) or is invalid UTF-8.',
      completedAt: new Date().toISOString(),
    };
  }

  let totalExecutionTimeMs = 0;
  const testResults: TestCaseResult[] = [];
  let overallVerdict: TerminalVerdict = 'PASSED';
  let isInfrastructureFailure = false;

  if (jobType === 'run_custom') {
    const rawStdin = stdin || '';
    if (!isValidUtf8(rawStdin) || Buffer.byteLength(rawStdin, 'utf-8') > EXECUTION_BUDGETS.MAX_STDIN_BYTES) {
      return {
        jobId,
        verdict: 'INTERNAL_ERROR',
        isInfrastructureFailure: true,
        executionTimeMs: 0,
        testResults: [],
        guidance: 'Custom input exceeds size limit (64 KiB) or is invalid UTF-8.',
        completedAt: new Date().toISOString(),
      };
    }
    if (remainingWallSeconds() <= 0) return { jobId, verdict: 'INTERNAL_ERROR',
      isInfrastructureFailure: true, executionTimeMs: 0, testResults: [], completedAt: new Date().toISOString() };
    const limitedByJobDeadline = remainingWallSeconds() < (limits?.wallTimeoutSeconds ?? 5);
    const outcome = await runPythonIsolated(code, rawStdin, boundedLimits());
    if (limitedByJobDeadline && outcome.verdict === 'TIME_LIMIT') {
      outcome.verdict = 'INTERNAL_ERROR';
      outcome.errorMessage = 'Execution could not complete before its job deadline.';
    }
    totalExecutionTimeMs = outcome.executionTimeMs;

    const testPassed = outcome.verdict === 'PASSED';
    testResults.push({
      position: 0,
      passed: testPassed,
      verdict: outcome.verdict,
      input: stdin || '',
      actualOutput: outcome.stdout,
      stderr: outcome.stderr,
      executionTimeMs: outcome.executionTimeMs,
      errorMessage: outcome.errorMessage,
    });

    overallVerdict = outcome.verdict;
    isInfrastructureFailure = outcome.verdict === 'INTERNAL_ERROR';

    return {
      jobId,
      verdict: overallVerdict,
      isInfrastructureFailure,
      executionTimeMs: totalExecutionTimeMs,
      testResults,
      completedAt: new Date().toISOString(),
    };
  }

  // Filter test cases based on job type:
  // 'run_samples' runs ONLY public test cases (PRD §12.4, AC-08)
  // 'submit' runs public test cases first, then hidden test cases in position order (PRD §12.4, §12.5)
  const testsToRun = jobType === 'run_samples'
    ? testCases.filter((tc) => !tc.isHidden).sort((a, b) => a.position - b.position)
    : [...testCases].sort((a, b) => {
        // Public first, then hidden, then by position
        if (a.isHidden !== b.isHidden) {
          return a.isHidden ? 1 : -1;
        }
        return a.position - b.position;
      });

  for (const tc of testsToRun) {
    if (
      !isValidUtf8(tc.stdin) ||
      Buffer.byteLength(tc.stdin, 'utf-8') > EXECUTION_BUDGETS.MAX_STDIN_BYTES ||
      !isValidUtf8(tc.expectedStdout) ||
      Buffer.byteLength(tc.expectedStdout, 'utf-8') > EXECUTION_BUDGETS.MAX_EXPECTED_STDOUT_BYTES
    ) {
      overallVerdict = 'INTERNAL_ERROR';
      isInfrastructureFailure = true;
      testResults.push({
        position: tc.position,
        passed: false,
        verdict: 'INTERNAL_ERROR',
        input: tc.stdin,
        expectedOutput: tc.expectedStdout,
        actualOutput: '',
        stderr: '',
        executionTimeMs: 0,
        isHidden: tc.isHidden,
        errorMessage: 'Test case input/output exceeds 64 KiB or is invalid UTF-8.',
      });
      break;
    }

    if (remainingWallSeconds() <= 0) {
      overallVerdict = 'INTERNAL_ERROR';
      isInfrastructureFailure = true;
      break;
    }
    const limitedByJobDeadline = remainingWallSeconds() < (limits?.wallTimeoutSeconds ?? 5);
    const outcome = await runPythonIsolated(code, tc.stdin, boundedLimits());
    if (limitedByJobDeadline && outcome.verdict === 'TIME_LIMIT') {
      outcome.verdict = 'INTERNAL_ERROR';
      outcome.errorMessage = 'Execution could not complete before its job deadline.';
    }
    totalExecutionTimeMs += outcome.executionTimeMs;

    if (outcome.verdict === 'INTERNAL_ERROR') {
      isInfrastructureFailure = true;
      overallVerdict = 'INTERNAL_ERROR';
      testResults.push({
        position: tc.position,
        passed: false,
        verdict: 'INTERNAL_ERROR',
        input: tc.stdin,
        expectedOutput: tc.expectedStdout,
        actualOutput: outcome.stdout,
        stderr: outcome.stderr,
        executionTimeMs: outcome.executionTimeMs,
        isHidden: tc.isHidden,
        errorMessage: outcome.errorMessage,
      });
      break;
    }

    if (outcome.verdict !== 'PASSED') {
      overallVerdict = outcome.verdict;
      testResults.push({
        position: tc.position,
        passed: false,
        verdict: outcome.verdict,
        input: tc.stdin,
        expectedOutput: tc.expectedStdout,
        actualOutput: outcome.stdout,
        stderr: outcome.stderr,
        executionTimeMs: outcome.executionTimeMs,
        isHidden: tc.isHidden,
        errorMessage: outcome.errorMessage,
      });
      // Stop on first failure (PRD §12.5)
      break;
    }

    // Runner succeeded with exit code 0; now compare stdout with expected stdout
    const comparison = compareOutput(outcome.stdout, tc.expectedStdout);
    if (!comparison.passed) {
      overallVerdict = 'WRONG_ANSWER';
      testResults.push({
        position: tc.position,
        passed: false,
        verdict: 'WRONG_ANSWER',
        input: tc.stdin,
        expectedOutput: tc.expectedStdout,
        actualOutput: outcome.stdout,
        stderr: outcome.stderr,
        executionTimeMs: outcome.executionTimeMs,
        isHidden: tc.isHidden,
      });
      // Stop on first failure
      break;
    }

    // Test passed
    testResults.push({
      position: tc.position,
      passed: true,
      verdict: 'PASSED',
      input: tc.stdin,
      expectedOutput: tc.expectedStdout,
      actualOutput: outcome.stdout,
      stderr: outcome.stderr,
      executionTimeMs: outcome.executionTimeMs,
      isHidden: tc.isHidden,
    });
  }

  return {
    jobId,
    verdict: overallVerdict,
    isInfrastructureFailure,
    executionTimeMs: totalExecutionTimeMs,
    testResults,
    completedAt: new Date().toISOString(),
  };
}

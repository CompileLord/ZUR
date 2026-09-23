import type { AssessmentAttempt, TestCase } from 'zur-shared';

export interface StudentExecutionResult {
  attemptId: string;
  verdict: string;
  isInfrastructureFailure: boolean;
  publicTestsResults?: Array<{
    position: number;
    passed: boolean;
    input: string;
    expectedOutput: string;
    actualOutput: string;
  }>;
  guidance?: string;
  executionTimeMs?: number | null;
}

export function redactTestCasesForStudent(testCases: TestCase[]): Array<Omit<TestCase, 'stdin' | 'expectedStdout'> & { stdin?: string; expectedStdout?: string }> {
  return testCases
    .filter((tc) => !tc.isHidden)
    .map((tc) => ({
      id: tc.id,
      stepId: tc.stepId,
      stdin: tc.stdin,
      expectedStdout: tc.expectedStdout,
      isHidden: false,
      position: tc.position,
      createdAt: tc.createdAt,
    }));
}

export function redactExecutionResultForStudent(rawResult: {
  attemptId: string;
  verdict: string;
  isInfrastructureFailure: boolean;
  failedTestIsHidden?: boolean;
  publicTestsResults?: Array<{
    position: number;
    passed: boolean;
    input: string;
    expectedOutput: string;
    actualOutput: string;
  }>;
  executionTimeMs?: number | null;
}): StudentExecutionResult {
  if (rawResult.failedTestIsHidden) {
    // PRD §12.5 & AC-10: Hidden failures show only a safe verdict and guidance.
    // Zero hidden stdin, expected stdout, actual stdout/stderr, test indexes, or timing.
    return {
      attemptId: rawResult.attemptId,
      verdict: rawResult.verdict,
      isInfrastructureFailure: rawResult.isInfrastructureFailure,
      guidance: 'Your solution did not pass a hidden test. Review the input limits and edge cases.',
      // publicTestsResults stripped or only showing passed public samples
      publicTestsResults: rawResult.publicTestsResults?.filter((r) => r.passed),
    };
  }

  return {
    attemptId: rawResult.attemptId,
    verdict: rawResult.verdict,
    isInfrastructureFailure: rawResult.isInfrastructureFailure,
    publicTestsResults: rawResult.publicTestsResults,
    executionTimeMs: rawResult.executionTimeMs,
  };
}

export function redactFullExecutionResultForStudent(
  result: {
    jobId: string;
    attemptId?: string;
    verdict: string;
    isInfrastructureFailure: boolean;
    executionTimeMs: number;
    testResults: Array<{
      position: number;
      passed: boolean;
      verdict: string;
      input?: string;
      expectedOutput?: string;
      actualOutput?: string;
      stderr?: string;
      executionTimeMs?: number;
      isHidden?: boolean;
      errorMessage?: string;
    }>;
    guidance?: string;
    completedAt?: string;
  }
) {
  const failedTest = result.testResults.find((t) => !t.passed);
  if (failedTest?.isHidden) {
    return {
      jobId: result.jobId,
      attemptId: result.attemptId,
      verdict: result.verdict,
      isInfrastructureFailure: result.isInfrastructureFailure,
      executionTimeMs: result.executionTimeMs,
      testResults: result.testResults
        .filter((t) => !t.isHidden && t.passed)
        .map((t) => ({
          position: t.position,
          passed: t.passed,
          verdict: t.verdict,
          input: t.input,
          expectedOutput: t.expectedOutput,
          actualOutput: t.actualOutput,
        })),
      guidance: 'Your solution did not pass a hidden test. Review the input limits and edge cases.',
      completedAt: result.completedAt,
    };
  }

  return {
    jobId: result.jobId,
    attemptId: result.attemptId,
    verdict: result.verdict,
    isInfrastructureFailure: result.isInfrastructureFailure,
    executionTimeMs: result.executionTimeMs,
    testResults: result.testResults
      .filter((t) => !t.isHidden)
      .map((t) => ({
        position: t.position,
        passed: t.passed,
        verdict: t.verdict,
        input: t.input,
        expectedOutput: t.expectedOutput,
        actualOutput: t.actualOutput,
        stderr: t.stderr,
        errorMessage: t.errorMessage,
        executionTimeMs: t.executionTimeMs,
      })),
    guidance: result.guidance,
    completedAt: result.completedAt,
  };
}


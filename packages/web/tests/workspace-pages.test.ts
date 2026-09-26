import test from 'node:test';
import assert from 'node:assert';
import { renderPythonWorkspacePage } from '../src/pages/learning/PythonWorkspacePage.ts';
import { renderAttemptHistoryPage } from '../src/pages/learning/AttemptHistoryPage.ts';
import { DraftManager } from '../src/services/draft-manager.ts';

test('Python Workspace Page P15 (design.md §11 P15, T026)', async (t) => {
  const baseOpts = {
    courseTitle: 'Python Foundations',
    courseOverviewUrl: '/courses/c-1',
    lessonTitle: 'Conditions',
    stepTitle: 'Check Even or Odd',
    stepOrdinalText: 'Step 3 of 5',
    enrollmentId: 'enr-1',
    stepId: 'step-6',
    problemStatement: 'Read an integer and print Even or Odd.',
    inputFormat: 'A single integer.',
    outputFormat: 'Even or Odd.',
    constraints: '-10^6 <= N <= 10^6',
    starterCode: '# write code\n',
    currentCode: 'n = int(input())\nprint("Even" if n % 2 == 0 else "Odd")\n',
    hints: ['Check modulo 2 operator.'],
    solutionExplanation: 'Modulo 2 returns 0 for even numbers.',
    examples: [{ input: '4', output: 'Even' }],
  };

  await t.test('Renders paired layout with problem pane and editor pane', () => {
    const html = renderPythonWorkspacePage(baseOpts);
    assert.ok(html.includes('problem-pane'));
    assert.ok(html.includes('editor-pane'));
    assert.ok(html.includes('Check Even or Odd'));
    assert.ok(html.includes('Read an integer and print Even or Odd.'));
    assert.ok(html.includes('Python 3.14'));
    assert.ok(html.includes('Saved'));
  });

  await t.test('Includes compact screen guidance banner for mobile users (design §14)', () => {
    const html = renderPythonWorkspacePage(baseOpts);
    assert.ok(html.includes('desktop-guidance-banner'));
    assert.ok(html.includes('Open this exercise on a computer to write and run code.'));
  });

  await t.test('Hides solution explanation when isCompleted is false, reveals when true', () => {
    const incompleteHtml = renderPythonWorkspacePage({ ...baseOpts, isCompleted: false });
    assert.ok(!incompleteHtml.includes('Solution Explanation'));
    assert.ok(!incompleteHtml.includes('Modulo 2 returns 0 for even numbers.'));

    const completedHtml = renderPythonWorkspacePage({ ...baseOpts, isCompleted: true });
    assert.ok(completedHtml.includes('Solution Explanation'));
    assert.ok(completedHtml.includes('Modulo 2 returns 0 for even numbers.'));
  });

  await t.test('Renders Run samples, Run custom, and Submit solution actions', () => {
    const html = renderPythonWorkspacePage(baseOpts);
    assert.ok(html.includes('Run samples'));
    assert.ok(html.includes('Run custom'));
    assert.ok(html.includes('Submit solution'));
  });

  await t.test('Attempts action links to the registered history route', () => {
    const html = renderPythonWorkspacePage(baseOpts);
    assert.ok(html.includes('href="/learn/enr-1/steps/step-6/attempts"'));
  });

  await t.test('Renders public test failure with diff and received output', () => {
    const htmlWithFailure = renderPythonWorkspacePage({
      ...baseOpts,
      currentResult: {
        jobId: 'job-f1',
        verdict: 'WRONG_ANSWER',
        isInfrastructureFailure: false,
        executionTimeMs: 120,
        testResults: [
          {
            position: 0,
            passed: false,
            verdict: 'WRONG_ANSWER',
            input: '4',
            expectedOutput: 'Even',
            actualOutput: 'Odd',
          },
        ],
      },
    });

    assert.ok(htmlWithFailure.includes('Verdict: WRONG_ANSWER'));
    assert.ok(htmlWithFailure.includes('Expected Output'));
    assert.ok(htmlWithFailure.includes('Received Output'));
    assert.ok(htmlWithFailure.includes('Odd'));
  });

  await t.test('Renders safe redacted guidance on hidden test failure (AC-10)', () => {
    const htmlWithHiddenFailure = renderPythonWorkspacePage({
      ...baseOpts,
      currentResult: {
        jobId: 'job-f2',
        verdict: 'WRONG_ANSWER',
        isInfrastructureFailure: false,
        executionTimeMs: 95,
        testResults: [],
        guidance: 'Your solution did not pass a hidden test. Review the input limits and edge cases.',
      },
    });

    assert.ok(htmlWithHiddenFailure.includes('Your solution did not pass a hidden test'));
    assert.ok(htmlWithHiddenFailure.includes('Verdict: WRONG_ANSWER'));
  });



  await t.test('Renders infrastructure failure with retry button', () => {
    const htmlWithInfra = renderPythonWorkspacePage({
      ...baseOpts,
      currentResult: {
        jobId: 'job-infra-1',
        verdict: 'INTERNAL_ERROR',
        isInfrastructureFailure: true,
        executionTimeMs: 0,
        testResults: [],
        guidance: 'Runner timeout',
      },
    });

    assert.ok(htmlWithInfra.includes('Retry Execution'));
    assert.ok(htmlWithInfra.includes('Verdict: INTERNAL_ERROR'));
  });
});

test('Attempt History and Restore P16 (design.md §11 P16, T027)', async (t) => {
  const baseHistoryOpts = {
    courseTitle: 'Python Foundations',
    courseOverviewUrl: '/courses/c-1',
    lessonTitle: 'Conditions',
    stepTitle: 'Check Even or Odd',
    enrollmentId: 'enr-1',
    stepId: 'step-6',
    workspaceUrl: '/learn/enr-1/steps/step-6/code',
    totalAttempts: 2,
    currentPage: 1,
    pageSize: 20,
    attempts: [
      {
        id: 'att-2',
        attemptNumber: 2,
        verdict: 'PASSED',
        executionTimeMs: 90,
        isInfrastructureFailure: false,
        createdAt: '2026-09-24T02:00:00.000Z',
      },
      {
        id: 'att-1',
        attemptNumber: 1,
        verdict: 'WRONG_ANSWER',
        executionTimeMs: 110,
        isInfrastructureFailure: false,
        createdAt: '2026-09-24T01:50:00.000Z',
      },
    ],
  };

  await t.test('Renders list of historical attempts with verdicts', () => {
    const html = renderAttemptHistoryPage(baseHistoryOpts);
    assert.ok(html.includes('Submission History'));
    assert.ok(html.includes('Attempt #2'));
    assert.ok(html.includes('Attempt #1'));
    assert.ok(html.includes('PASSED'));
    assert.ok(html.includes('WRONG_ANSWER'));
  });

  await t.test('Student view renders Restore to editor button and confirmation dialog', () => {
    const html = renderAttemptHistoryPage({
      ...baseHistoryOpts,
      selectedAttempt: {
        id: 'att-2',
        attemptNumber: 2,
        verdict: 'PASSED',
        codeSnapshot: 'print("correct snapshot")',
        executionTimeMs: 90,
        isInfrastructureFailure: false,
        createdAt: '2026-09-24T02:00:00.000Z',
        canRestore: true,
        runtimeVersion: 'Python 3.14',
      },
    });

    assert.ok(html.includes('print(&quot;correct snapshot&quot;)'));
    assert.ok(html.includes('Restore to editor'));
    assert.ok(html.includes('Restore code to editor?'));
  });

  await t.test('Teacher variant hides Restore to editor button', () => {
    const html = renderAttemptHistoryPage({
      ...baseHistoryOpts,
      selectedAttempt: {
        id: 'att-2',
        attemptNumber: 2,
        verdict: 'PASSED',
        codeSnapshot: 'print("student snapshot")',
        executionTimeMs: 90,
        isInfrastructureFailure: false,
        createdAt: '2026-09-24T02:00:00.000Z',
        canRestore: false, // Teacher view
        runtimeVersion: 'Python 3.14',
      },
    });

    assert.ok(html.includes('print(&quot;student snapshot&quot;)'));
    assert.ok(!html.includes('Restore to editor'));
  });
});

test('DraftManager: Local Caching and Sign-Out Clearance (T025, AC-11)', async (t) => {
  // Mock localStorage in Node test environment
  const storageMap = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => storageMap.get(key) || null,
    setItem: (key: string, val: string) => storageMap.set(key, val),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    get length() { return storageMap.size; },
    key: (i: number) => Array.from(storageMap.keys())[i] || null,
  } as any;

  await t.test('Saves and loads account-scoped local drafts', () => {
    const userId = 'user-ada';
    const enrollmentId = 'enr-1';
    const stepId = 'step-6';

    DraftManager.saveLocalDraft(userId, enrollmentId, stepId, 'print("local code")', 1);
    const loaded = DraftManager.loadLocalDraft(userId, enrollmentId, stepId);

    assert.ok(loaded);
    assert.strictEqual(loaded.code, 'print("local code")');
    assert.strictEqual(loaded.revision, 1);
  });

  await t.test('Clears all user drafts on sign-out without touching other accounts', () => {
    DraftManager.saveLocalDraft('user-ada', 'enr-1', 'step-6', 'ada code', 1);
    DraftManager.saveLocalDraft('user-grace', 'enr-2', 'step-6', 'grace code', 1);

    // Sign out Ada Lovelace
    DraftManager.clearAllUserLocalDrafts('user-ada');

    // Ada's draft must be removed
    assert.strictEqual(DraftManager.loadLocalDraft('user-ada', 'enr-1', 'step-6'), null);
    // Grace's draft must be preserved
    assert.ok(DraftManager.loadLocalDraft('user-grace', 'enr-2', 'step-6'));
  });
});

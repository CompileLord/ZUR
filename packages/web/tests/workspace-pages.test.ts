import test from 'node:test';
import assert from 'node:assert';
import { renderPythonWorkspacePage } from '../src/pages/learning/PythonWorkspacePage.ts';
import { renderAttemptHistoryPage, getAttemptDocumentTitle } from '../src/pages/learning/AttemptHistoryPage.ts';
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
    assert.ok(!html.includes('runtime-badge'));
    assert.ok(html.includes('Saved'));
  });

  await t.test('Keeps compact screens free of desktop-only restrictions', () => {
    const html = renderPythonWorkspacePage(baseOpts);
    assert.ok(!html.includes('desktop-guidance-banner'));
    assert.ok(!html.includes('Open this exercise on a computer to write and run code.'));
  });

  await t.test('Hides solution explanation when isCompleted is false, reveals when true', () => {
    const incompleteHtml = renderPythonWorkspacePage({ ...baseOpts, isCompleted: false });
    assert.ok(!incompleteHtml.includes('Solution Explanation'));
    assert.ok(!incompleteHtml.includes('Modulo 2 returns 0 for even numbers.'));

    const completedHtml = renderPythonWorkspacePage({ ...baseOpts, isCompleted: true });
    assert.ok(completedHtml.includes('Solution Explanation'));
    assert.ok(completedHtml.includes('Modulo 2 returns 0 for even numbers.'));
  });

  await t.test('Renders Run samples, Run code, and Submit solution actions', () => {
    const html = renderPythonWorkspacePage(baseOpts);
    assert.ok(html.includes('Test samples'));
    assert.ok(html.includes('Run code'));
    assert.ok(html.includes('Submit solution'));
  });

  await t.test('Attempts action links to the registered history route', () => {
    const html = renderPythonWorkspacePage(baseOpts);
    assert.ok(html.includes('href="/learn/enr-1/steps/step-6/attempts"'));
  });

  await t.test('Compact Python view keeps the editor writable', () => {
    const html = renderPythonWorkspacePage({ ...baseOpts, isCompact: true });
    assert.doesNotMatch(html, /readonly/);
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

  await t.test('Compact student attempt detail offers Restore action', () => {
    const html = renderAttemptHistoryPage({
      ...baseHistoryOpts,
      isCompact: true,
      selectedAttempt: {
        id: 'att-2', attemptNumber: 2, verdict: 'PASSED', codeSnapshot: 'print(2)',
        isInfrastructureFailure: false, createdAt: '2026-09-24T02:00:00.000Z',
        canRestore: true, runtimeVersion: 'Python 3.14',
      },
    });
    assert.ok(html.includes('Restore to editor'));
  });

  await t.test('Sets route-specific document titles with exercise and course context', () => {
    assert.strictEqual(
      getAttemptDocumentTitle('Check Even or Odd', 'Python Foundations'),
      'Submission History · Check Even or Odd · Python Foundations · ZUR'
    );
    assert.strictEqual(
      getAttemptDocumentTitle('Check Even or Odd', 'Python Foundations', { attemptNumber: 2 }),
      'Attempt #2 · Check Even or Odd · Python Foundations · ZUR'
    );
    assert.strictEqual(
      getAttemptDocumentTitle('Check Even or Odd', 'Python Foundations', {}),
      'Attempt Detail · Check Even or Odd · Python Foundations · ZUR'
    );
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

  await t.test('Tracks unsynchronized work for the correct account', () => {
    DraftManager.markUnsynced('user-ada', 'enr-1', 'step-6', true);
    assert.equal(DraftManager.hasUnsyncedWork('user-ada'), true);
    assert.equal(DraftManager.hasUnsyncedWork('user-grace'), false);
    DraftManager.markUnsynced('user-ada', 'enr-1', 'step-6', false);
    assert.equal(DraftManager.hasUnsyncedWork('user-ada'), false);
  });

  await t.test('Synchronizes a local draft before clearing its sign-out warning', async () => {
    const priorFetch = globalThis.fetch;
    const writes: string[] = [];
    globalThis.fetch = (async (_url: string, options?: RequestInit) => {
      if (!options) return { ok: true, json: async () => ({ code: 'old', revision: 2 }) } as any;
      writes.push(String(options.body));
      return { ok: true, json: async () => ({ code: 'new', revision: 3 }) } as any;
    }) as any;
    try {
      DraftManager.saveLocalDraft('user-ada', 'enr-1', 'step-6', 'new', 2);
      DraftManager.markUnsynced('user-ada', 'enr-1', 'step-6', true);
      await DraftManager.syncUnsyncedWork('user-ada');
      assert.equal(writes.length, 1);
      assert.equal(DraftManager.hasUnsyncedWork('user-ada'), false);
    } finally { globalThis.fetch = priorFetch; }
  });
});

test('Workspace HTML Safety & XSS Prevention (T026, Finding 8)', async (t) => {
  await t.test('PythonWorkspacePage escapes all dynamic content and data attributes', () => {
    const xssPayload = '<script>alert("xss")</script>';
    const imgPayload = '<img src=x onerror=alert(1)>';
    const attrPayload = '"><script>alert("attr")</script>';

    const html = renderPythonWorkspacePage({
      courseTitle: 'Security Course',
      courseOverviewUrl: '/courses/sec-1',
      lessonTitle: 'Sanitization',
      stepTitle: xssPayload,
      stepOrdinalText: 'Step 1',
      enrollmentId: attrPayload,
      stepId: attrPayload,
      problemStatement: imgPayload,
      inputFormat: xssPayload,
      outputFormat: xssPayload,
      constraints: xssPayload,
      starterCode: '# safe',
      currentCode: '# safe',
      hints: [xssPayload],
      solutionExplanation: xssPayload,
      isCompleted: true,
      examples: [{ input: xssPayload, output: xssPayload }],
    });

    // Zero unescaped raw scripts or img tags
    assert.strictEqual(html.includes('<script>alert("xss")</script>'), false);
    assert.strictEqual(html.includes('<img src=x onerror=alert(1)>'), false);
    assert.strictEqual(html.includes('"><script>alert("attr")</script>'), false);

    // Escaped entities are present
    assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('&quot;&gt;&lt;script&gt;alert(&quot;attr&quot;)&lt;/script&gt;'));
    // outlineContent specifically checked for escaping
    assert.ok(html.includes('<nav class="outline-nav"><ul><li>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</li></ul></nav>'));
  });

  await t.test('AttemptHistoryPage escapes dynamic fields and encodes URLs', () => {
    const xssPayload = '<script>alert("history")</script>';
    const attrPayload = '"><script>alert("url")</script>';

    const html = renderAttemptHistoryPage({
      courseTitle: 'Security Course',
      courseOverviewUrl: '/courses/sec-1',
      lessonTitle: 'Sanitization',
      stepTitle: xssPayload,
      enrollmentId: 'enr/special?x=1',
      stepId: 'step/special?y=2',
      workspaceUrl: attrPayload,
      totalAttempts: 1,
      currentPage: 1,
      pageSize: 20,
      attempts: [
        {
          id: 'att-xss',
          attemptNumber: 1,
          verdict: 'PASSED',
          executionTimeMs: 10,
          isInfrastructureFailure: false,
          createdAt: new Date().toISOString(),
        },
      ],
      selectedAttempt: {
        id: 'att-xss',
        attemptNumber: 1,
        verdict: 'PASSED',
        codeSnapshot: xssPayload,
        executionTimeMs: 10,
        isInfrastructureFailure: false,
        createdAt: new Date().toISOString(),
        canRestore: true,
        runtimeVersion: 'Python 3.14',
      },
    });

    assert.strictEqual(html.includes('<script>alert("history")</script>'), false);
    assert.strictEqual(html.includes('"><script>alert("url")</script>'), false);
    assert.ok(html.includes('&quot;&gt;&lt;script&gt;alert(&quot;url&quot;)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;script&gt;alert(&quot;history&quot;)&lt;/script&gt;'));
    // URL components are encoded
    assert.ok(html.includes('enr%2Fspecial%3Fx%3D1'));
    assert.ok(html.includes('step%2Fspecial%3Fy%3D2'));
  });
});

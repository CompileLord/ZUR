import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLearningWorkspaceShell, type CourseModuleItem, type TaskSquareItem } from '../src/components/shells/LearningWorkspaceShell.ts';
import { renderPythonWorkspacePage } from '../src/pages/learning/PythonWorkspacePage.ts';

test('Learner Redesign: Shell and Navigation', async (t) => {
  const mockModules: CourseModuleItem[] = [
    {
      id: 'mod-1',
      title: 'Module 1: Foundations',
      lessons: [
        {
          id: 'les-1',
          title: 'Lesson 1: Intro',
          completedCount: 2,
          totalCount: 2,
          isCurrent: true,
          href: '/learn/1/steps/s2',
        },
      ],
    },
  ];

  const mockTaskSquares: TaskSquareItem[] = [
    { id: 's1', ordinal: 1, type: 'theory', title: 'Welcome', isCompleted: true, isCurrent: false, href: '/learn/1/steps/s1' },
    { id: 's2', ordinal: 2, type: 'python', title: 'Code Intro', isCompleted: true, isCurrent: true, href: '/learn/1/steps/s2' },
    { id: 's3', ordinal: 3, type: 'quiz', title: 'Quiz 1', isCompleted: false, isCurrent: false, href: '/learn/1/steps/s3' },
  ];

  await t.test('LearningWorkspaceShell renders persistent course sidebar and task strip', () => {
    const html = renderLearningWorkspaceShell({
      courseTitle: 'Python Foundations',
      courseOverviewUrl: '/learn/1',
      lessonTitle: 'Lesson 1: Intro',
      stepTitle: 'Code Intro',
      stepOrdinalText: 'Step 2 of 3',
      modules: mockModules,
      taskSquares: mockTaskSquares,
      courseProgressText: '2 of 3 completed',
      courseProgressPercentage: 67,
      workspaceContent: '<div class="test-workspace">Workspace</div>',
    });

    // Persistent course sidebar
    assert.ok(html.includes('learning-course-sidebar'), 'Sidebar container present');
    assert.ok(html.includes('Module 1: Foundations'), 'Module title rendered in sidebar');
    assert.ok(html.includes('Lesson 1: Intro'), 'Lesson title rendered in sidebar');
    assert.ok(html.includes('sidebar-progress-box'), 'Sidebar progress box present');
    assert.ok(html.includes('2 of 3 completed'), 'Progress text rendered in sidebar');

    // Horizontal task strip
    assert.ok(html.includes('learning-task-strip'), 'Task strip container present');
    assert.ok(html.includes('task-square completed'), 'Completed task square present');
    assert.ok(html.includes('task-square completed selected current'), 'Combined completed and selected task square present');
    assert.ok(html.includes('aria-current="step"'), 'Selected task square has aria-current="step"');

    // Modal report dialog
    assert.ok(html.includes('id="exercise-report-dialog"'), 'Report dialog markup present');
    assert.ok(html.includes('id="exercise-report-form"'), 'Report form markup present');

    // Sidebar toggle button
    assert.ok(html.includes('sidebar-toggle-btn'), 'Sidebar toggle button present');
  });

  await t.test('LearningWorkspaceShell handles combined completed and selected states cleanly', () => {
    const squares: TaskSquareItem[] = [
      { id: 's1', ordinal: 1, type: 'python', title: 'Echo', isCompleted: true, isCurrent: true, href: '/learn/1/steps/s1' },
      { id: 's2', ordinal: 2, type: 'python', title: 'Add', isCompleted: false, isCurrent: false, href: '/learn/1/steps/s2' },
    ];
    const html = renderLearningWorkspaceShell({
      courseTitle: 'Python',
      courseOverviewUrl: '/learn/1',
      lessonTitle: 'Basics',
      stepTitle: 'Echo',
      stepOrdinalText: 'Step 1 of 2',
      taskSquares: squares,
      workspaceContent: '<div>Content</div>',
    });

    assert.ok(html.includes('task-square completed selected current'), 'Task square has completed, selected, and current classes');
    assert.ok(html.includes('aria-label="Step 1 in this lesson: Echo (python, Completed, Current)"'), 'Task square aria-label describes both states');
  });

  await t.test('LearningWorkspaceShell report modal defaults code checkbox to unchecked (opt-in)', () => {
    const html = renderLearningWorkspaceShell({
      courseTitle: 'Python Foundations',
      courseOverviewUrl: '/learn/1',
      lessonTitle: 'Lesson 1',
      stepTitle: 'Step 1',
      stepOrdinalText: 'Step 1 of 1',
      workspaceContent: '<div>Content</div>',
    });
    assert.ok(html.includes('id="report-include-code"'), 'Report include code checkbox present');
    assert.ok(!html.includes('id="report-include-code" name="includeCode" value="true" checked'), 'Checkbox is NOT checked by default');
  });
});

test('Learner Redesign: Python Workspace Editor & Toolbar', async (t) => {
  await t.test('PythonWorkspacePage renders toolbar mode selector, run button, and submit button', () => {
    const html = renderPythonWorkspacePage({
      courseTitle: 'Python Foundations',
      courseOverviewUrl: '/learn/1',
      lessonTitle: 'Lesson 1',
      stepTitle: 'Echo Numbers',
      stepOrdinalText: 'Step 2 of 3',
      enrollmentId: 'enr-1',
      stepId: 'step-2',
      problemStatement: 'Echo the number.',
      inputFormat: 'One integer.',
      outputFormat: 'The same integer.',
      constraints: 'None.',
      currentCode: 'print(42)',
      starterCode: '# starter',
      isCompleted: false,
    });

    // Filename and runtime
    assert.ok(!html.includes('editor-filename'), 'Filename removed');
    assert.ok(!html.includes('main.py'), 'Filename text removed');

    // Mode dropdown and run button
    assert.ok(!html.includes('id="run-mode-select"'), 'Run acts directly without a mode dropdown');
    assert.ok(html.includes('Test samples'), 'Sample tests are a distinct secondary action');
    assert.ok(html.includes('Run code'), 'Run code option present');
    assert.ok(html.includes('id="run-code-btn"'), 'Run code button present');
    assert.ok(html.includes('aria-keyshortcuts="Control+Enter"') || html.includes('title="Run code'), 'Keyboard shortcut attribute present');

    // Submit button
    assert.ok(html.includes('id="submit-solution-btn"'), 'Submit solution button present');

    // Reset code inside overflow menu
    assert.ok(!html.includes('editor-overflow-menu'), 'Mock-looking overflow menu removed');

    // Report issue link
    assert.ok(html.includes('report-issue-link'), 'Report issue action present');
  });

  await t.test('renderPythonExecutionResults strictly redacts hidden test case values and renders infra error recovery', async () => {
    const { renderPythonExecutionResults } = await import('../src/pages/learning/PythonWorkspacePage.ts');
    const resultHtml = renderPythonExecutionResults({
      resultMode: 'submit',
      currentResult: {
        jobId: 'job-1',
        verdict: 'PASSED',
        isInfrastructureFailure: false,
        executionTimeMs: 50,
        testResults: [
          {
            position: 0,
            passed: true,
            verdict: 'PASSED',
            input: 'public_input_val',
            expectedOutput: 'public_expected_val',
            actualOutput: 'public_actual_val',
          },
          {
            position: 1,
            passed: true,
            verdict: 'PASSED',
            // Hidden test case with strictly omitted values
            input: undefined,
            expectedOutput: undefined,
            actualOutput: undefined,
          },
        ],
      },
    });

    assert.ok(resultHtml.includes('public_input_val'), 'Public test input rendered');
    assert.ok(resultHtml.includes('Test #1'), 'Test 1 header rendered');
    assert.ok(resultHtml.includes('Test #2'), 'Test 2 header rendered');
    assert.ok(!resultHtml.includes('undefined'), 'No literal undefined values in rendered html');

    // Test infra error renders banner and retry button
    const infraHtml = renderPythonExecutionResults({
      resultMode: 'samples',
      currentResult: {
        jobId: 'job-infra-1',
        verdict: 'INTERNAL_ERROR',
        isInfrastructureFailure: true,
        executionTimeMs: 20,
        testResults: [],
      },
    });
    assert.ok(infraHtml.includes('result-card-banner infrastructure'), 'Infrastructure error banner rendered');
    assert.ok(infraHtml.includes('id="retry-execution-btn"'), 'Retry execution button rendered');
    assert.ok(infraHtml.includes('Your code is unchanged'), 'Preservation notice rendered');
  });
});

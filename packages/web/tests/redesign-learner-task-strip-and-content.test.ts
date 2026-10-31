import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTaskStripHtml, renderTaskSquareInnerHtml, type TaskSquareItem } from '../src/components/shells/LearningWorkspaceShell.ts';

test('Learner Redesign: Long Task Strip & Waived States', async (t) => {
  await t.test('renderTaskStripHtml supports 10+ steps with completed, waived, and current states', () => {
    const longSquares: TaskSquareItem[] = [
      { id: 's1', ordinal: 1, type: 'theory', title: 'Intro', isCompleted: true, isCurrent: false, href: '/learn/1/steps/s1' },
      { id: 's2', ordinal: 2, type: 'video', title: 'Memory', isCompleted: true, isCurrent: false, href: '/learn/1/steps/s2' },
      { id: 's3', ordinal: 3, type: 'quiz', title: 'Syntax', isCompleted: true, isCurrent: false, href: '/learn/1/steps/s3' },
      { id: 's4', ordinal: 4, type: 'python', title: 'Echo', isCompleted: false, isCurrent: true, href: '/learn/1/steps/s4' },
      { id: 's5', ordinal: 5, type: 'theory', title: 'Names', isCompleted: false, isWaived: true, isCurrent: false, href: '/learn/1/steps/s5' },
      { id: 's6', ordinal: 6, type: 'python', title: 'Sum', isCompleted: false, isCurrent: false, href: '/learn/1/steps/s6' },
      { id: 's7', ordinal: 7, type: 'quiz', title: 'Scope', isCompleted: false, isCurrent: false, href: '/learn/1/steps/s7' },
      { id: 's8', ordinal: 8, type: 'theory', title: 'GC', isCompleted: false, isCurrent: false, href: '/learn/1/steps/s8' },
      { id: 's9', ordinal: 9, type: 'video', title: 'Internals', isCompleted: false, isCurrent: false, href: '/learn/1/steps/s9' },
      { id: 's10', ordinal: 10, type: 'python', title: 'Strings', isCompleted: false, isCurrent: false, href: '/learn/1/steps/s10' },
      { id: 's11', ordinal: 11, type: 'quiz', title: 'Format', isCompleted: false, isCurrent: false, href: '/learn/1/steps/s11' },
      { id: 's12', ordinal: 12, type: 'python', title: 'Lab', isCompleted: false, isCurrent: false, href: '/learn/1/steps/s12' },
    ];

    const stripHtml = renderTaskStripHtml({
      lessonTitle: 'Naming and Values',
      taskSquares: longSquares,
      previousStepUrl: '/learn/1/steps/s3',
      nextStepUrl: '/learn/1/steps/s5',
    });

    assert.ok(!stripHtml.includes('12 tasks'), 'Redundant task count removed');
    assert.ok(stripHtml.includes('task-square completed'), 'Renders completed task square');
    assert.ok(stripHtml.includes('check-icon'), 'Renders checkmark icon for completed tasks');
    assert.ok(stripHtml.includes('task-square selected current'), 'Renders selected current square for step 4');
    assert.ok(stripHtml.includes('aria-current="step"'), 'Step 4 has aria-current="step"');
    assert.ok(stripHtml.includes('task-square waived'), 'Step 5 has waived class');
    assert.ok(stripHtml.includes('waived-letter'), 'Step 5 renders W waived letter');
    assert.ok(stripHtml.includes('Step 5 in this lesson: Names (theory, Waived)'), 'Step 5 has accurate waived aria-label');
    assert.ok(stripHtml.includes('ordinal-number" aria-hidden="true">12</span>'), 'Step 12 renders ordinal 12');
    assert.ok(stripHtml.includes('prev-task'), 'Previous task arrow present');
    assert.ok(stripHtml.includes('next-task'), 'Next task arrow present');
    assert.ok(stripHtml.includes('aria-label="Previous step"') && stripHtml.includes('aria-label="Next step"'), 'Arrows say step, like the step position');
    assert.ok(stripHtml.includes('aria-label="Steps in this lesson"'), 'Strip is named for the lesson steps');
    assert.ok(!/\bTask \d/.test(stripHtml), 'No square is called a task');
  });
});

test('Learner Redesign: Modular Workspace Content & Editor Lifecycle', async (t) => {
  const { renderPythonWorkspaceContent } = await import('../src/pages/learning/PythonWorkspacePage.ts');
  const { renderTheoryWorkspaceContent } = await import('../src/pages/learning/TheoryStepPage.ts');
  const { renderVideoWorkspaceContent } = await import('../src/pages/learning/VideoStepPage.ts');
  const { renderQuizWorkspaceContent } = await import('../src/pages/learning/QuizStepPage.ts');

  await t.test('renderPythonWorkspaceContent exports modular content and actions', () => {
    const result = renderPythonWorkspaceContent({
      courseTitle: 'Python',
      courseOverviewUrl: '/learn/1',
      lessonTitle: 'Basics',
      stepTitle: 'Echo',
      stepOrdinalText: 'Step 1 of 1',
      enrollmentId: 'e1',
      stepId: 's1',
      problemStatement: 'Print twice',
      inputFormat: 'int',
      outputFormat: 'int',
      constraints: '1..100',
      starterCode: '# start',
      currentCode: 'print(42)',
    });
    assert.ok(result.workspaceContent.includes('problem-pane'), 'Has problem pane');
    assert.ok(result.workspaceContent.includes('editor-pane'), 'Has editor pane');
    assert.ok(result.workspaceContent.includes('workspace-splitter'), 'Has splitter');
    assert.ok(result.taskActions.includes('id="run-code-btn"'), 'Execution actions are provided for the top strip');
    assert.equal(result.saveLabel, 'Saved');
  });

  await t.test('renderTheoryWorkspaceContent exports modular content', () => {
    const result = renderTheoryWorkspaceContent({
      courseTitle: 'Python',
      courseOverviewUrl: '/learn/1',
      lessonTitle: 'Basics',
      stepTitle: 'Intro',
      stepOrdinalText: 'Step 1 of 1',
      isRequired: true,
      estimatedDurationMinutes: 5,
      markdownContent: '# Welcome\n\nHello world',
      enrollmentId: 'e1',
      stepId: 's1',
      isCompleted: false,
    });
    assert.ok(result.workspaceContent.includes('theory-step-content'), 'Has theory content');
    assert.ok(result.taskActions.includes('Mark complete and continue'), 'Has complete button');
  });

  await t.test('renderVideoWorkspaceContent exports modular content', () => {
    const result = renderVideoWorkspaceContent({
      courseTitle: 'Python',
      courseOverviewUrl: '/learn/1',
      lessonTitle: 'Basics',
      stepTitle: 'Video 1',
      stepOrdinalText: 'Step 1 of 1',
      isRequired: true,
      estimatedDurationMinutes: 10,
      videoUrl: 'https://www.youtube-nocookie.com/embed/xyz',
      enrollmentId: 'e1',
      stepId: 's1',
      isCompleted: true,
    });
    assert.ok(result.workspaceContent.includes('video-step-content'), 'Has video content');
    assert.ok(result.taskActions.includes('Continue'), 'Has continue link when completed');
  });

  await t.test('renderQuizWorkspaceContent exports modular content with single primary button', () => {
    const result = renderQuizWorkspaceContent({
      courseTitle: 'Python',
      courseOverviewUrl: '/learn/1',
      lessonTitle: 'Basics',
      stepTitle: 'Quiz 1',
      stepOrdinalText: 'Step 1 of 1',
      isRequired: true,
      estimatedDurationMinutes: 3,
      quizType: 'single_choice',
      prompt: 'What is x?',
      options: [{ id: 'o1', text: '10' }],
      enrollmentId: 'e1',
      stepId: 's1',
      isCompleted: false,
    });
    assert.ok(result.workspaceContent.includes('quiz-step-content'), 'Has quiz content');
    assert.ok(result.workspaceContent.includes('check-answer-btn'), 'Has inline check answer button');
    assert.ok(!result.taskActions.includes('Check answer'), 'Footer task actions does NOT contain duplicate check answer button');
  });
});

 test('Task types remain distinguishable after completion', () => {
  const types = ['theory', 'video', 'quiz', 'python'] as const;
  const glyphs = types.map(type => {
    const pending = renderTaskSquareInnerHtml({ ordinal: 7, type });
    const completed = renderTaskSquareInnerHtml({ ordinal: 7, type, isCompleted: true });
    const icon = pending.match(/<span class="task-type-icon"[^>]*>(.*?)<\/span>/s)?.[1];
    assert.ok(icon, `${type} has a type icon`);
    assert.ok(completed.includes(icon!), `${type} retains its icon after completion`);
    assert.ok(completed.includes('task-state-badge'), 'Completion has a separate badge');
    assert.ok(completed.includes('>7</span>'), 'Task position remains visible');
    return icon;
  });
  assert.equal(new Set(glyphs).size, 4, 'Each task type has a distinct icon');
});

 test('Plain code run shows output without grading cards or input summaries', async () => {
  const { renderPythonExecutionResults } = await import('../src/pages/learning/PythonWorkspacePage.ts');
  const html = renderPythonExecutionResults({ resultMode: 'custom', currentResult: {
    verdict: 'PASSED', testResults: [{ position: 0, passed: true, input: '1', actualOutput: '<hello>\n', stderr: '', executionTimeMs: 1, isHidden: false }], executionTimeMs: 1,
  } as any });
  assert.ok(html.includes('&lt;hello&gt;\n'), 'Raw program output is escaped and preserves newline');
  assert.ok(!html.includes('test-card') && !html.includes('Test #') && !html.includes('Input') && !html.includes('Code ran successfully'), 'Plain run does not show assessment UI');
});

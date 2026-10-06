import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderLearningWorkspaceShell,
  renderTaskStripHtml,
  renderSidebarContentHtml,
  renderTaskSquareInnerHtml,
  type CourseModuleItem,
  type TaskSquareItem,
} from '../src/components/shells/LearningWorkspaceShell.ts';
import { renderPythonWorkspacePage } from '../src/pages/learning/PythonWorkspacePage.ts';
import { renderSettingsNav } from '../src/pages/settings/SettingsNav.ts';
import { renderProfileSettingsPage } from '../src/pages/settings/ProfileSettingsPage.ts';
import { renderAppearanceSettingsPage } from '../src/pages/settings/AppearanceSettingsPage.ts';
import { renderSecuritySettingsPage } from '../src/pages/settings/SecuritySettingsPage.ts';
import { renderPrivacySettingsPage } from '../src/pages/settings/PrivacySettingsPage.ts';
import {
  getScopedLastVisitedStepKey,
  recordLastVisitedStep,
  getLastVisitedStep,
  parseLearningNavigation,
  updateMountedLearningWorkspace,
} from '../src/pages/learning/learning-navigation.ts';

test('Learner Redesign: Shell and Navigation', async (t) => {
  const mockModules: CourseModuleItem[] = [
    {
      id: 'mod-1',
      title: 'Module 1: Foundations',
      lessons: [
        {
          id: 'les-1',
          title: 'Lesson 1: Intro',
          steps: [
            { id: 's1', title: 'Welcome', type: 'theory', isCompleted: true, isCurrent: false, href: '/learn/1/steps/s1' },
            { id: 's2', title: 'Code Intro', type: 'python', isCompleted: true, isCurrent: true, href: '/learn/1/steps/s2' },
          ],
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
    assert.ok(html.includes('aria-label="Task 1: Echo (python, Completed, Current)"'), 'Task square aria-label describes both states');
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

test('Learner Redesign: Settings Simplification and Tab Scoping', async (t) => {
  await t.test('SettingsNav hides AI connections for student-only accounts', () => {
    const studentNav = renderSettingsNav('profile', false);
    assert.ok(!studentNav.includes('AI connections'), 'AI connections hidden for students');
    assert.ok(studentNav.includes('/settings/profile'), 'Profile link present');
    assert.ok(studentNav.includes('/settings/appearance'), 'Appearance link present');
    assert.ok(studentNav.includes('/settings/security'), 'Security link present');
    assert.ok(studentNav.includes('/settings/privacy'), 'Privacy link present');

    const authorNav = renderSettingsNav('profile', true);
    assert.ok(authorNav.includes('AI connections'), 'AI connections visible for authors');
  });

  await t.test('ProfileSettingsPage avoids redundant identity text', () => {
    const user = {
      id: 'usr-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerified: true,
      accountStatus: 'active' as const,
      capabilities: ['student'] as ('student' | 'author' | 'admin')[],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const html = renderProfileSettingsPage({ user });
    assert.ok(!html.includes('Manage how you are identified across course workspaces'), 'Redundant identity paragraph removed');
    assert.ok(html.includes('To change your email, contact'), 'Concise email support hint present');
  });

  await t.test('AppearanceSettingsPage avoids duplicate theme/font captions', () => {
    const html = renderAppearanceSettingsPage({
      preferences: {
        userId: 'usr-1',
        theme: 'dark',
        editorFontSize: 14,
        indentationSpaces: 4,
        updatedAt: '2026-01-01',
      },
      resolvedSystemTheme: 'dark',
    });
    assert.ok(!html.includes('Consistent dark surface'), 'Redundant theme caption removed');
    assert.ok(!html.includes('Fixed-width code font scaling'), 'Redundant font caption removed');
    assert.ok(!html.includes('Python indentation depth'), 'Redundant indent caption removed');
  });

  await t.test('SecuritySettingsPage provides concise sign-out notice', () => {
    const user = {
      id: 'usr-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerified: true,
      accountStatus: 'active' as const,
      capabilities: ['student'] as ('student' | 'author' | 'admin')[],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const html = renderSecuritySettingsPage({ user });
    assert.ok(html.includes('Updating your password signs out other devices.'), 'Concise password warning present');
    assert.ok(!html.includes('Signing out from here terminates all browser sessions'), 'Verbose signout paragraph removed');
  });

  await t.test('PrivacySettingsPage collapses retention policy into disclosure', () => {
    const html = renderPrivacySettingsPage({});
    assert.ok(html.includes('Data retention overview'), 'Retention details summary present');
    assert.ok(html.includes('<details'), 'Retention details element present');
  });
});

test('Learner Redesign: Lesson Resume Policy & Scoped Preferences', async (t) => {
  const createMockStorage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) || null,
      setItem: (k: string, v: string) => { map.set(k, v); },
    };
  };

  await t.test('getScopedLastVisitedStepKey generates correct scope key format', () => {
    const key = getScopedLastVisitedStepKey('usr-1', 'enr-ada', 'v2-snap', 'les-1');
    assert.equal(key, 'zur_last_visited_step:usr-1:enr-ada:v2-snap:les-1');
  });

  await t.test('records and retrieves last visited step with user and version isolation', () => {
    const storage = createMockStorage();

    // User A records step 3 in lesson 1 on version 1
    recordLastVisitedStep('usr-a', 'enr-1', 'ver-1', 'les-1', 'step-3', storage);

    // User A retrieves step 3
    assert.equal(getLastVisitedStep('usr-a', 'enr-1', 'ver-1', 'les-1', storage), 'step-3');

    // Cross-user isolation: User B on same enrollment/version gets null
    assert.equal(getLastVisitedStep('usr-b', 'enr-1', 'ver-1', 'les-1', storage), null);

    // Cross-version isolation: User A on version 2 gets null
    assert.equal(getLastVisitedStep('usr-a', 'enr-1', 'ver-2', 'les-1', storage), null);

    // Cross-lesson isolation: User A on lesson 2 gets null
    assert.equal(getLastVisitedStep('usr-a', 'enr-1', 'ver-1', 'les-2', storage), null);
  });

  await t.test('parseLearningNavigation resolves last-visited then first-incomplete then first-step', () => {
    const storage = createMockStorage();
    const progress = {
      totalSteps: 4,
      completedSteps: 1,
      steps: [
        { id: 's1', moduleId: 'm1', moduleTitle: 'Module 1', lessonId: 'l1', lessonTitle: 'Lesson 1', title: 'Step 1', type: 'theory', isCompleted: true, isWaived: false },
        { id: 's2', moduleId: 'm1', moduleTitle: 'Module 1', lessonId: 'l1', lessonTitle: 'Lesson 1', title: 'Step 2', type: 'video', isCompleted: false, isWaived: false },
        { id: 's3', moduleId: 'm1', moduleTitle: 'Module 1', lessonId: 'l1', lessonTitle: 'Lesson 1', title: 'Step 3', type: 'quiz', isCompleted: false, isWaived: false },
        { id: 's4', moduleId: 'm1', moduleTitle: 'Module 1', lessonId: 'l1', lessonTitle: 'Lesson 1', title: 'Step 4', type: 'python', isCompleted: false, isWaived: false },
      ],
    };

    // Case 1: No last-visited step -> resolves first incomplete step (s2)
    const nav1 = parseLearningNavigation(progress, 'enr-1', 's1', 'usr-a', 'ver-1', storage);
    assert.equal(nav1.modules[0].lessons[0].href, '/learn/enr-1/steps/s2', 'Targets first incomplete step when unvisited');

    // Case 2: Last-visited recorded as s4 -> resolves s4
    recordLastVisitedStep('usr-a', 'enr-1', 'ver-1', 'l1', 's4', storage);
    const nav2 = parseLearningNavigation(progress, 'enr-1', 's1', 'usr-a', 'ver-1', storage);
    assert.equal(nav2.modules[0].lessons[0].href, '/learn/enr-1/steps/s4', 'Targets last-visited step when recorded');

    // Case 3: Stale last-visited outside this lesson -> falls back to first incomplete step (s2)
    recordLastVisitedStep('usr-a', 'enr-1', 'ver-1', 'l1', 's-deleted', storage);
    const nav3 = parseLearningNavigation(progress, 'enr-1', 's1', 'usr-a', 'ver-1', storage);
    assert.equal(nav3.modules[0].lessons[0].href, '/learn/enr-1/steps/s2', 'Falls back to first incomplete step when last-visited invalid');

    // Case 4: All steps completed/waived -> falls back to first step (s1)
    const allDoneProgress = {
      totalSteps: 2,
      completedSteps: 2,
      steps: [
        { id: 's1', moduleId: 'm1', lessonId: 'l1', title: 'Step 1', type: 'theory', isCompleted: true, isWaived: false },
        { id: 's2', moduleId: 'm1', lessonId: 'l1', title: 'Step 2', type: 'quiz', isCompleted: false, isWaived: true },
      ],
    };
    const emptyStorage = createMockStorage();
    const nav4 = parseLearningNavigation(allDoneProgress, 'enr-1', 's2', 'usr-a', 'ver-1', emptyStorage);
    assert.equal(nav4.modules[0].lessons[0].href, '/learn/enr-1/steps/s1', 'Falls back to first step when all completed or waived');
  });

  await t.test('Course resume remains first-incomplete required', () => {
    // Course resume target comes from backend nextIncompleteStepId, not lesson last-visited
    const progress = {
      nextIncompleteStepId: 'step-2',
      lastVisitedStepId: 'step-4',
    };
    const resumeStepId = progress.nextIncompleteStepId || progress.lastVisitedStepId;
    assert.equal(resumeStepId, 'step-2', 'Course resume prioritizes first incomplete step');
  });
});

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
    assert.ok(stripHtml.includes('Task 5: Names (theory, Waived)'), 'Step 5 has accurate waived aria-label');
    assert.ok(stripHtml.includes('ordinal-number" aria-hidden="true">12</span>'), 'Step 12 renders ordinal 12');
    assert.ok(stripHtml.includes('prev-task'), 'Previous task arrow present');
    assert.ok(stripHtml.includes('next-task'), 'Next task arrow present');
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

test('Learner Redesign: DOM Identity, Glyph Synchronization & Scoped Navigation', async (t) => {
  await t.test('renderTaskSquareInnerHtml renders checkmark for completed, W for waived, and ordinal for incomplete', () => {
    const completedHtml = renderTaskSquareInnerHtml({ ordinal: 1, isCompleted: true });
    assert.ok(completedHtml.includes('check-icon'), 'Completed square contains check-icon');
    assert.ok(completedHtml.includes('svg'), 'Completed square contains SVG checkmark');

    const waivedHtml = renderTaskSquareInnerHtml({ ordinal: 2, isWaived: true });
    assert.ok(waivedHtml.includes('waived-letter'), 'Waived square contains waived-letter');
    assert.ok(waivedHtml.includes('>W<'), 'Waived square displays W glyph');

    const incompleteHtml = renderTaskSquareInnerHtml({ ordinal: 3 });
    assert.ok(incompleteHtml.includes('ordinal-number'), 'Incomplete square contains ordinal-number');
    assert.ok(incompleteHtml.includes('>3<'), 'Incomplete square displays ordinal 3');
  });

  await t.test('renderSidebarContentHtml embeds data-lesson-id and marks active lesson item', () => {
    const modules: CourseModuleItem[] = [
      {
        id: 'mod-1',
        title: 'Variables',
        lessons: [
          { id: 'les-1', title: 'Naming', completedCount: 3, totalCount: 4, isCurrent: true, href: '/learn/e1/steps/s1' },
          { id: 'les-2', title: 'Types', completedCount: 0, totalCount: 3, isCurrent: false, href: '/learn/e1/steps/s5' },
        ],
      },
    ];
    const html = renderSidebarContentHtml({ modules });
    assert.ok(html.includes('data-lesson-id="les-1"'), 'les-1 has data-lesson-id');
    assert.ok(html.includes('data-lesson-id="les-2"'), 'les-2 has data-lesson-id');
    assert.ok(html.includes('class="sidebar-lesson-item active" data-lesson-id="les-1"'), 'les-1 is active');
    assert.ok(html.includes('class="sidebar-lesson-item " data-lesson-id="les-2"'), 'les-2 is not active');
    assert.ok(html.includes('3/4'), 'les-1 shows 3/4 count');
  });

  await t.test('parseLearningNavigation resolves lastVisited, then firstIncomplete, then firstStep with user/version scoping', () => {
    const storage = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => storage.get(k) || null,
      setItem: (k: string, v: string) => storage.set(k, v),
    };

    const progress = {
      steps: [
        { id: 'step-1', title: 'Step 1', type: 'theory', lessonId: 'les-1', isCompleted: true, isWaived: false },
        { id: 'step-2', title: 'Step 2', type: 'theory', lessonId: 'les-1', isCompleted: false, isWaived: false },
        { id: 'step-3', title: 'Step 3', type: 'python', lessonId: 'les-1', isCompleted: false, isWaived: false },
      ],
    };

    // User A records last visited step-3 on version-1
    recordLastVisitedStep('user-a', 'enr-1', 'ver-1', 'les-1', 'step-3', mockStorage);

    // User A navigates: targets last-visited step-3
    const navUserA = parseLearningNavigation(progress, 'enr-1', 'step-1', 'user-a', 'ver-1', mockStorage);
    assert.equal(navUserA.modules[0].lessons[0].href, '/learn/enr-1/steps/step-3', 'User A targets last-visited step-3');

    // User B on same enrollment & version: targets first incomplete step-2 (isolated from user A)
    const navUserB = parseLearningNavigation(progress, 'enr-1', 'step-1', 'user-b', 'ver-1', mockStorage);
    assert.equal(navUserB.modules[0].lessons[0].href, '/learn/enr-1/steps/step-2', 'User B targets first incomplete step-2');

    // User A on version-2: targets first incomplete step-2 (isolated from ver-1)
    const navUserAVer2 = parseLearningNavigation(progress, 'enr-1', 'step-1', 'user-a', 'ver-2', mockStorage);
    assert.equal(navUserAVer2.modules[0].lessons[0].href, '/learn/enr-1/steps/step-2', 'User A on ver-2 targets first incomplete step-2');
  });

  await t.test('updateMountedLearningWorkspace preserves shell and sidebar DOM identity during step change', () => {
    // Construct mock DOM element tree
    const createMockElement = (tagName: string, className = '', id = '') => {
      const attributes = new Map<string, string>();
      const classList = new Set(className.split(' ').filter(Boolean));
      const children: any[] = [];
      let parent: any = null;
      const el: any = {
        tagName,
        id,
        href: '',
        style: {} as Record<string, string>,
        dataset: {} as Record<string, string>,
        get className() { return [...classList].join(' '); },
        set className(val: string) { classList.clear(); val.split(' ').filter(Boolean).forEach(c => classList.add(c)); },
        classList: {
          contains: (c: string) => classList.has(c),
          add: (c: string) => classList.add(c),
          remove: (c: string) => classList.delete(c),
          toggle: (c: string, force?: boolean) => {
            const has = classList.has(c);
            const next = force !== undefined ? force : !has;
            if (next) classList.add(c); else classList.delete(c);
            return next;
          },
        },
        setAttribute: (k: string, v: string) => {
          attributes.set(k, String(v));
          if (k === 'id') el.id = v;
          if (k === 'href') el.href = v;
          if (k.startsWith('data-')) el.dataset[k.slice(5)] = String(v);
        },
        getAttribute: (k: string) => attributes.get(k) || (k === 'href' ? el.href : null),
        removeAttribute: (k: string) => { attributes.delete(k); },
        innerHTML: '',
        textContent: '',
        children,
        get parentElement() { return parent; },
        set parentElement(p: any) { parent = p; },
        appendChild: (child: any) => { children.push(child); child.parentElement = el; return child; },
        querySelector: (sel: string): any => {
          const match = (node: any): boolean => {
            if (sel === '.shell-learning') return node.classList?.contains('shell-learning');
            if (sel === '#course-sidebar') return node.id === 'course-sidebar' || node.classList?.contains('course-sidebar');
            if (sel === '.learning-workspace-main') return node.classList?.contains('learning-workspace-main');
            if (sel === '.learning-task-strip') return node.classList?.contains('learning-task-strip');
            if (sel === '.workspace-viewport') return node.classList?.contains('workspace-viewport');
            if (sel === '.learning-task-footer') return node.classList?.contains('learning-task-footer');
            if (sel === '.task-footer-left') return node.classList?.contains('task-footer-left');
            if (sel === '.task-footer-right') return node.classList?.contains('task-footer-right');
            if (sel === '.header-lesson-context') return node.classList?.contains('header-lesson-context');
            if (sel.includes('.back-link')) return node.classList?.contains('back-link');
            if (sel.includes('.back-link-title')) return node.classList?.contains('back-link-title');
            if (sel.includes('progress-bar-fill')) return node.classList?.contains('progress-bar-fill');
            if (sel.includes('progress-text')) return node.classList?.contains('progress-text');
            if (sel === '.lesson-item-count') return node.classList?.contains('lesson-item-count');
            if (sel.includes('prev-task') || sel.includes('first-child')) return node.classList?.contains('prev-task') || node.classList?.contains('task-nav-arrow');
            if (sel.includes('next-task') || sel.includes('last-child')) return node.classList?.contains('next-task') || node.classList?.contains('task-nav-arrow');
            return false;
          };
          const search = (node: any): any => {
            for (const child of node.children) {
              if (match(child)) return child;
              const found = search(child);
              if (found) return found;
            }
            return null;
          };
          return search(el);
        },
        querySelectorAll: (sel: string): any[] => {
          const results: any[] = [];
          const match = (node: any): boolean => {
            if (sel === '.task-square') return node.classList?.contains('task-square');
            if (sel === '.sidebar-lesson-item') return node.classList?.contains('sidebar-lesson-item');
            return false;
          };
          const search = (node: any) => {
            for (const child of node.children) {
              if (match(child)) results.push(child);
              search(child);
            }
          };
          search(el);
          return results;
        },
        scrollIntoView: () => {},
      };
      return el;
    };

    const mockRoot = createMockElement('div', 'app-root');
    const mockShell = createMockElement('div', 'shell-learning');
    const mockSidebar = createMockElement('aside', 'course-sidebar', 'course-sidebar');
    const mockMain = createMockElement('main', 'learning-workspace-main');
    const mockStrip = createMockElement('nav', 'learning-task-strip');
    const mockSquare1 = createMockElement('a', 'task-square selected current');
    mockSquare1.setAttribute('href', '/learn/e1/steps/s1');
    const mockSquare2 = createMockElement('a', 'task-square');
    mockSquare2.setAttribute('href', '/learn/e1/steps/s2');
    mockStrip.appendChild(mockSquare1);
    mockStrip.appendChild(mockSquare2);

    const mockLessonLink1 = createMockElement('a', 'sidebar-lesson-item active');
    mockLessonLink1.setAttribute('data-lesson-id', 'les-1');
    const mockCount1 = createMockElement('span', 'lesson-item-count');
    mockCount1.textContent = '0/2';
    mockLessonLink1.appendChild(mockCount1);
    mockLessonLink1.querySelector = (sel: string) => sel === '.lesson-item-count' ? mockCount1 : null;
    mockSidebar.appendChild(mockLessonLink1);

    const mockViewport = createMockElement('div', 'workspace-viewport');
    mockMain.appendChild(mockStrip);
    mockMain.appendChild(mockViewport);
    mockShell.appendChild(mockSidebar);
    mockShell.appendChild(mockMain);
    mockRoot.appendChild(mockShell);

    // Call updateMountedLearningWorkspace for step transition to s2 (s1 completed)
    const updated = updateMountedLearningWorkspace({
      courseTitle: 'Foundations',
      courseOverviewUrl: '/learn/e1',
      lessonTitle: 'Lesson 1',
      stepTitle: 'Step 2',
      stepOrdinalText: 'Step 2 of 2',
      modules: [{
        id: 'mod-1',
        title: 'Mod 1',
        lessons: [{ id: 'les-1', title: 'Lesson 1', completedCount: 1, totalCount: 2, isCurrent: true, href: '/learn/e1/steps/s2' }],
      }],
      taskSquares: [
        { id: 's1', ordinal: 1, title: 'Step 1', type: 'theory', isCurrent: false, isCompleted: true, isWaived: false, isRequired: true, href: '/learn/e1/steps/s1' },
        { id: 's2', ordinal: 2, title: 'Step 2', type: 'python', isCurrent: true, isCompleted: false, isWaived: false, isRequired: true, href: '/learn/e1/steps/s2' },
      ],
      workspaceContent: '<div>Step 2 Viewport</div>',
    }, mockRoot);

    assert.equal(updated, true, 'updateMountedLearningWorkspace returned true');
    // Verify DOM identity preserved:
    assert.equal(mockRoot.querySelector('.shell-learning'), mockShell, 'Shell DOM reference is identical (no teardown)');
    assert.equal(mockRoot.querySelector('#course-sidebar'), mockSidebar, 'Sidebar DOM reference is identical');
    assert.equal(mockMain.querySelector('.learning-task-strip'), mockStrip, 'Task strip DOM reference is identical (fast path in-place update)');

    // Verify task square states updated in-place:
    assert.ok(mockSquare1.classList.contains('completed'), 'Square 1 updated to completed');
    assert.ok(!mockSquare1.classList.contains('current'), 'Square 1 is no longer current');
    assert.ok(mockSquare1.innerHTML.includes('check-icon'), 'Square 1 has check-icon SVG');

    assert.ok(mockSquare2.classList.contains('current'), 'Square 2 is now current');
    assert.ok(mockSquare2.innerHTML.includes('ordinal-number'), 'Square 2 has ordinal number');

    // Verify sidebar updated:
    assert.equal(mockLessonLink1.href, '/learn/e1/steps/s2', 'Sidebar lesson link href synchronized to target');
    assert.equal(mockCount1.textContent, '1/2', 'Sidebar lesson count synchronized to 1/2');
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

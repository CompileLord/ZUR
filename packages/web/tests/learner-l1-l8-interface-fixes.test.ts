import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMyCoursesPage, type EnrolledCourseItem } from '../src/pages/learning/MyCoursesPage.ts';
import { renderAttemptHistoryPage } from '../src/pages/learning/AttemptHistoryPage.ts';
import {
  getScopedSidebarCollapsedKey,
  setCurriculumSidebarCollapsed,
  getCurriculumSidebarCollapsed,
  getScopedModulesExpandedKey,
  getScopedSidebarScrollKey,
} from '../src/pages/learning/learning-navigation.ts';
import { renderLearningWorkspaceShell } from '../src/components/shells/LearningWorkspaceShell.ts';
import { ProfileGuard } from '../src/services/profile-guard.ts';
import { NavigationHistoryManager } from '../src/utils/navigation-history.ts';
import { renderSafeDenialPage } from '../src/pages/status/SafeDenialPage.ts';
import {
  renderPythonExecutionResults,
  renderPythonWorkspacePage,
} from '../src/pages/learning/PythonWorkspacePage.ts';

const mockUser = {
  id: 'user-learner',
  displayName: 'Student Jane',
  email: 'jane@example.com',
  capabilities: ['student'] as ('student' | 'author' | 'admin')[],
};

test('L1: MyCoursesPage parses and reflects requested filter in tabs, counts, and rows', () => {
  const inProgressCourse: EnrolledCourseItem = {
    id: 'enr-active',
    courseId: 'course-active',
    courseTitle: 'Active Course',
    courseDescription: 'In progress course',
    difficulty: 'beginner',
    pinnedVersionNumber: 1,
    status: 'active',
    percentage: 40,
    completedRequired: 2,
    totalRequired: 5,
    isCompleted: false,
    updatedAt: '2026-01-02T00:00:00Z',
  };
  const completedCourse: EnrolledCourseItem = {
    id: 'enr-done',
    courseId: 'course-done',
    courseTitle: 'Finished Course',
    courseDescription: 'All done course',
    difficulty: 'intermediate',
    pinnedVersionNumber: 1,
    status: 'active',
    percentage: 100,
    completedRequired: 5,
    totalRequired: 5,
    isCompleted: true,
    updatedAt: '2026-01-03T00:00:00Z',
  };
  const courses = [inProgressCourse, completedCourse];

  // In-progress view
  const inProgressHtml = renderMyCoursesPage({ user: mockUser, courses, activeFilter: 'in_progress' });
  assert.ok(inProgressHtml.includes('Active Course'));
  assert.ok(!inProgressHtml.includes('Finished Course'));
  assert.ok(inProgressHtml.includes('href="/learn/courses?filter=in_progress" class="tab-link active" aria-selected="true"'));
  assert.ok(inProgressHtml.includes('href="/learn/courses?filter=completed" class="tab-link " aria-selected="false"'));

  // Completed view
  const completedHtml = renderMyCoursesPage({ user: mockUser, courses, activeFilter: 'completed' });
  assert.ok(!completedHtml.includes('Active Course'));
  assert.ok(completedHtml.includes('Finished Course'));
  assert.ok(completedHtml.includes('href="/learn/courses?filter=completed" class="tab-link active" aria-selected="true"'));
  assert.ok(completedHtml.includes('href="/learn/courses?filter=in_progress" class="tab-link " aria-selected="false"'));

  // All view
  const allHtml = renderMyCoursesPage({ user: mockUser, courses, activeFilter: 'all' });
  assert.ok(allHtml.includes('Active Course'));
  assert.ok(allHtml.includes('Finished Course'));
  assert.ok(allHtml.includes('href="/learn/courses?filter=all" class="tab-link active" aria-selected="true"'));

  // Empty completed view
  const emptyCompletedHtml = renderMyCoursesPage({ user: mockUser, courses: [inProgressCourse], activeFilter: 'completed' });
  assert.ok(emptyCompletedHtml.includes('No completed courses yet'));
  assert.ok(emptyCompletedHtml.includes('href="/learn/courses?filter=in_progress" class="tab-link " aria-selected="false"'));
  assert.ok(emptyCompletedHtml.includes('href="/learn/courses?filter=completed" class="tab-link active" aria-selected="true"'));
});

test('L2: AttemptHistoryPage retains real curriculum navigation and parent exercise context', () => {
  const dummyModules = [
    {
      id: 'mod-1',
      title: 'Module 1',
      lessons: [
        {
          id: 'les-1',
          title: 'Lesson 1',
          completedCount: 0,
          totalCount: 1,
          isCurrent: true,
          href: '/learn/enr-1/steps/step-py-1',
        },
      ],
    },
  ];
  const dummySquares = [
    {
      id: 'step-py-1',
      ordinal: 1,
      title: 'Variables',
      type: 'python' as const,
      isCurrent: true,
      isCompleted: false,
      isWaived: false,
      isRequired: true,
      href: '/learn/enr-1/steps/step-py-1',
    },
  ];

  // List view
  const listHtml = renderAttemptHistoryPage({
    courseTitle: 'Python Mastery',
    courseOverviewUrl: '/learn/enr-1',
    lessonTitle: 'Lesson 1',
    stepTitle: 'Variables',
    enrollmentId: 'enr-1',
    stepId: 'step-py-1',
    workspaceUrl: '/learn/enr-1/steps/step-py-1',
    attempts: [
      {
        id: 'att-1',
        attemptNumber: 1,
        verdict: 'PASSED',
        executionTimeMs: 12,
        isInfrastructureFailure: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    selectedAttempt: null,
    totalAttempts: 1,
    currentPage: 1,
    pageSize: 10,
    offset: 0,
    modules: dummyModules,
    taskSquares: dummySquares,
    courseProgressText: '1 of 5 steps completed (20%)',
    courseProgressPercentage: 20,
    allAttemptsUrl: '/learn/enr-1/steps/step-py-1/attempts?offset=0',
  });

  // No placeholder History sidebar! Real curriculum present!
  assert.ok(!listHtml.includes('<nav class="outline-nav"><ul><li>History</li></ul></nav>'));
  assert.ok(listHtml.includes('Module 1'));
  assert.ok(listHtml.includes('Variables'));
  assert.ok(listHtml.includes('task-strip'));
  assert.ok(listHtml.includes('href="/learn/enr-1/steps/step-py-1"'));
  assert.ok(listHtml.includes('aria-current="step"'));
  assert.ok(listHtml.includes('1 total attempt for this exercise'));
  assert.ok(listHtml.includes('title="Lesson 1"'));

  // Detail view
  const detailHtml = renderAttemptHistoryPage({
    courseTitle: 'Python Mastery',
    courseOverviewUrl: '/learn/enr-1',
    lessonTitle: 'Lesson 1',
    stepTitle: 'Variables',
    enrollmentId: 'enr-1',
    stepId: 'step-py-1',
    workspaceUrl: '/learn/enr-1/steps/step-py-1',
    attempts: [],
    selectedAttempt: {
      id: 'att-1',
      attemptNumber: 1,
      codeSnapshot: 'line1 = 1\nline2 = 2',
      verdict: 'PASSED',
      executionTimeMs: 12,
      isInfrastructureFailure: false,
      createdAt: '2026-01-01T00:00:00Z',
      canRestore: true,
      runtimeVersion: 'python-3.11',
    },
    totalAttempts: 1,
    currentPage: 1,
    pageSize: 10,
    offset: 20,
    modules: dummyModules,
    taskSquares: dummySquares,
    allAttemptsUrl: '/learn/enr-1/steps/step-py-1/attempts?offset=20',
  });

  assert.ok(!detailHtml.includes('<nav class="outline-nav"><ul><li>History</li></ul></nav>'));
  assert.ok(detailHtml.includes('href="/learn/enr-1/steps/step-py-1/attempts?offset=20"'));
  assert.ok(detailHtml.includes('Restore to editor'));
  assert.ok(detailHtml.includes('restore-confirm-dialog'));
});

test('L3: Scoped curriculum sidebar state and collapse derivation', () => {
  // Test storage scoping
  const key1 = getScopedSidebarCollapsedKey('u1', 'e1', 'v1');
  const key2 = getScopedSidebarCollapsedKey('u2', 'e1', 'v1');
  const key3 = getScopedSidebarCollapsedKey('u1', 'e2', 'v1');
  assert.notEqual(key1, key2);
  assert.notEqual(key1, key3);

  // Shell derivation when collapsed
  const collapsedHtml = renderLearningWorkspaceShell({
    courseTitle: 'Course',
    courseOverviewUrl: '/learn/e1',
    lessonTitle: 'Lesson',
    stepTitle: 'Step',
    stepOrdinalText: 'Step 1 of 5',
    isPythonWorkspace: true,
    isSidebarCollapsed: true,
    modules: [],
    taskSquares: [],
    workspaceContent: '<div>Content</div>',
  });
  assert.ok(collapsedHtml.includes('class="learning-course-sidebar collapsed"'));
  assert.ok(collapsedHtml.includes('inert'));
  assert.ok(collapsedHtml.includes('aria-expanded="false"'));
  assert.ok(collapsedHtml.includes('title="Show modules"'));

  // Shell derivation when expanded
  const expandedHtml = renderLearningWorkspaceShell({
    courseTitle: 'Course',
    courseOverviewUrl: '/learn/e1',
    lessonTitle: 'Lesson',
    stepTitle: 'Step',
    stepOrdinalText: 'Step 1 of 5',
    isPythonWorkspace: true,
    isSidebarCollapsed: false,
    modules: [],
    taskSquares: [],
    workspaceContent: '<div>Content</div>',
  });
  assert.ok(expandedHtml.includes('class="learning-course-sidebar open"'));
  assert.ok(!expandedHtml.includes('class="learning-course-sidebar open" role="navigation" aria-label="Course Syllabus" inert'));
  assert.ok(expandedHtml.includes('aria-expanded="true"'));
  assert.ok(expandedHtml.includes('title="Hide modules"'));
});

test('L4: Attempt detail shares readable inset and horizontal code scrolling', () => {
  const codeWithLongLineAndNewlines = 'first_line = "alpha"\nvery_long_code_line_that_exceeds_normal_container_width_and_should_not_cause_page_wide_overflow = 1234567890\nthird_line = "gamma"';

  const html = renderAttemptHistoryPage({
    courseTitle: 'Course',
    courseOverviewUrl: '/learn/e1',
    lessonTitle: 'Lesson',
    stepTitle: 'Step',
    enrollmentId: 'e1',
    stepId: 's1',
    workspaceUrl: '/learn/e1/steps/s1',
    attempts: [],
    selectedAttempt: {
      id: 'att-1',
      attemptNumber: 1,
      codeSnapshot: codeWithLongLineAndNewlines,
      verdict: 'PASSED',
      executionTimeMs: 12,
      isInfrastructureFailure: false,
      createdAt: '2026-01-01T00:00:00Z',
      canRestore: false,
      runtimeVersion: 'python-3.11',
    },
    totalAttempts: 1,
    currentPage: 1,
    pageSize: 10,
    offset: 0,
  });

  // Verify responsive content wrapper and container
  assert.ok(html.includes('class="attempt-history-container"'));
  // Verify horizontal code scroll surface
  assert.ok(html.includes('style="overflow-x: auto; white-space: pre; margin: 0;"'));
  // Verify literal newlines preserved
  assert.ok(html.includes('first_line = &quot;alpha&quot;\nvery_long_code_line'));
  assert.ok(html.includes('1234567890\nthird_line = &quot;gamma&quot;'));
});

test('L5: Report modal uses native dialog with explicit opt-in and accessible containment', () => {
  const html = renderLearningWorkspaceShell({
    courseTitle: 'Course',
    courseOverviewUrl: '/learn/e1',
    lessonTitle: 'Lesson',
    stepTitle: 'Step',
    stepOrdinalText: 'Step 1 of 5',
    isPythonWorkspace: true,
    modules: [],
    taskSquares: [],
    workspaceContent: '<div>Content</div>',
    reportContext: {
      courseId: 'c1',
      courseVersionId: 'v1',
      enrollmentId: 'e1',
      stepId: 's1',
      courseTitle: 'Course',
      lessonTitle: 'Lesson',
      stepTitle: 'Step',
    },
  });

  // Verify native dialog element
  assert.ok(html.includes('<dialog id="exercise-report-dialog" class="dialog-overlay modal-dialog" hidden role="dialog" aria-modal="true" aria-labelledby="exercise-report-title">'));
  // Verify unchecked code attachment by default
  assert.ok(html.includes('<input type="checkbox" id="report-include-code" name="includeCode"'));
  assert.ok(!html.includes('id="report-include-code" name="includeCode" checked'));
  // Verify context fields
  assert.ok(html.includes('id="report-course-id" value="c1"'));
  assert.ok(html.includes('id="report-version-id" value="v1"'));
  assert.ok(html.includes('id="report-enrollment-id" value="e1"'));
  assert.ok(html.includes('id="report-step-id" value="s1"'));
});

test('L6: ProfileGuard detects dirty state, blocks navigation, and preserves draft on save failure', () => {
  const guard = new ProfileGuard('Original Name');
  assert.equal(guard.isDirty('Original Name'), false);
  assert.equal(guard.shouldBlockNavigation('Original Name'), false);
  assert.equal(guard.getNavigationPrompt('Original Name'), null);

  assert.equal(guard.isDirty('Edited Name'), true);
  assert.equal(guard.shouldBlockNavigation('Edited Name'), true);
  assert.notEqual(guard.getNavigationPrompt('Edited Name'), null);

  // Start save
  assert.equal(guard.startSave('Edited Name'), true);
  assert.equal(guard.isSaving, true);

  // Save failure retains dirty state so user draft is not lost
  guard.markSaveFailure();
  assert.equal(guard.isSaving, false);
  assert.equal(guard.isDirty('Edited Name'), true);
  assert.equal(guard.shouldBlockNavigation('Edited Name'), true);

  // Successful save updates initial name and clears dirty state
  assert.equal(guard.startSave('Edited Name'), true);
  guard.markSaveSuccess('Edited Name');
  assert.equal(guard.isSaving, false);
  assert.equal(guard.isDirty('Edited Name'), false);
});

test('L7: SafeDenialPage retains authenticated AppShell for logged-in users and PublicShell for anonymous', () => {
  // Authenticated denial
  const authHtml = renderSafeDenialPage({ type: 'not-found', user: mockUser });
  assert.ok(authHtml.includes('shell-app'));
  assert.ok(authHtml.includes('Student Jane'));
  assert.ok(authHtml.includes('Browse courses'));
  assert.ok(authHtml.includes('Go back'));
  assert.ok(!authHtml.includes('shell-public'));

  // Anonymous denial
  const anonHtml = renderSafeDenialPage({ type: 'not-found', user: null });
  assert.ok(anonHtml.includes('shell-public'));
  assert.ok(anonHtml.includes('Browse courses'));
  assert.ok(anonHtml.includes('Go back'));
  assert.ok(!anonHtml.includes('shell-app'));
});

test('L8: Python execution mode labels and workspace toolbar distinguish Test samples, Run, and Submit', () => {
  const dummyResult = {
    jobId: 'job-1',
    isInfrastructureFailure: false,
    verdict: 'PASSED' as const,
    executionTimeMs: 15,
    testResults: [{ position: 0, passed: true, input: '42', expectedOutput: '42', actualOutput: '42', verdict: 'PASSED' as const }],
  };

  // Samples mode result
  const samplesHtml = renderPythonExecutionResults({
    resultMode: 'samples',
    currentResult: dummyResult,
  });
  assert.ok(samplesHtml.includes('Test samples'));
  assert.ok(!samplesHtml.includes('Run (Samples)'));

  // Custom run mode result: plain output without pass/fail banner
  const customHtml = renderPythonExecutionResults({
    resultMode: 'custom',
    currentResult: dummyResult,
  });
  assert.ok(customHtml.includes('program-output'));
  assert.ok(!customHtml.includes('result-card-banner'));

  // Submit mode result
  const submitHtml = renderPythonExecutionResults({
    resultMode: 'submit',
    currentResult: dummyResult,
  });
  assert.ok(submitHtml.includes('Submit (Graded)'));

  // Workspace toolbar actions: Test samples, Run, and Submit buttons
  const workspaceHtml = renderPythonWorkspacePage({
    courseTitle: 'Course',
    courseOverviewUrl: '/learn/e1',
    lessonTitle: 'Lesson',
    stepTitle: 'Step',
    stepOrdinalText: 'Step 1 of 5',
    enrollmentId: 'e1',
    stepId: 's1',
    problemStatement: 'Problem',
    inputFormat: 'None',
    outputFormat: 'Integer',
    constraints: 'None',
    starterCode: '',
    currentCode: 'print(42)',
    resultMode: 'samples',
    currentResult: dummyResult,
  });
  assert.ok(workspaceHtml.includes('<button type="button" class="btn btn-secondary btn-compact" id="run-samples-btn">Test samples</button>'));
  assert.ok(workspaceHtml.includes('id="run-code-btn"'));
  assert.ok(workspaceHtml.includes('id="submit-solution-btn"'));
});

test('L6: NavigationHistoryManager tracks traversal indices and accurately computes directional reversals', () => {
  let stateObj: any = null;
  const historyCalls: { method: string; args: any[] }[] = [];
  const mockWindow: any = {
    history: {
      get state() { return stateObj; },
      set state(val: any) { stateObj = val; },
      pushState(data: any, unused: string, url?: any) {
        stateObj = data;
        historyCalls.push({ method: 'pushState', args: [data, unused, url] });
      },
      replaceState(data: any, unused: string, url?: any) {
        stateObj = data;
        historyCalls.push({ method: 'replaceState', args: [data, unused, url] });
      },
      go(delta: number) {
        historyCalls.push({ method: 'go', args: [delta] });
      },
      forward() {
        historyCalls.push({ method: 'forward', args: [] });
      },
      back() {
        historyCalls.push({ method: 'back', args: [] });
      },
    },
    location: { href: 'http://localhost/test' },
  };

  const origWindow = (globalThis as any).window;
  try {
    (globalThis as any).window = mockWindow;
    const manager = new NavigationHistoryManager();
    assert.equal(manager.getCurrentIndex(), 0);

    // pushState moves index from 0 to 1
    mockWindow.history.pushState({ page: 'profile' }, '', '/settings/profile');
    assert.equal(manager.getCurrentIndex(), 1);
    assert.equal(stateObj.__zur_idx, 1);
    assert.equal(stateObj.page, 'profile');

    // pushState moves index from 1 to 2
    mockWindow.history.pushState({ page: 'courses' }, '', '/courses');
    assert.equal(manager.getCurrentIndex(), 2);
    assert.equal(stateObj.__zur_idx, 2);

    // Simulate native Back traversal to profile (index 1) without dirty guard
    const backState = { __zur_idx: 1 };
    assert.equal(manager.getDelta(backState), -1);
    manager.confirmPopstate(backState);
    assert.equal(manager.getCurrentIndex(), 1);

    // Now on profile (index 1), user triggers Forward to courses (index 2) but cancels
    const forwardState = { __zur_idx: 2 };
    assert.equal(manager.getDelta(forwardState), 1);
    manager.revertPopstate(forwardState);
    assert.equal(manager.isReverting(), true);
    // Verified that forward traversal is reversed by calling history.go(-1)
    const lastCall = historyCalls[historyCalls.length - 1];
    assert.equal(lastCall.method, 'go');
    assert.equal(lastCall.args[0], -1);

    // When the reverting popstate arrives, checkAndClearReverting suppresses loop and clears flag
    assert.equal(manager.checkAndClearReverting(), true);
    assert.equal(manager.isReverting(), false);
    assert.equal(manager.getCurrentIndex(), 1);

    // Now test Back traversal cancellation from profile (index 1) to learn (index 0)
    const backToLearnState = { __zur_idx: 0 };
    assert.equal(manager.getDelta(backToLearnState), -1);
    manager.revertPopstate(backToLearnState);
    assert.equal(manager.isReverting(), true);
    // Verified that backward traversal is reversed by calling history.go(+1)
    const backRevertCall = historyCalls[historyCalls.length - 1];
    assert.equal(backRevertCall.method, 'go');
    assert.equal(backRevertCall.args[0], 1);

    assert.equal(manager.checkAndClearReverting(), true);
    assert.equal(manager.isReverting(), false);
    assert.equal(manager.getCurrentIndex(), 1);
  } finally {
    (globalThis as any).window = origWindow;
  }
});


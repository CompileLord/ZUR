import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { AdminService } from '../packages/server/src/services/admin-service.ts';
import { OperationalMetricsService } from '../packages/server/src/services/operational-metrics-service.ts';
import { renderAdminPage } from '../packages/web/src/pages/admin/AdminPages.ts';
import { renderPythonWorkspacePage } from '../packages/web/src/pages/learning/PythonWorkspacePage.ts';
import { renderSignInPage } from '../packages/web/src/pages/account/SignInPage.ts';
import { renderAcceptInvitationPage } from '../packages/web/src/pages/learning/AcceptInvitationPage.ts';
import { renderDashboardContinuePage } from '../packages/web/src/pages/learning/DashboardContinuePage.ts';
import { renderTheoryStepPage } from '../packages/web/src/pages/learning/TheoryStepPage.ts';
import { renderVideoStepPage } from '../packages/web/src/pages/learning/VideoStepPage.ts';
import { renderQuizStepPage } from '../packages/web/src/pages/learning/QuizStepPage.ts';
import { renderLandingPage } from '../packages/web/src/pages/public/LandingPage.ts';
import { renderCatalogPage } from '../packages/web/src/pages/public/CatalogPage.ts';
import { renderCourseOverviewPage } from '../packages/web/src/pages/public/CourseOverviewPage.ts';
import { renderCourseBuilderPage } from '../packages/web/src/pages/author/CourseBuilderPage.ts';
import { renderCoursePublishPage } from '../packages/web/src/pages/author/CoursePublishPage.ts';
import { renderPythonExerciseEditorPage } from '../packages/web/src/pages/author/PythonExerciseEditorPage.ts';
import { renderCourseAnalyticsPage } from '../packages/web/src/pages/author/CourseAnalyticsPage.ts';
import { renderAiConnectionsPage } from '../packages/web/src/pages/settings/AiConnectionsPage.ts';
import { renderMcpClientSetupContent } from '../packages/web/src/pages/settings/McpClientSetupDialog.ts';
import { renderAgentActivityPage } from '../packages/web/src/pages/author/AgentActivityPage.ts';
import { renderAppShell } from '../packages/web/src/components/shells/AppShell.ts';
import type { ExecutionResult } from '../packages/shared/src/types/index.ts';

const root = process.cwd();
const dbPath = `file:s4m04-${crypto.randomUUID()}?mode=memory&cache=shared`;
const db = (runMigrations(dbPath), seedDatabase(dbPath), getDatabase(dbPath));
const out = path.join(root, 'screenshots');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-s4m04-'));
const styles = ['tokens.css', 'typography.css', 'layout.css', 'shells.css', 'components.css']
  .map((file) => fs.readFileSync(path.join(root, 'packages/web/src/styles', file), 'utf8')).join('\n');
const admin = new AdminService(db);
const metrics = new OperationalMetricsService();
const now = Date.now();
metrics.recordRequest('PUT', '/api/drafts', 503, 125, now - 1000);
metrics.recordRequest('POST', '/api/auth/sign-in', 401, 38, now - 700);
const overview = {
  ...admin.getOperationsOverview('user-admin-1'),
  operational: metrics.snapshot(db, now),
};
const enrollment = db.prepare("SELECT id FROM enrollments WHERE user_id='user-student-1' LIMIT 1").get() as any;
const step = db.prepare('SELECT id FROM steps LIMIT 1').get() as any;
db.prepare(`INSERT INTO execution_jobs(id,user_id,enrollment_id,step_id,job_type,code,status,lease_expires_at,created_at,updated_at)
  VALUES('fixture-stale-running','user-student-1',?,?,'submit','print(1)','running',?,?,?)`).run(enrollment.id, step.id, new Date(now - 1000).toISOString(), new Date(now - 60_000).toISOString(), new Date(now - 60_000).toISOString());
db.prepare(`INSERT INTO execution_jobs(id,user_id,enrollment_id,step_id,job_type,code,status,created_at,updated_at)
  VALUES('fixture-old-queued','user-student-1',?,?,'submit','print(1)','queued',?,?)`).run(enrollment.id, step.id, new Date(now - 60_000).toISOString(), new Date(now - 60_000).toISOString());
for (let i = 0; i < 2; i++) metrics.recordRequest('PUT', '/api/drafts', 503, 140, now - 500);
for (let i = 0; i < 19; i++) metrics.recordRequest('POST', '/api/auth/sign-in', 401, 36, now - 400);
const alertOverview = {
  ...admin.getOperationsOverview('user-admin-1'),
  operational: metrics.snapshot(db, now),
};
const result: ExecutionResult = {
  jobId: 'fixture-attempt', verdict: 'WRONG_ANSWER', isInfrastructureFailure: false,
  executionTimeMs: 14, completedAt: new Date().toISOString(),
  testResults: [{ position: 0, passed: false, verdict: 'WRONG_ANSWER', input: '4', expectedOutput: 'Even', actualOutput: 'Odd', isHidden: false, executionTimeMs: 14 }],
};
const workspace = renderPythonWorkspacePage({
  courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Conditions',
  stepTitle: 'Classify a number using its remainder', stepOrdinalText: 'Lesson 2 · Step 3 of 5',
  enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd',
  problemStatement: 'Read an integer and print Even when divisible by two; otherwise print Odd.',
  inputFormat: 'One integer on standard input.', outputFormat: 'Print one word.', constraints: '−10⁶ ≤ n ≤ 10⁶',
  starterCode: 'value = int(input())\n', currentCode: 'value = int(input())\nprint("Odd" if value % 2 else "Even")\n',
  examples: [{ input: '4', output: 'Even' }], hints: ['Use the remainder operator.'],
  saveStatus: 'unsaved', currentResult: result,
});
const hiddenFailureWorkspace = renderPythonWorkspacePage({
  courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Conditions',
  stepTitle: 'Classify a number using its remainder', stepOrdinalText: 'Lesson 2 · Step 3 of 5',
  enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd',
  problemStatement: 'Read an integer and print Even when divisible by two; otherwise print Odd.',
  inputFormat: 'One integer on standard input.', outputFormat: 'Print one word.', constraints: '−10⁶ ≤ n ≤ 10⁶',
  starterCode: 'value = int(input())\n', currentCode: 'value = int(input())\nprint(value % 2)\n',
  saveStatus: 'saved', currentResult: {
    jobId: 'fixture-hidden-attempt', verdict: 'WRONG_ANSWER', isInfrastructureFailure: false,
    executionTimeMs: 120, completedAt: new Date().toISOString(),
    guidance: 'Your solution did not pass a hidden test. Review the input limits and edge cases.',
    testResults: [],
  },
});

function html(title: string, body: string, theme: 'dark' | 'light' = 'dark') {
  return `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${styles}body{margin:0;background:var(--bg-canvas);color:var(--text-primary);font-family:Inter,system-ui,sans-serif}</style></head><body><a href="#main-content" class="skip-to-content">Skip to content</a><div id="app">${body}</div></body></html>`;
}

async function capture(name: string, content: string, width: number, height: number, theme: 'dark' | 'light' = 'dark', scale = 1) {
  const source = path.join(tempDir, `${name}.html`);
  fs.writeFileSync(source, html(name, content, theme));
  const profile = path.join(tempDir, `profile-${name}`);
  const portServer = createServer();
  await new Promise<void>((resolve) => portServer.listen(0, '127.0.0.1', resolve));
  const address = portServer.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a Chrome debugging port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));

  const chrome = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  let socket: WebSocket | undefined;
  try {
    let targets: any[] = [];
    for (let attempt = 0; attempt < 100; attempt++) {
      if (chrome.exitCode !== null) throw new Error(`Chrome exited before opening DevTools (${chrome.exitCode})`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (response.ok) targets = await response.json() as any[];
        if (targets.length) break;
      } catch { /* Chrome is still starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const target = targets.find((item) => item.type === 'page');
    if (!target?.webSocketDebuggerUrl) throw new Error('Chrome DevTools page target did not start');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener('open', () => resolve(), { once: true });
      socket!.addEventListener('error', () => reject(new Error('Could not connect to Chrome DevTools')), { once: true });
    });

    let nextId = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const events = new Map<string, Array<() => void>>();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
      } else {
        for (const done of events.get(message.method) ?? []) done();
      }
    });
    const send = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket!.send(JSON.stringify({ id, method, params }));
    });
    const waitEvent = (method: string) => new Promise<void>((resolve) => {
      const listeners = events.get(method) ?? [];
      listeners.push(resolve);
      events.set(method, listeners);
    });

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: scale, mobile: false,
    });
    const loaded = waitEvent('Page.loadEventFired');
    await send('Page.navigate', { url: pathToFileURL(source).href });
    await loaded;
    const viewport = await send('Runtime.evaluate', {
      expression: '({width: innerWidth, height: innerHeight, dpr: devicePixelRatio})',
      returnByValue: true,
    });
    const actual = viewport.result?.value;
    if (actual?.width !== width || actual?.height !== height || actual?.dpr !== scale) {
      throw new Error(`${name}: expected ${width}x${height} CSS px at DPR ${scale}, got ${JSON.stringify(actual)}`);
    }
    const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
  } finally {
    socket?.close();
    chrome.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      if (chrome.exitCode !== null) resolve();
      else {
        chrome.once('exit', () => resolve());
        setTimeout(() => { chrome.kill('SIGKILL'); resolve(); }, 1000).unref();
      }
    });
  }
}

async function captureJourney(name: string, body: string) {
  for (const theme of ['dark', 'light'] as const) {
    await capture(`${name}_1440x900_${theme}`, body, 1440, 900, theme);
    await capture(`${name}_390x844_${theme}`, body, 390, 844, theme);
  }
}

try {
  fs.mkdirSync(out, { recursive: true });
  const adminPage = renderAdminPage('/admin', overview, undefined, { displayName: 'Margaret Hamilton', email: 'margaret@zur.internal' });
  const adminAlertPage = renderAdminPage('/admin', alertOverview, undefined, { displayName: 'Margaret Hamilton', email: 'margaret@zur.internal' });
  await capture('s4_m04_operations_1440', adminPage, 1440, 900);
  await capture('s4_m04_operations_alert_fixture_1440', adminAlertPage, 1440, 900);
  await capture('s4_m04_operations_390', adminPage, 390, 844);
  await capture('s4_m04_operations_320', adminPage, 320, 844);
  await capture('s4_m04_python_unsaved_public_failure_1440', workspace, 1440, 900);
  await capture('s4_m04_python_hidden_failure_1440', hiddenFailureWorkspace, 1440, 900);
  await capture('s4_m04_python_guidance_1024', workspace, 1024, 768);
  await capture('s4_m04_python_guidance_768', workspace, 768, 1024);
  await capture('s4_m04_python_guidance_390', workspace, 390, 844);
  await capture('s4_m04_python_guidance_320', workspace, 320, 844);
  await capture('s4_m04_python_light_390', workspace, 390, 844, 'light');
  const matrixSizes = [
    { key: '1440x900', width: 1440, height: 900 },
    { key: '1024x768', width: 1024, height: 768 },
    { key: '768x1024', width: 768, height: 1024 },
    { key: '390x844', width: 390, height: 844 },
    { key: '320x844', width: 320, height: 844 },
  ];
  for (const theme of ['dark', 'light'] as const) {
    for (const size of matrixSizes) {
      await capture(`s4_m04_matrix_operations_${size.key}_${theme}`, adminPage, size.width, size.height, theme);
      await capture(`s4_m04_matrix_python_unsaved_${size.key}_${theme}`, workspace, size.width, size.height, theme);
    }
    await capture(`s4_m04_matrix_python_dpr2_320css_${theme}`, workspace, 320, 900, theme, 2);
  }

  const longCourseTitle = 'Python Foundations: A Practical Course in Variables, Branching, Loops, and Reliable Input Handling';
  await captureJourney('s4_t087_p01_landing', renderLandingPage({ isSignedIn: false }));
  const catalogBody = renderCatalogPage({
    courses: [{
      id: 'course-long-title', title: longCourseTitle,
      description: 'A long-form deterministic visual fixture covering careful input parsing, branching, loops, test driven practice, readable output, and common recovery paths for new Python learners.',
      authorName: 'Ada Lovelace', difficulty: 'beginner', language: 'en', estimatedDurationMinutes: 210,
      categoryId: 'cat-core', categoryName: 'Core Python', tags: ['python', 'foundations'],
    }],
    categories: [{ id: 'cat-core', name: 'Core Python', slug: 'core-python' }],
    total: 1, filters: { page: 1, limit: 12 },
  });
  await captureJourney('s4_t087_p02_catalog_long_content', catalogBody);
  await captureJourney('s4_t087_p02_catalog_no_matches', renderCatalogPage({
    courses: [], categories: [{ id: 'cat-core', name: 'Core Python', slug: 'core-python' }], total: 0,
    filters: { q: 'no matching deterministic fixture' },
  }));
  await captureJourney('s4_t087_p04_sign_in_validation', renderSignInPage({
    email: 'ada@example.test', error: 'We could not sign you in with those details. Check them and try again.',
  }));
  await captureJourney('s4_t087_p08_invitation_expired', renderAcceptInvitationPage({
    token: 'fixture-expired-invitation', valid: false, reason: 'expired',
  }));

  const dashboardUser = { displayName: 'Ada Lovelace', email: 'ada@example.test', capabilities: ['student'] as ('student' | 'author' | 'admin')[] };
  await captureJourney('s4_t087_p09_dashboard_empty', renderDashboardContinuePage({
    user: dashboardUser, continueCourse: null, recentCourses: [],
  }));
  await captureJourney('s4_t087_p09_dashboard_populated', renderDashboardContinuePage({
    user: dashboardUser,
    continueCourse: {
      courseId: 'course-python-foundations', enrollmentId: 'enr-ada', title: longCourseTitle,
      description: 'Deterministic populated dashboard fixture.', pinnedVersionNumber: 2,
      percentage: 42, completedRequired: 3, totalRequired: 7, isCompleted: false,
      nextIncompleteStepId: 'step-loops', nextStepTitle: 'Trace a long loop and explain each branch',
    },
    recentCourses: [{ courseId: 'course-previous', enrollmentId: 'enr-previous', title: 'Python Foundations: Previous Course Edition',
      description: 'Completed reference course.', difficulty: 'beginner', percentage: 100,
      isCompleted: true, status: 'active' }],
  }));

  const theory = renderTheoryStepPage({
    courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Variables',
    stepTitle: 'Read and trace a short Python example', stepOrdinalText: 'Lesson 1 · Step 1 of 4',
    isRequired: true, estimatedDurationMinutes: 7,
    markdownContent: '## Values and names\n\nA variable name refers to a value. Trace the example one line at a time.\n\n```python\ncount = 2\nprint(count + 1)\n```\n\nThe output is `3`. Keep the reading column comfortable and follow the example in order.',
    enrollmentId: 'enr-ada', stepId: 'step-theory', isCompleted: false, nextStepUrl: '/learn/enr-ada/steps/step-video',
  });
  await captureJourney('s4_t087_p12_theory_code_example', theory);
  await captureJourney('s4_t087_p13_video_unavailable_transcript', renderVideoStepPage({
    courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Functions',
    stepTitle: 'A video lesson with a readable transcript', stepOrdinalText: 'Lesson 2 · Step 1 of 3',
    isRequired: true, estimatedDurationMinutes: 8, videoUrl: 'https://unapproved.example.test/video/fixture',
    transcript: 'The video is unavailable in this fixture. This transcript preserves the lesson: define a function with def, give parameters meaningful names, and return a value when the caller needs one.',
    captionVerified: true, enrollmentId: 'enr-ada', stepId: 'step-video', isCompleted: false,
  }));

  const quizCommon = {
    courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Values',
    stepTitle: 'Integer division check', stepOrdinalText: 'Lesson 1 · Step 2 of 4',
    isRequired: true, estimatedDurationMinutes: 3, quizType: 'single_choice' as const,
    prompt: 'What does 7 // 2 evaluate to in Python?',
    options: [{ id: 'opt-35', text: '3.5' }, { id: 'opt-3', text: '3' }, { id: 'opt-4', text: '4' }],
    enrollmentId: 'enr-ada', stepId: 'step-quiz',
  };
  await captureJourney('s4_t087_p14_quiz_selected_incorrect', renderQuizStepPage({
    ...quizCommon, isCompleted: false, selectedOptionIds: ['opt-35'],
    feedback: { isPassed: false, verdict: 'WRONG_ANSWER' },
  }));
  await captureJourney('s4_t087_p14_quiz_passed', renderQuizStepPage({
    ...quizCommon, isCompleted: true, selectedOptionIds: ['opt-3'],
    feedback: { isPassed: true, verdict: 'PASSED', explanation: 'Floor division returns the whole-number quotient.', correctOptionIds: ['opt-3'] },
  }));

  await captureJourney('s4_t087_p03_course_suspended', renderCourseOverviewPage({
    data: {
      course: { id: 'course-python-foundations', title: 'Python foundations', description: 'Course availability is temporarily paused.', difficulty: 'beginner', language: 'en', authorName: 'Grace Hopper', estimatedDurationMinutes: 90, visibility: 'public', enrollmentPolicy: 'open', publicationStatus: 'published', versionNumber: 2, isSuspended: true, learningOutcomes: ['Trace a simple program'], prerequisites: '' },
      syllabus: [], enrollmentStatus: { isEnrolled: false, status: null }, isEmailVerified: true,
    }, currentUser: null,
  }));
  const suspendedCourse = admin.setCourseSuspended('user-admin-1', 'course-python-foundations', true, 'Deterministic visual-state fixture');
  await captureJourney('s4_t087_p34_admin_course_suspended', renderAdminPage('/admin/courses/course-python-foundations', suspendedCourse,
    new URLSearchParams(), { displayName: 'Margaret Hamilton', email: 'margaret@zur.internal' }));

  await captureJourney('s4_t087_p15_python_queued', renderPythonWorkspacePage({
    courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Conditions',
    stepTitle: 'Classify a number using its remainder', stepOrdinalText: 'Lesson 2 · Step 3 of 5',
    enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd',
    problemStatement: 'Read an integer and print Even when divisible by two; otherwise print Odd.',
    inputFormat: 'One integer on standard input.', outputFormat: 'Print one word.', constraints: '−10⁶ ≤ n ≤ 10⁶',
    starterCode: 'value = int(input())\n', currentCode: 'value = int(input())\n', saveStatus: 'saved',
    inFlightStatus: 'queued', inFlightJobId: 'job-fixture-queued',
  }));
  await captureJourney('s4_t087_p15_python_passed', renderPythonWorkspacePage({
    courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Conditions',
    stepTitle: 'Classify a number using its remainder', stepOrdinalText: 'Lesson 2 · Step 3 of 5',
    enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd',
    problemStatement: 'Read an integer and print Even when divisible by two; otherwise print Odd.',
    inputFormat: 'One integer on standard input.', outputFormat: 'Print one word.', constraints: '−10⁶ ≤ n ≤ 10⁶',
    starterCode: 'value = int(input())\n', currentCode: 'value = int(input())\nprint("Even" if value % 2 == 0 else "Odd")\n',
    saveStatus: 'saved', currentResult: { ...result, verdict: 'PASSED', testResults: [{ ...result.testResults[0], passed: true, verdict: 'PASSED', expectedOutput: 'Even', actualOutput: 'Even' }] },
    isCompleted: true,
  }));

  const builderCourseId = 'course-python-foundations';
  const modules = Array.from({ length: 3 }, (_, moduleIndex) => ({
    id: `fixture-module-${moduleIndex + 1}`, courseId: builderCourseId,
    title: ['Variables and Types', 'Conditions and Decisions', 'Loops and Long-Form Practice'][moduleIndex], position: moduleIndex + 1,
    lessons: Array.from({ length: 2 }, (_, lessonIndex) => ({
      id: `fixture-lesson-${moduleIndex + 1}-${lessonIndex + 1}`, moduleId: `fixture-module-${moduleIndex + 1}`,
      title: lessonIndex === 1 && moduleIndex === 2 ? 'A long lesson title that wraps without hiding its step list' : `Lesson ${lessonIndex + 1}: ${['Read', 'Practice'][lessonIndex]}`,
      position: lessonIndex + 1,
      steps: [{ id: `fixture-step-${moduleIndex + 1}-${lessonIndex + 1}`, lessonId: `fixture-lesson-${moduleIndex + 1}-${lessonIndex + 1}`,
        type: lessonIndex ? 'python' as const : 'theory' as const,
        title: lessonIndex ? 'Write and check a loop' : 'Read the concept', position: 1, isRequired: true, estimatedDurationMinutes: 10 }],
    })),
  }));
  await captureJourney('s4_t087_p22_builder_deep_tree_long_titles', renderCourseBuilderPage({
    courseId: builderCourseId, courseTitle: longCourseTitle, publicationState: 'draft', hasUnpublishedChanges: true,
    saveStatusText: 'Not saved — retrying', modules, selectedType: 'step', selectedId: 'fixture-step-3-2',
  }));

  const publishBase = { courseId: builderCourseId, courseTitle: longCourseTitle, publicationState: 'draft' as const,
    hasUnpublishedChanges: true, draftRevision: 12, newVersionNumber: 1, activeEnrolledStudents: 0,
    visibility: 'private' as const, enrollmentPolicy: 'invitation_only' as const, saveStatus: 'saved' as const };
  await captureJourney('s4_t087_p27_publish_blocked_errors', renderCoursePublishPage({
    ...publishBase, currentVersionNumber: null, validation: { isValid: false, draftRevision: 12, errors: [
      { code: 'missing_outcomes', message: 'Add at least one learning outcome.', field: 'learningOutcomes' },
      { code: 'reference_failed', message: 'The reference solution failed a hidden test.', stepId: 'fixture-step-3-2' },
    ], warnings: [{ code: 'missing_hint', message: 'Consider adding a hint for this exercise.', stepId: 'fixture-step-3-2' }] },
  }));
  await captureJourney('s4_t087_p27_publish_receipt', renderCoursePublishPage({
    ...publishBase, publicationState: 'published', hasUnpublishedChanges: false, currentVersionNumber: 1,
    validation: { isValid: true, draftRevision: 12, errors: [], warnings: [] },
    receipt: { versionNumber: 2, versionId: 'cv-fixture-v2', publishedAt: '2026-09-26T08:30:00.000Z', studentCountPinnedToOldVersions: 4 },
  }));
  await captureJourney('s4_t087_p25_python_reference_stale', renderPythonExerciseEditorPage({
    courseId: builderCourseId, courseTitle: longCourseTitle, publicationState: 'draft', hasUnpublishedChanges: true,
    stepId: 'fixture-step-python', stepTitle: 'Validate a loop reference solution', activeSubTab: 'validation',
    problemStatement: 'Read values and print their total.', inputFormat: 'One integer per line.', outputFormat: 'Print the total.',
    constraints: '1 ≤ n ≤ 1000', starterCode: 'total = 0\n', referenceSolution: 'print(sum(map(int, input().split())))\n',
    hints: ['Accumulate values.'], solutionExplanation: 'Read all values, then sum them.',
    publicTests: [{ stdin: '1 2', expectedStdout: '3' }], hiddenTests: [{ stdin: '4 5', expectedStdout: '9', isHidden: true }],
    runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 },
    validationStatus: 'needs_recheck', validationResults: [{ position: 1, passed: false, name: 'Hidden edge case', error: 'Reference validation is stale after a source change.' }],
    revision: 12, isRequired: true, estimatedDurationMinutes: 10, saveStatus: 'conflict',
  }));

  const sparseAnalytics = {
    courseId: builderCourseId, courseVersionId: 'cv-fixture-v2', windowDays: 30, versionNumber: 2,
    activeEnrollments: 1, learningActiveStudents: 0,
    completionRate: { count: 0, total: 1, percentage: 0 }, averageProgress: 0,
    exerciseInsights: [{ stepId: 'fixture-step-python', stepTitle: 'First attempt at a loop', stepType: 'python',
      moduleTitle: 'Loops', lessonTitle: 'Practice', distinctParticipants: 0, distinctPassCount: 0,
      passRatePercentage: null, medianAttemptsToPass: null, lastAssessedActivityAt: null, totalSubmissions: 0,
      waiverCount: 0, infraFailureCount: 0 }],
  };
  await captureJourney('s4_t087_p30_analytics_sparse_activity', renderCourseAnalyticsPage({
    courseId: builderCourseId, courseTitle: 'Python foundations', publicationState: 'published', hasUnpublishedChanges: false,
    analytics: sparseAnalytics, availableVersions: [{ id: 'cv-fixture-v1', versionNumber: 1 }, { id: 'cv-fixture-v2', versionNumber: 2 }],
    filters: { versionId: '2', windowDays: 30 },
  }));

  const settingsUser = { id: 'user-author-fixture', email: 'author@example.test', displayName: 'Grace Hopper', emailVerified: true,
    capabilities: ['student', 'author'] as ('student' | 'author')[], accountStatus: 'active' as const,
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  const emptyConnections = renderAppShell({ activePath: '/settings/ai-connections', user: settingsUser, currentMode: 'teach',
    headerTitle: 'AI connections', content: renderAiConnectionsPage({ user: settingsUser }) });
  await captureJourney('s4_t087_p43_connections_empty', emptyConnections);
  const expiringToken = { id: 'token-fixture-expired', tokenIdentifier: 'zur_mcp_4f9a', label: 'Loop course helper',
    scopes: ['courses:read', 'content:write'] as any, courseRestrictions: [builderCourseId], expiresAt: '2026-09-20T00:00:00.000Z',
    isRevoked: false, lastUsedAt: '2026-09-19T12:00:00.000Z', createdAt: '2026-08-20T12:00:00.000Z', status: 'expired' as const };
  const populatedConnections = renderAppShell({ activePath: '/settings/ai-connections', user: settingsUser, currentMode: 'teach',
    headerTitle: 'AI connections', content: renderAiConnectionsPage({ user: settingsUser,
      tokens: [expiringToken], courses: [{ id: builderCourseId, title: 'Python foundations' }], activeFilter: 'all', revokingToken: expiringToken }) });
  await captureJourney('s4_t087_p43_connections_expired_revocation_review', populatedConnections);
  await captureJourney('s4_t087_p43_token_grant_dialog', renderAppShell({ activePath: '/settings/ai-connections', user: settingsUser,
    currentMode: 'teach', headerTitle: 'AI connections', content: renderAiConnectionsPage({ user: settingsUser, showCreateModal: true }) }));
  const setupToken = { ...expiringToken, status: 'never_used' as const, isRevoked: false, lastUsedAt: null,
    expiresAt: '2026-10-26T08:30:00.000Z', scopes: ['courses:read', 'courses:create', 'content:write', 'media:write', 'exercises:validate'] as any };
  for (const client of ['generic', 'oauth_client'] as const) {
    const setup = renderAppShell({ activePath: '/settings/ai-connections', user: settingsUser, currentMode: 'teach',
      headerTitle: 'Connection setup', content: renderMcpClientSetupContent({ token: setupToken, endpointUrl: 'http://localhost:3000/api/mcp', selectedClient: client }) });
    await captureJourney(`s4_t087_p44_setup_${client}`, setup);
  }

  await captureJourney('s4_t087_p45_agent_update_diff_recovery', renderAgentActivityPage({
    courseId: builderCourseId, courseTitle: 'Python foundations', publicationState: 'draft', hasUnpublishedChanges: true,
    activities: [{ id: 'activity-fixture-1', tokenId: 'token-fixture-1', tokenLabel: 'Loop course helper', toolName: 'update_step_content',
      baseRevision: 11, newRevision: 12, affectedEntities: ['Loops/Practice/Reference solution'], outcome: 'success',
      correlationId: 'corr-fixture-safe', createdAt: '2026-09-26T08:20:00.000Z' }], totalActivities: 1, currentPage: 1, totalPages: 1,
    selectedMutation: { id: 'activity-fixture-1', tokenId: 'token-fixture-1', tokenLabel: 'Loop course helper', toolName: 'update_step_content',
      baseRevision: 11, newRevision: 12, affectedEntities: ['Loops/Practice/Reference solution'], outcome: 'success', correlationId: 'corr-fixture-safe',
      createdAt: '2026-09-26T08:20:00.000Z', courseId: builderCourseId,
      priorContent: { statement: 'Print each value.' }, newContent: { statement: 'Print each value in order.' } },
    recoveryRevisions: [{ id: 'recovery-fixture-11', courseId: builderCourseId, revisionNumber: 11, createdBy: 'Loop course helper',
      reason: 'Recoverable prior draft content', createdAt: '2026-09-25T12:00:00.000Z' }],
    selectedRecoveryRevision: { id: 'recovery-fixture-11', courseId: builderCourseId, revisionNumber: 11,
      createdBy: 'Loop course helper', reason: 'Recoverable prior draft content', createdAt: '2026-09-25T12:00:00.000Z' },
    showRestoreConfirmModal: true,
  }));
  console.log('Captured S4-M04 operational and Python workspace responsive/adverse fixtures.');
} finally {
  closeDatabase(dbPath);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

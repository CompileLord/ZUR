import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
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
import { renderStudentsAndInvitationsPage } from '../packages/web/src/pages/author/StudentsAndInvitationsPage.ts';
import { renderStudentDetailPage } from '../packages/web/src/pages/author/StudentDetailPage.ts';
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
const guiZoomTargets: Array<{ name: string; theme: 'dark' | 'light'; content: string }> = [];
const rosterLayoutMeasurements: Array<Record<string, unknown>> = [];
const studentDetailLayoutMeasurements: Array<Record<string, unknown>> = [];
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
    if (name.startsWith('s4_t087_p28_roster_') && width <= 390) {
      const layout = await send('Runtime.evaluate', {
        expression: `(()=>{const box=s=>document.querySelector(s)?.getBoundingClientRect();const header=box('.students-header');const title=box('.students-header > div:first-child');const action=box('.students-header .header-actions');const toolbar=document.querySelector('.roster-toolbar');const controls=[...toolbar.querySelectorAll('input,select,button')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right}});return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentClientWidth:document.documentElement.clientWidth,headerWidth:header?.width,headerTitleBottom:title?.bottom,headerActionTop:action?.top,headerActionRight:action?.right,headerRight:header?.right,toolbarWidth:toolbar?.clientWidth,toolbarScrollWidth:toolbar?.scrollWidth,controls}})()`,
        returnByValue: true,
      });
      const measured = layout.result?.value;
      assert.ok(measured, `${name}: roster layout metrics should be available`);
      assert.ok(measured.documentWidth <= measured.documentClientWidth, `${name}: page should not overflow horizontally (${JSON.stringify(measured)})`);
      assert.ok(measured.headerActionTop >= measured.headerTitleBottom, `${name}: invite action should follow the heading (${JSON.stringify(measured)})`);
      assert.ok(measured.headerActionRight <= measured.headerRight + 1, `${name}: invite action should fit the header (${JSON.stringify(measured)})`);
      assert.ok(measured.toolbarScrollWidth <= measured.toolbarWidth + 1, `${name}: filters should fit their toolbar (${JSON.stringify(measured)})`);
      assert.ok(measured.controls.every((control: any) => control.left >= 0 && control.right <= width + 1), `${name}: filter control is outside viewport (${JSON.stringify(measured)})`);
      rosterLayoutMeasurements.push({ name, theme: name.endsWith('_dark') ? 'dark' : 'light', ...measured });
    }
    if (name.startsWith('s4_t087_p29_student_detail_')) {
      const layout = await send('Runtime.evaluate', {
        expression: `(()=>{const hero=document.querySelector('.student-hero-card')?.getBoundingClientRect();const heading=document.querySelector('.student-hero-card h1')?.getBoundingClientRect();const actions=document.querySelector('.student-header-actions')?.getBoundingClientRect();const progress=document.querySelector('.student-hero-card')?.innerText.match(/\\d+ of \\d+ completed \\(\\d+%\\)/)?.[0];const curriculum=document.querySelector('.curriculum-steps-list');return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentClientWidth:document.documentElement.clientWidth,heroLeft:hero?.left,heroRight:hero?.right,headingRight:heading?.right,actionsLeft:actions?.left,actionsRight:actions?.right,progressSummary:progress,completedStepLabels:curriculum?.querySelectorAll('.status-badge.success').length,notStartedStepLabels:[...curriculum?.querySelectorAll('.step-rail-item')||[]].filter(item=>item.innerText.includes('Not started')).length}})()`,
        returnByValue: true,
      });
      const measured = layout.result?.value;
      assert.ok(measured, `${name}: P29 layout metrics should be available`);
      assert.ok(measured.documentWidth <= measured.documentClientWidth, `${name}: student detail should not overflow horizontally (${JSON.stringify(measured)})`);
      assert.ok(measured.heroRight <= width + 1, `${name}: student summary card should fit viewport (${JSON.stringify(measured)})`);
      assert.ok(measured.actionsRight <= width + 1, `${name}: student actions should fit viewport (${JSON.stringify(measured)})`);
      assert.equal(measured.progressSummary, '3 of 8 completed (38%)', `${name}: summary matches the seeded progress records`);
      assert.equal(measured.completedStepLabels, 3, `${name}: three curriculum steps display as completed`);
      assert.equal(measured.notStartedStepLabels, 5, `${name}: five curriculum steps display as not started`);
      studentDetailLayoutMeasurements.push({ name, theme: name.endsWith('_dark') ? 'dark' : 'light', ...measured });
    }
    if (name.startsWith('s4_t087_p12_theory_inline_image_')) {
      const images = await send('Runtime.evaluate', {
        expression: '[...document.querySelectorAll(".markdown-prose img")].map(image => ({complete:image.complete,naturalWidth:image.naturalWidth,alt:image.alt}))',
        returnByValue: true,
      });
      const measuredImages = images.result?.value as Array<{ complete: boolean; naturalWidth: number; alt: string }>;
      assert.ok(measuredImages.length > 0 && measuredImages.every((image) => image.complete && image.naturalWidth > 0), `${name}: inline image asset should load (${JSON.stringify(measuredImages)})`);
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
    const filter = process.env.S4_CAPTURE_JOURNEY_FILTER?.split(',').filter(Boolean);
    if (!filter || filter.includes(name)) {
      for (const size of journeySizes) await capture(`${name}_${size.key}_${theme}`, body, size.width, size.height, theme);
    }
    if (guiZoomJourneyNames.has(name)) guiZoomTargets.push({ name, theme, content: html(name, body, theme) });
  }
}

const journeySizes = [
  { key: '1440x900', width: 1440, height: 900 },
  { key: '1024x768', width: 1024, height: 768 },
  { key: '768x1024', width: 768, height: 1024 },
  { key: '390x844', width: 390, height: 844 },
  { key: '320x844', width: 320, height: 844 },
];
const guiZoomJourneyNames = new Set([
  's4_t087_p01_landing',
  's4_t087_p02_catalog_long_content',
  's4_t087_p15_python_queued',
  's4_t087_p22_builder_deep_tree_long_titles',
  's4_t087_p27_publish_blocked_errors',
  's4_t087_p28_roster_students_and_invitations',
  's4_t087_p30_analytics_sparse_activity',
  's4_t087_p34_admin_course_suspended',
  's4_t087_p43_token_grant_dialog',
  's4_t087_p29_student_detail',
  's4_t087_p09_dashboard_completed_course',
  's4_t087_p12_theory_inline_image',
  's4_t087_p14_quiz_multiple_choice',
  's4_t087_p25_python_test_list',
]);

async function captureGuiBrowserZoom200(fixtures: typeof guiZoomTargets) {
  if (fixtures.length !== guiZoomJourneyNames.size * 2) throw new Error('Expected dark/light fixtures for all nine GUI zoom journeys');
  const pages = new Map(fixtures.map((fixture) => [`/${fixture.name}/${fixture.theme}`, fixture.content]));
  const httpServer = createHttpServer((request, response) => {
    const content = pages.get(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (!content) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(content);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Could not start local GUI zoom fixture server');
  const debugServer = createServer();
  await new Promise<void>((resolve) => debugServer.listen(0, '127.0.0.1', resolve));
  const debugAddress = debugServer.address();
  if (!debugAddress || typeof debugAddress === 'string') throw new Error('Could not allocate GUI Chrome debugging port');
  const debugPort = debugAddress.port;
  await new Promise<void>((resolve, reject) => debugServer.close((error) => error ? reject(error) : resolve()));
  const profile = path.join(tempDir, 'gui-chrome-zoom200-profile');
  const chrome = spawn('google-chrome', [
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--window-size=1200,900',
    `http://127.0.0.1:${address.port}/${fixtures[0].name}/${fixtures[0].theme}`,
  ], { stdio: 'ignore' });
  let socket: WebSocket | undefined;
  try {
    let targets: any[] = [];
    for (let attempt = 0; attempt < 120; attempt++) {
      if (chrome.exitCode !== null) throw new Error(`GUI Chrome exited before DevTools startup (${chrome.exitCode})`);
      try {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
        if (response.ok) targets = await response.json() as any[];
        if (targets.some((target) => target.type === 'page')) break;
      } catch { /* GUI Chrome is still starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const page = targets.find((target) => target.type === 'page');
    if (!page?.webSocketDebuggerUrl) throw new Error('GUI Chrome page target did not start');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener('open', () => resolve(), { once: true });
      socket!.addEventListener('error', () => reject(new Error('Could not connect to GUI Chrome DevTools')), { once: true });
    });
    let nextId = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });
    const send = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket!.send(JSON.stringify({ id, method, params }));
    });
    const navigate = async (url: string) => {
      await send('Page.navigate', { url });
      await new Promise((resolve) => setTimeout(resolve, 650));
    };
    const metrics = async () => {
      const result = await send('Runtime.evaluate', {
        expression: '({innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio,visualViewportScale:visualViewport.scale})',
        returnByValue: true,
      });
      return result.result?.value as Record<string, number>;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    const first = fixtures[0];
    const firstUrl = `http://127.0.0.1:${address.port}/${first.name}/${first.theme}`;
    await navigate(firstUrl);
    const baseline = await metrics();
    if (!baseline?.innerWidth || !baseline.innerHeight || !baseline.devicePixelRatio) throw new Error('GUI Chrome did not report baseline viewport metrics');
    await navigate('chrome://settings/appearance');
    const selected = await send('Runtime.evaluate', {
      expression: `(()=>{function find(root){for(const e of root.querySelectorAll('*')){if(e.id==='zoomLevel')return e;if(e.shadowRoot){const x=find(e.shadowRoot);if(x)return x}}}const s=find(document);if(!s)throw new Error('Chrome zoom selector not found');const o=[...s.options].find(o=>o.textContent.trim()==='200%');if(!o)throw new Error('Chrome 200% zoom option not found');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));return {value:s.value,label:o.textContent.trim()}})()`,
      returnByValue: true,
    });
    if (selected.result?.value?.label !== '200%' || selected.result?.value?.value !== '2') throw new Error(`Chrome UI zoom selector did not accept 200%: ${JSON.stringify(selected.result?.value)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const captures: Array<Record<string, unknown>> = [];
    for (const fixture of fixtures) {
      const url = `http://127.0.0.1:${address.port}/${fixture.name}/${fixture.theme}`;
      await navigate(url);
      const actual = await metrics();
      if (actual.innerWidth * 2 !== baseline.innerWidth || actual.devicePixelRatio !== baseline.devicePixelRatio * 2 || actual.visualViewportScale !== 1) {
        throw new Error(`${fixture.name}/${fixture.theme}: GUI 200% zoom metrics mismatched baseline=${JSON.stringify(baseline)} actual=${JSON.stringify(actual)}`);
      }
      if (!actual.innerHeight || !actual.outerHeight) throw new Error(`${fixture.name}/${fixture.theme}: Chrome omitted vertical viewport measurements`);
      const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const file = `screenshots/${fixture.name}_200zoom_${fixture.theme}_gui.png`;
      fs.writeFileSync(path.join(root, file), Buffer.from(screenshot.data, 'base64'));
      captures.push({ id: fixture.name, theme: fixture.theme, browserZoomPercent: 200, baseline, actual, screenshot: file });
    }
    fs.writeFileSync(path.join(root, 'docs/evidence/s4-m04-gui-zoom-captures.json'), JSON.stringify({
      method: 'GUI Chrome Appearance Zoom setting selected 200% in an isolated temporary Chrome profile. Chrome CDP was used only to navigate, read browser metrics, and capture PNGs; no Emulation.setDeviceMetricsOverride, setDeviceScaleFactor, setPageScaleFactor, or forced zoom command was used.',
      chromeVersion: '154.0.8037.57',
      measuredAt: new Date().toISOString(),
      baseline,
      captures,
    }, null, 2) + '\n');
  } finally {
    socket?.close();
    chrome.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      if (chrome.exitCode !== null) resolve();
      else { chrome.once('exit', () => resolve()); setTimeout(() => { chrome.kill('SIGKILL'); resolve(); }, 1200).unref(); }
    });
    httpServer.close();
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
  await captureJourney('s4_t087_p09_dashboard_completed_course', renderDashboardContinuePage({
    user: dashboardUser,
    continueCourse: {
      courseId: 'course-completed', enrollmentId: 'enr-completed', title: 'Completed Python Foundations',
      description: 'All required steps are satisfied.', pinnedVersionNumber: 1,
      percentage: 100, completedRequired: 5, totalRequired: 5, isCompleted: true,
      nextIncompleteStepId: null, nextStepTitle: null,
    },
    recentCourses: [],
  }));

  const theory = renderTheoryStepPage({
    courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Variables',
    stepTitle: 'Read and trace a short Python example', stepOrdinalText: 'Lesson 1 · Step 1 of 4',
    isRequired: true, estimatedDurationMinutes: 7,
    markdownContent: '## Values and names\n\nA variable name refers to a value. Trace the example one line at a time.\n\n```python\ncount = 2\nprint(count + 1)\n```\n\nThe output is `3`. Keep the reading column comfortable and follow the example in order.',
    enrollmentId: 'enr-ada', stepId: 'step-theory', isCompleted: false, nextStepUrl: '/learn/enr-ada/steps/step-video',
  });
  await captureJourney('s4_t087_p12_theory_code_example', theory);
  const illustrationPath = path.join(root, 'packages/web/public/favicon.svg');
  const illustrationSvg = fs.readFileSync(illustrationPath, 'utf8').replace('<svg ', '<svg width="64" height="64" ');
  const illustrationDataUri = `data:image/svg+xml;base64,${Buffer.from(illustrationSvg).toString('base64')}`;
  await captureJourney('s4_t087_p12_theory_inline_image', renderTheoryStepPage({
    courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Values',
    stepTitle: 'Read a labeled diagram', stepOrdinalText: 'Lesson 1 · Step 2 of 4', isRequired: true,
    estimatedDurationMinutes: 4,
    markdownContent: `## Value flow\n\nThe diagram shows a value moving from input to output.\n\n![ZUR mark used as a small illustrative image](${illustrationDataUri})\n\nUse the text explanation as the source of instructions.`,
    enrollmentId: 'enr-ada', stepId: 'step-theory-image', isCompleted: false,
  }));
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
  await captureJourney('s4_t087_p14_quiz_multiple_choice', renderQuizStepPage({
    ...quizCommon, quizType: 'multiple_choice', stepTitle: 'Choose all true statements',
    prompt: 'Which statements about Python values are true?', options: [
      { id: 'opt-immutable', text: 'An integer value is immutable.' },
      { id: 'opt-list', text: 'A list can hold multiple values.' },
      { id: 'opt-string', text: 'Every string is a number.' },
    ], isCompleted: false, selectedOptionIds: ['opt-immutable', 'opt-list'],
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
  const longTestList = renderPythonExerciseEditorPage({
    courseId: builderCourseId, courseTitle: longCourseTitle, publicationState: 'draft', hasUnpublishedChanges: true,
    stepId: 'fixture-step-test-list', stepTitle: 'Inspect public and hidden test cases', activeSubTab: 'tests',
    problemStatement: 'Sum the supplied integers.', inputFormat: 'Integers separated by spaces.', outputFormat: 'Print the sum.',
    constraints: '1 ≤ n ≤ 1000', starterCode: 'print(sum(map(int, input().split())))\n', referenceSolution: 'print(sum(map(int, input().split())))\n',
    hints: [], solutionExplanation: 'Add each input value.',
    publicTests: Array.from({ length: 5 }, (_, i) => ({ stdin: `1 ${i + 2}`, expectedStdout: String(i + 3) })),
    hiddenTests: Array.from({ length: 4 }, (_, i) => ({ stdin: `${i + 5} 10`, expectedStdout: String(i + 15), isHidden: true })),
    runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 },
    validationStatus: 'passed', revision: 13, isRequired: true, estimatedDurationMinutes: 10, saveStatus: 'saved',
  });
  await captureJourney('s4_t087_p25_python_test_list', longTestList);

  const detailCurriculum = Array.from({ length: 4 }, (_, moduleIndex) => ({
    id: `detail-module-${moduleIndex + 1}`, title: ['Variables and Types', 'Decisions and Branching', 'Loops and Collections', 'Functions and Review'][moduleIndex],
    ordinal: moduleIndex + 1,
    lessons: Array.from({ length: 2 }, (_, lessonIndex) => ({
      id: `detail-lesson-${moduleIndex + 1}-${lessonIndex + 1}`,
      title: lessonIndex === 1 && moduleIndex === 3 ? 'A longer lesson title that wraps while preserving the step rail layout' : `Lesson ${lessonIndex + 1}: ${['Read', 'Practice'][lessonIndex]}`,
      ordinal: lessonIndex + 1,
      steps: [{ id: `detail-step-${moduleIndex + 1}-${lessonIndex + 1}`, title: lessonIndex ? 'Write and check a short program' : 'Read the concept and example', type: lessonIndex ? 'python' as const : 'theory' as const, ordinal: 1, isRequired: true }],
    })),
  }));
  const detailData = {
    enrollment: { id: 'enr-detail-fixture', courseId: builderCourseId, courseTitle: 'Python foundations', courseVersionId: 'cv-detail-fixture', versionNumber: 3, status: 'active' as const, enrolledAt: '2026-08-20T08:30:00.000Z', revokedAt: null, revocationReason: null, completedAt: null },
    student: { id: 'user-detail-fixture', displayName: 'Ada Lovelace', email: 'a***a@example.test' },
    overallProgress: { requiredStepsCompleted: 3, totalRequiredSteps: 8, percentage: 38, lastLearningActivityAt: '2026-09-25T13:15:00.000Z' },
    curriculum: detailCurriculum,
    stepProgress: {
      'detail-step-1-1': { satisfied: true, completedAt: '2026-09-02T10:00:00.000Z', submissionCount: 0, bestScore: null, isWaived: false },
      'detail-step-1-2': { satisfied: true, completedAt: '2026-09-04T10:00:00.000Z', submissionCount: 1, bestScore: 100, isWaived: false },
      'detail-step-2-1': { satisfied: true, completedAt: '2026-09-06T10:00:00.000Z', submissionCount: 0, bestScore: null, isWaived: false },
    },
    attempts: {}, waivers: {},
  };
  await captureJourney('s4_t087_p29_student_detail', renderStudentDetailPage({
    courseId: builderCourseId, courseTitle: 'Python foundations', publicationState: 'published',
    hasUnpublishedChanges: false, data: detailData, selectedStepId: 'detail-step-1-1',
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
  await captureJourney('s4_t087_p28_roster_students_and_invitations', renderStudentsAndInvitationsPage({
    courseId: builderCourseId, courseTitle: 'Python foundations', publicationState: 'published', hasUnpublishedChanges: false,
    totalStudentsCount: 18,
    roster: { limit: 20, offset: 0, totalCount: 18, items: [
      { enrollmentId: 'enr-ada', userId: 'user-student-1', displayName: 'Ada Lovelace', email: 'ada@example.test', versionNumber: 2, versionId: 'cv-fixture-v2', status: 'active', requiredStepsCompleted: 3, totalRequiredSteps: 7, progressPercentage: 42, lastLearningActivityAt: '2026-09-25T13:15:00.000Z', enrolledAt: '2026-08-20T08:30:00.000Z' },
      { enrollmentId: 'enr-long-name', userId: 'user-student-2', displayName: 'Margaret Hamilton with a Longer Display Name', email: 'margaret.hamilton@example.test', versionNumber: 1, versionId: 'cv-fixture-v1', status: 'active', requiredStepsCompleted: 6, totalRequiredSteps: 7, progressPercentage: 86, lastLearningActivityAt: '2026-09-24T10:00:00.000Z', enrolledAt: '2026-08-22T08:30:00.000Z' },
      { enrollmentId: 'enr-no-activity', userId: 'user-student-3', displayName: 'Grace Hopper', email: 'grace@example.test', versionNumber: 2, versionId: 'cv-fixture-v2', status: 'active', requiredStepsCompleted: 0, totalRequiredSteps: 7, progressPercentage: 0, lastLearningActivityAt: null, enrolledAt: '2026-09-01T08:30:00.000Z' },
    ] },
    invitations: [{ id: 'invitation-fixture-1', courseId: builderCourseId, type: 'email', recipientEmail: 'learner@example.test', expiresAt: '2026-10-03T08:30:00.000Z', maxUses: 1, usesCount: 0, isRevoked: false, emailDeliveryStatus: 'sent', emailSentAt: '2026-09-25T08:30:00.000Z', createdAt: '2026-09-25T08:30:00.000Z' }],
    availableVersions: [{ id: 'cv-fixture-v1', versionNumber: 1 }, { id: 'cv-fixture-v2', versionNumber: 2 }],
    currentTab: 'enrolled', filters: { status: 'all', version: 'all' },
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
  if (process.env.S4_CAPTURE_GUI_ZOOM === '1') {
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error('S4_CAPTURE_GUI_ZOOM requires an active desktop display session');
    await captureGuiBrowserZoom200(guiZoomTargets);
  }
  if (rosterLayoutMeasurements.length) {
    fs.writeFileSync(path.join(root, 'docs/evidence/s4-m04-roster-layout-checks.json'), JSON.stringify({
      method: 'Headless Chrome CDP captures of the real StudentsAndInvitationsPage renderer at asserted CSS viewports. This report checks document/toolbar scroll widths and invitation button bounds, in addition to saving the corresponding PNGs.',
      captures: rosterLayoutMeasurements,
    }, null, 2) + '\n');
  }
  if (studentDetailLayoutMeasurements.length) {
    fs.writeFileSync(path.join(root, 'docs/evidence/s4-m04-student-detail-layout-checks.json'), JSON.stringify({
      method: 'Headless Chrome CDP captures of the real StudentDetailPage renderer at asserted CSS viewports. The report records document width, hero-card bounds, and action bounds for every theme and requested size.',
      captures: studentDetailLayoutMeasurements,
    }, null, 2) + '\n');
  }
  console.log('Captured S4-M04 operational and Python workspace responsive/adverse fixtures.');
} finally {
  closeDatabase(dbPath);
  fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}

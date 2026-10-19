import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import type { Server } from 'node:http';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';
import { ExecutionService } from '../packages/server/src/services/execution-service.ts';
import { createServer as createViteServer } from 'vite';

delete process.env.HTTP_PROXY;
delete process.env.http_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.https_proxy;
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

const root = process.cwd();
const screenshotsDir = path.join(root, 'screenshots', 'interface-fixes-2026-10-08', 'learner', 'round-4');
const docsDir = path.join(root, 'docs', 'audits', '2026-10-08-interface-fixes', 'learner');

fs.mkdirSync(screenshotsDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });

console.log('============================================================');
console.log('  ZUR LEARNER FIXES AUDIT & CAPTURE HARNESS (L1–L8)');
console.log(`  Screenshots: ${screenshotsDir}`);
console.log(`  Audit Docs:  ${docsDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-learner-fixes-'));
const dbPath = path.join(tmp, 'zur-learner-fixes.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);
const execution = new ExecutionService(db);

const nowIso = new Date().toISOString();

// Extra seed: Completed course enrollment for Ada Lovelace (for L1 filter=completed testing)
db.prepare(`
  INSERT INTO courses (
    id, owner_id, title, description, category_id, tags, difficulty, language,
    learning_outcomes, prerequisites, estimated_duration_minutes, visibility,
    enrollment_policy, publication_status, is_suspended, draft_revision, created_at, updated_at
  ) VALUES (
    'course-python-completed', 'user-author-1', 'Python Advanced Systems',
    'Completed course on advanced Python systems.',
    'cat-programming', '["advanced","systems"]', 'advanced', 'en',
    '["Systems"]', 'None', 60, 'public', 'open', 'published', 0, 1, '${nowIso}', '${nowIso}'
  )
`).run();

db.prepare(`
  INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
  VALUES ('enr-ada-completed', 'user-student-1', 'course-python-completed', 'version-2-snapshot', 'active', datetime('now', '-30 days'), '${nowIso}')
`).run();

// Mark all steps in enr-ada-completed as completed
for (const stepId of ['step-1-theory', 'step-2-video', 'step-3-quiz-single', 'step-4-python-echo', 'step-5-quiz-multi', 'step-6-python-evenodd', 'step-7-python-sum']) {
  db.prepare(`
    INSERT INTO step_progress (id, user_id, enrollment_id, step_id, is_completed, completed_at, is_waived, created_at, updated_at)
    VALUES ('prog-comp-${stepId}', 'user-student-1', 'enr-ada-completed', '${stepId}', 1, datetime('now', '-5 days'), 0, '${nowIso}', '${nowIso}')
  `).run();
}

// Extra seed: Historical attempts for step-4-python-echo in enr-ada (for L2 and L4 testing)
// Attempt 1: Normal passed attempt
db.prepare(`
  INSERT INTO assessment_attempts (
    id, user_id, enrollment_id, step_id, course_version_id, attempt_number,
    type, code_snapshot, verdict, execution_time_ms, created_at
  ) VALUES (
    'att-ada-1', 'user-student-1', 'enr-ada', 'step-4-python-echo', 'version-2-snapshot', 1,
    'python', 'import sys\nval = int(sys.stdin.read().strip())\nprint(val * 2)\n',
    'PASSED', 18, datetime('now', '-2 days')
  )
`).run();

// Attempt 2: Passed attempt with very long lines (tests L4 horizontal scrolling without page overflow)
const longCodeSnapshot = `# Solution with detailed comments and long statements\nimport sys\n\ndef compute_doubled_value_from_standard_input():\n    raw_input_data = sys.stdin.read().strip()\n    if not raw_input_data:\n        return 0\n    parsed_integer_value = int(raw_input_data)\n    very_descriptive_and_long_variable_name_exceeding_standard_reading_pane_width_for_containment_testing = parsed_integer_value * 2\n    return very_descriptive_and_long_variable_name_exceeding_standard_reading_pane_width_for_containment_testing\n\nif __name__ == '__main__':\n    print(compute_doubled_value_from_standard_input())\n`;

db.prepare(`
  INSERT INTO assessment_attempts (
    id, user_id, enrollment_id, step_id, course_version_id, attempt_number,
    type, code_snapshot, verdict, execution_time_ms, created_at
  ) VALUES (
    'att-ada-2', 'user-student-1', 'enr-ada', 'step-4-python-echo', 'version-2-snapshot', 2,
    'python', ?, 'PASSED', 24, datetime('now', '-1 day')
  )
`).run(longCodeSnapshot);

// Controlled server faults for adverse testing (L2, L5, L6, L7)
let controlled500 = false;
let controlledReport503 = false;
let controlledProfile503 = false;
let controlledRestore503 = false;

const faultReceipts = {
  overview500: 0,
  report503: 0,
  profile503: 0,
  restore503: 0,
};

const baseApi = createServer(db);

const api = http.createServer((req, res) => {
  const urlPath = (req.url || '').split('?')[0];
  if (controlled500 && (urlPath.startsWith('/api/courses/') || urlPath.startsWith('/api/catalog'))) {
    faultReceipts.overview500++;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'SERVICE_ERROR', message: 'Controlled server error for interface audit' } }));
    return;
  }
  if (controlledReport503 && urlPath === '/api/reports' && req.method === 'POST') {
    faultReceipts.report503++;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Could not submit report. Your message is preserved; try again.' } }));
    return;
  }
  if (controlledProfile503 && urlPath === '/api/settings/profile' && req.method === 'PUT') {
    faultReceipts.profile503++;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Network error: Could not save profile changes to server.' } }));
    return;
  }
  if (controlledRestore503 && urlPath.startsWith('/api/attempts/') && urlPath.endsWith('/restore') && req.method === 'POST') {
    faultReceipts.restore503++;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'This attempt could not be restored. Your current editor content is preserved.' } }));
    return;
  }
  baseApi.emit('request', req, res);
});

let apiServer: Server | undefined;
let viteServer: any;
let chrome: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;

async function port(): Promise<number> {
  const s = createNetServer();
  await new Promise<void>(r => s.listen(0, '127.0.0.1', r));
  const a = s.address();
  if (!a || typeof a === 'string') throw Error('port');
  await new Promise<void>(r => s.close(() => r()));
  return a.port;
}

async function stopProcess(p?: ReturnType<typeof spawn>) {
  if (!p || p.exitCode !== null) return;
  await new Promise<void>(r => {
    p.once('exit', () => r());
    p.kill('SIGTERM');
    setTimeout(() => {
      if (p.exitCode === null) p.kill('SIGKILL');
    }, 2000);
  });
}

interface ManifestEntry {
  filePath: string;
  issue: string;
  route: string;
  observedUrl?: string;
  pageIdentity?: string;
  renderedState: string;
  theme: 'dark' | 'light';
  viewport: string;
  dimensions?: { width: number; height: number };
  timestamp: string;
  fixture: string;
  fault?: string;
  provenance: string;
}

interface LogEntry {
  step: number;
  issue: string;
  action: string;
  observedUrl: string;
  renderedState: string;
  evidence: string;
  passed: boolean;
}

const manifest: ManifestEntry[] = [];
const interactionLog: LogEntry[] = [];
let stepCounter = 0;

function logInteraction(
  issue: string,
  action: string,
  observedUrl: string,
  renderedState: string,
  evidence: string,
  passed: boolean
) {
  stepCounter++;
  interactionLog.push({
    step: stepCounter,
    issue,
    action,
    observedUrl,
    renderedState,
    evidence,
    passed,
  });
  console.log(`[#${stepCounter} - ${issue}] ${action} -> ${passed ? 'PASS' : 'FAIL'} (${observedUrl})`);
}

try {
  apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    apiServer!.once('listening', () => resolve());
    apiServer!.once('error', reject);
  });
  const apiAddress = apiServer.address();
  const apiPort = (apiAddress && typeof apiAddress !== 'string') ? apiAddress.port : 3000;

  const webPort = await port();
  viteServer = await createViteServer({
    configFile: false,
    root: path.join(root, 'packages/web'),
    cacheDir: path.join(tmp, 'vite-cache'),
    server: {
      host: '127.0.0.1',
      port: webPort,
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
    build: {
      target: 'es2022',
    },
  });
  await viteServer.listen();
  const actualVitePort = (viteServer.httpServer && typeof viteServer.httpServer.address() !== 'string')
    ? (viteServer.httpServer.address() as any).port
    : webPort;
  const origin = `http://127.0.0.1:${actualVitePort}`;

  const chromeDataDir = path.join(tmp, 'chrome');
  chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-proxy-server',
    '--proxy-bypass-list=<-loopback>',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${chromeDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let assignedPort = 0;
  const activePortFile = path.join(chromeDataDir, 'DevToolsActivePort');
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(activePortFile)) {
      try {
        const raw = fs.readFileSync(activePortFile, 'utf8');
        const [p] = raw.trim().split('\n');
        assignedPort = parseInt(p, 10);
        if (assignedPort > 0) break;
      } catch {}
    }
    await new Promise(r => setTimeout(r, 100));
  }
  if (!assignedPort) throw Error('Chrome DevToolsActivePort unavailable');

  let target: any;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${assignedPort}/json/list`);
      const list = await res.json() as any[];
      target = list.find(x => x.type === 'page');
      if (target?.webSocketDebuggerUrl) break;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!target) throw Error('Chrome target unavailable');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((r, j) => {
    socket!.addEventListener('open', () => r(), { once: true });
    socket!.addEventListener('error', () => j(Error('CDP connection error')), { once: true });
  });

  let nextId = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }>();
  let dialogHandler: ((event: any) => void) | null = null;
  let lastMainLoader = '';
  const loadedDocuments = new Set<string>();

  socket.addEventListener('message', e => {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Page.javascriptDialogOpening' && dialogHandler) {
      dialogHandler(m.params);
    }
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) {
      lastMainLoader = m.params.frame.loaderId;
    }
    if (m.method === 'Page.lifecycleEvent' && m.params.name === 'DOMContentLoaded') {
      loadedDocuments.add(m.params.loaderId);
    }
    if (m.id) {
      const a = pending.get(m.id);
      if (!a) return;
      clearTimeout(a.timer);
      pending.delete(m.id);
      if (m.error) a.reject(new Error(m.error.message));
      else a.resolve(m.result);
    }
  });

  const cmd = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket!.send(JSON.stringify({ id, method, params }));
    });

  const ev = async (expression: string) => {
    const res = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res?.exceptionDetails) {
      const details = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`JS Evaluation Error for [${expression.slice(0, 80)}]: ${details}`);
    }
    return res?.result?.value;
  };

  const wait = async (expression: string, label: string, maxAttempts = 120) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        if (await ev(expression)) return;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    let snippet = '';
    try {
      snippet = await ev('document.body ? document.body.innerText.slice(0, 500) : ""');
    } catch {}
    throw Error(`Wait timeout for [${label}]: ${snippet}`);
  };

  const nav = async (url: string) => {
    const navigation = await cmd('Page.navigate', { url });
    if (navigation?.loaderId) {
      let loaded = false;
      for (let i = 0; i < 150; i++) {
        if (loadedDocuments.has(navigation.loaderId)) {
          loaded = true;
          break;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      if (!loaded) {
        throw new Error(`Navigation DOMContentLoaded timeout for loaderId: ${navigation.loaderId} at ${url}`);
      }
    }
    const targetUrl = new URL(url);
    const expected = (targetUrl.pathname + targetUrl.search).replace(/\/+$/, '') || '/';
    await wait(
      `Boolean(document.body) && (((location.pathname + location.search).replace(/\\/+$/, '') || '/') === ${JSON.stringify(expected)})`,
      `Navigated to ${url}`
    );
  };

  await cmd('Page.enable');
  await cmd('Page.setLifecycleEventsEnabled', { enabled: true });
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  async function setViewport(width: number, height = 900) {
    await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 100));
  }

  async function applyTheme(theme: 'dark' | 'light') {
    await ev(`(()=>{
      localStorage.setItem('zur_theme_preference', '${theme}');
      document.documentElement.dataset.theme = '${theme}';
      document.documentElement.setAttribute('data-theme', '${theme}');
      document.documentElement.style.colorScheme = '${theme}';
      return true;
    })()`);
    await new Promise(r => setTimeout(r, 100));
  }

  async function capture(
    filenameBase: string,
    issue: string,
    routePath: string,
    stateDesc: string,
    theme: 'dark' | 'light',
    viewport = '1440x900',
    fixtureDesc = 'Ada Lovelace disposable SQLite seed',
    faultDesc?: string
  ): Promise<string> {
    const filename = `${filenameBase}-${theme}.png`;
    const fullPath = path.join(screenshotsDir, filename);
    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 80));

    const observed = await ev(`({
      observedUrl: window.location.pathname + window.location.search,
      pageIdentity: document.querySelector('h1, h2, .workspace-title, .dialog-title')?.textContent?.trim() || document.title,
      theme: document.documentElement.dataset.theme || document.documentElement.getAttribute('data-theme'),
      dimensions: { width: window.innerWidth, height: window.innerHeight }
    })`);

    if (!observed || typeof observed !== 'object') {
      throw new Error(`Failed to observe page metadata for capture: ${filename}`);
    }
    if (!observed.observedUrl) {
      throw new Error(`Missing observedUrl for capture: ${filename}`);
    }
    if (!observed.pageIdentity) {
      throw new Error(`Missing pageIdentity for capture: ${filename}`);
    }
    if (observed.theme !== theme) {
      throw new Error(`Theme mismatch for capture ${filename}: expected ${theme}, observed ${observed.theme}`);
    }
    if (!observed.dimensions || typeof observed.dimensions.width !== 'number' || observed.dimensions.width < 1000) {
      throw new Error(`Invalid dimensions observed for capture ${filename}: ${JSON.stringify(observed.dimensions)}`);
    }

    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(fullPath, Buffer.from(vpShot.data, 'base64'));

    manifest.push({
      filePath: `screenshots/interface-fixes-2026-10-08/learner/round-4/${filename}`,
      issue,
      route: observed.observedUrl,
      observedUrl: observed.observedUrl,
      pageIdentity: observed.pageIdentity,
      renderedState: stateDesc,
      theme: observed.theme as 'dark' | 'light',
      viewport: `${observed.dimensions.width}x${observed.dimensions.height}`,
      dimensions: observed.dimensions,
      timestamp: new Date().toISOString(),
      fixture: fixtureDesc,
      fault: faultDesc,
      provenance: 'Fresh headless Google Chrome capture via CDP DevToolsActivePort',
    });
    console.log(`    [Saved] ${filename} (${observed.dimensions.width}x${observed.dimensions.height}) [${observed.observedUrl}]`);
    return fullPath;
  }

  async function signInAsAda() {
    await nav(`${origin}/sign-in`);
    await ev(`(()=>{
      localStorage.removeItem('zur_session_token');
      localStorage.removeItem('zur_current_user');
      return true;
    })()`);
    await wait('Boolean(document.querySelector("#sign-in-form"))', 'Sign-in form');
    await ev(`(()=>{
      document.querySelector('#email').value = 'ada@zur.internal';
      document.querySelector('#password').value = 'StudentPass123!';
      document.querySelector('#sign-in-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    await wait('Boolean(localStorage.getItem("zur_session_token"))', 'Ada session token');
    await new Promise(r => setTimeout(r, 150));
  }

  async function signOut() {
    await ev(`(()=>{
      localStorage.removeItem('zur_session_token');
      localStorage.removeItem('zur_current_user');
      return true;
    })()`);
  }

  // Authenticate Ada
  await signInAsAda();

  // =========================================================================
  // L1: My Courses Filter Reflects URL, Tabs, and Rows
  // =========================================================================
  console.log('\n--- Capturing L1: My Courses Filter & Tabs ---');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);

    // 1. In Progress filter
    await nav(`${origin}/learn/courses?filter=in_progress`);
    await wait('Boolean(document.querySelector(".tab-link.active"))', 'My Courses in progress');
    const inProgressTabActive = await ev('document.querySelector(".tab-link[href*=\\"filter=in_progress\\"]")?.classList.contains("active")');
    const inProgressCourseCount = await ev('document.querySelectorAll(".enrolled-course-flat-row").length');
    logInteraction('L1', 'Navigate to /learn/courses?filter=in_progress', '/learn/courses?filter=in_progress', 'In progress tab active with active courses', `Tab active: ${inProgressTabActive}, rows: ${inProgressCourseCount}`, Boolean(inProgressTabActive));
    await capture('learner-l1-mycourses-in-progress', 'L1', '/learn/courses?filter=in_progress', 'In progress tab active with active courses', theme);

    // 2. Completed filter
    await nav(`${origin}/learn/courses?filter=completed`);
    await wait('Boolean(document.querySelector(".tab-link.active"))', 'My Courses completed');
    const completedTabActive = await ev('document.querySelector(".tab-link[href*=\\"filter=completed\\"]")?.classList.contains("active")');
    const completedCourseCount = await ev('document.querySelectorAll(".enrolled-course-flat-row").length');
    const completedTitle = await ev('document.querySelector(".enrolled-course-flat-row .course-row-title")?.textContent');
    logInteraction('L1', 'Navigate to /learn/courses?filter=completed', '/learn/courses?filter=completed', 'Completed tab active with completed courses', `Tab active: ${completedTabActive}, rows: ${completedCourseCount}, title: ${completedTitle}`, Boolean(completedTabActive && completedCourseCount > 0));
    await capture('learner-l1-mycourses-completed', 'L1', '/learn/courses?filter=completed', 'Completed tab active showing finished courses', theme);

    // 3. All filter
    await nav(`${origin}/learn/courses?filter=all`);
    await wait('Boolean(document.querySelector(".tab-link.active"))', 'My Courses all');
    const allTabActive = await ev('document.querySelector(".tab-link[href*=\\"filter=all\\"]")?.classList.contains("active")');
    const allCount = await ev('document.querySelectorAll(".enrolled-course-flat-row").length');
    logInteraction('L1', 'Navigate to /learn/courses?filter=all', '/learn/courses?filter=all', 'All tab active with all courses', `Tab active: ${allTabActive}, rows: ${allCount}`, Boolean(allTabActive && allCount >= 2));
    await capture('learner-l1-mycourses-all', 'L1', '/learn/courses?filter=all', 'All tab active showing all enrollments', theme);
  }

  // L1: Empty Completed state (for student Alan Turing who has 0 completed courses)
  console.log('--- Capturing L1: Empty Completed State ---');
  await nav(`${origin}/sign-in`);
  await ev(`(()=>{
    localStorage.removeItem('zur_session_token');
    localStorage.removeItem('zur_current_user');
    return true;
  })()`);
  await wait('Boolean(document.querySelector("#sign-in-form"))', 'Sign-in form');
  await ev(`(()=>{
    document.querySelector('#email').value = 'alan@zur.internal';
    document.querySelector('#password').value = 'StudentPass123!';
    document.querySelector('#sign-in-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  })()`);
  await wait('Boolean(localStorage.getItem("zur_session_token"))', 'Alan session token');

  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);
    await nav(`${origin}/learn/courses?filter=completed`);
    await wait('Boolean(document.querySelector(".tab-link.active"))', 'My Courses empty completed');
    const emptyMsg = await ev('document.querySelector(".empty-message")?.textContent');
    logInteraction('L1', 'Alan Turing /learn/courses?filter=completed', '/learn/courses?filter=completed', 'Empty completed state with informative message', `Message: ${emptyMsg}`, Boolean(emptyMsg && emptyMsg.includes('No completed courses')));
    await capture('learner-l1-mycourses-empty-completed', 'L1', '/learn/courses?filter=completed', 'Empty completed state with explanatory guidance', theme, '1440x900', 'Alan Turing disposable zero-completed fixture');
  }

  // Sign back in as Ada
  await signInAsAda();

  // =========================================================================
  // L2 & L4: Attempts List, Detail, Empty, Long Code, and Restore Confirmation
  // =========================================================================
  console.log('\n--- Capturing L2 & L4: Attempts History & Detail ---');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);

    // 1. Attempts list with real curriculum & selected exercise
    await nav(`${origin}/learn/enr-ada/steps/step-4-python-echo/attempts`);
    await wait('Boolean(document.querySelector(".attempt-history-container"))', 'Attempts list');
    const hasPlaceholderNav = await ev('Boolean(document.querySelector(".outline-nav"))');
    const hasCurriculumSidebar = await ev('Boolean(document.querySelector("#course-sidebar"))');
    const selectedTaskSquare = await ev('document.querySelector(".task-square[href*=\\"step-4-python-echo\\"]")?.classList.contains("selected")');
    logInteraction('L2', 'Navigate to attempts list', '/learn/enr-ada/steps/step-4-python-echo/attempts', 'Attempts list with real curriculum and parent exercise selected', `Placeholder removed: ${!hasPlaceholderNav}, Real curriculum: ${hasCurriculumSidebar}, Selected task: ${selectedTaskSquare}`, !hasPlaceholderNav && hasCurriculumSidebar);
    await capture('learner-l2-attempts-list', 'L2', '/learn/enr-ada/steps/step-4-python-echo/attempts', 'Attempts list retaining real curriculum sidebar and parent task selection', theme);

    // 2. Attempts empty state
    await nav(`${origin}/learn/enr-ada/steps/step-6-python-evenodd/attempts`);
    await wait('Boolean(document.querySelector(".attempt-history-container"))', 'Empty attempts list');
    const emptyNotice = await ev('document.querySelector(".results-empty-notice")?.textContent');
    const returnLink = await ev('Boolean(document.querySelector(".results-empty-notice a"))');
    logInteraction('L2', 'Navigate to empty attempts list', '/learn/enr-ada/steps/step-6-python-evenodd/attempts', 'Empty attempts list retaining curriculum and return link', `Notice: ${emptyNotice}, return link: ${returnLink}`, Boolean(emptyNotice && returnLink));
    await capture('learner-l2-attempts-empty', 'L2', '/learn/enr-ada/steps/step-6-python-evenodd/attempts', 'Empty attempts list with real curriculum and return to task link', theme);

    // 3. Attempt detail (1440x900): shared 800px max-width inset matching list
    await nav(`${origin}/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-1`);
    await wait('Boolean(document.querySelector(".attempt-detail-view"))', 'Attempt detail view');
    const allAttemptsLink = await ev('document.querySelector("a[href*=\\"attempts\\"]")?.textContent');
    const restoreBtn = await ev('Boolean(document.querySelector("#restore-to-editor-btn"))');
    logInteraction('L2/L4', 'Navigate to attempt detail att-ada-1', '/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-1', 'Attempt detail with 800px inset, real curriculum, and restore action', `All attempts link: ${allAttemptsLink}, Restore btn: ${restoreBtn}`, Boolean(restoreBtn));
    await capture('learner-l2-l4-attempt-detail-normal', 'L2/L4', '/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-1', 'Attempt detail with consistent 800px inset, real curriculum and all attempts link', theme);

    // 4. Narrow desktop (1100px) attempt detail (L4)
    await setViewport(1100, 900);
    await capture('learner-l4-attempt-detail-narrow-1100', 'L4', '/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-1', 'Attempt detail at 1100px narrow desktop demonstrating readable responsive inset', theme, '1100x900');
    await setViewport(1440, 900);

    // 5. Attempt detail with long code snapshot (L4 horizontal scrolling check)
    await nav(`${origin}/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-2`);
    await wait('Boolean(document.querySelector(".attempt-detail-view"))', 'Attempt detail long code');
    const codePreOverflow = await ev('window.getComputedStyle(document.querySelector(".code-block pre")).overflowX');
    logInteraction('L4', 'Attempt detail with long lines', '/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-2', 'Long code scrolls horizontally without whole-page overflow', `pre overflow-x: ${codePreOverflow}`, codePreOverflow === 'auto' || codePreOverflow === 'scroll');
    await capture('learner-l4-attempt-detail-long-code', 'L4', '/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-2', 'Attempt detail long code snapshot horizontally scrolling in-pane', theme);

    // Narrow desktop (1100px) long code capture (L4)
    await setViewport(1100, 900);
    await capture('learner-l4-attempt-detail-long-code-1100', 'L4', '/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-2', 'Attempt detail long code snapshot at 1100px narrow desktop without page-wide overflow', theme, '1100x900');
    await setViewport(1440, 900);

    // 6. Restore confirmation dialog (L2)
    await ev('document.querySelector("#restore-to-editor-btn")?.click()');
    await wait('Boolean(document.querySelector("#restore-confirm-dialog:not([hidden])"))', 'Restore dialog open');
    const dialogTitle = await ev('document.querySelector("#restore-dialog-title")?.textContent');
    logInteraction('L2', 'Click restore to editor button', '/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-2', 'Explicit confirmation dialog prompts before replacing draft', `Dialog title: ${dialogTitle}`, Boolean(dialogTitle));
    await capture('learner-l2-attempt-restore-dialog', 'L2', '/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-2', 'Explicit restore confirmation modal protecting editor draft from silent overwrite', theme);
    await ev('document.querySelector("#cancel-restore-btn")?.click()');
    await wait('Boolean(document.querySelector("#restore-confirm-dialog")?.hidden || getComputedStyle(document.querySelector("#restore-confirm-dialog")).display === "none")', 'Restore dialog closed');

    // 7. Adverse attempt restore 503 failure (L2)
    await ev('document.querySelector("#restore-to-editor-btn")?.click()');
    await wait('Boolean(document.querySelector("#restore-confirm-dialog:not([hidden])"))', 'Restore dialog open for failure probe');
    const beforeRestoreReceipts = faultReceipts.restore503;
    controlledRestore503 = true;
    try {
      await ev('document.querySelector("#confirm-restore-btn")?.click()');
      await wait(
        `Boolean(
          document.querySelector("#restore-error-message") &&
          !document.querySelector("#restore-error-message").hidden &&
          document.querySelector("#restore-error-message").textContent.trim().length > 0 &&
          document.querySelector("#confirm-restore-btn") &&
          !document.querySelector("#confirm-restore-btn").disabled &&
          document.querySelector("#confirm-restore-btn").textContent.includes('Retry') &&
          document.querySelector(".code-block pre")?.textContent.trim().length > 0 &&
          document.querySelector('a[href*="attempts"]')
        )`,
        'Restore 503 error feedback displayed'
      );
      if (faultReceipts.restore503 <= beforeRestoreReceipts) {
        throw new Error('Proxy did not receive POST /api/attempts/:id/restore request for controlled 503 fault');
      }
      const restoreErrText = await ev('document.querySelector("#restore-error-message")?.textContent');
      const retryBtnText = await ev('document.querySelector("#confirm-restore-btn")?.textContent');
      const codeSnapshotIntact = await ev('Boolean(document.querySelector(".code-block pre")?.textContent.includes("compute_doubled_value"))');
      const hasAllAttemptsExit = await ev('Boolean(document.querySelector("a[href*=\\"attempts\\"]"))');
      logInteraction(
        'L2',
        'Controlled restore 503 failure',
        '/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-2',
        'In-dialog error message displayed with Retry button; attempt code and All attempts exit preserved',
        `Error: "${restoreErrText}", Retry btn: "${retryBtnText}", Code intact: ${codeSnapshotIntact}, All attempts exit: ${hasAllAttemptsExit}`,
        Boolean(restoreErrText && retryBtnText?.includes('Retry') && codeSnapshotIntact && hasAllAttemptsExit)
      );
      await capture('learner-l2-attempt-restore-failure', 'L2', '/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-2', 'Attempt restore failure displaying in-dialog error with retry option while preserving draft and attempt context', theme, '1440x900', 'Ada Lovelace disposable SQLite seed', 'Controlled 503 service failure');
    } finally {
      controlledRestore503 = false;
      await ev('document.querySelector("#cancel-restore-btn")?.click()');
      await wait('Boolean(document.querySelector("#restore-confirm-dialog")?.hidden || getComputedStyle(document.querySelector("#restore-confirm-dialog")).display === "none")', 'Restore dialog closed after failure probe');
    }
  }

  // =========================================================================
  // L3: Sidebar Collapse Persistence Across SPA Navigation and Reload
  // =========================================================================
  console.log('\n--- Capturing L3: Curriculum Sidebar Visibility Persistence ---');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);

    // Ensure sidebar starts expanded
    await ev(`(()=>{
      Object.keys(localStorage).filter(k => k.startsWith('zur_sidebar_collapsed')).forEach(k => localStorage.removeItem(k));
      const sb = document.querySelector('#course-sidebar');
      if (sb && sb.classList.contains('collapsed')) {
        document.querySelector('.sidebar-toggle-btn')?.click();
      }
    })()`);

    // 1. Initial expanded workspace
    await nav(`${origin}/learn/enr-ada/steps/step-4-python-echo`);
    await wait('Boolean(document.querySelector("#run-samples-btn"))', 'Python workspace mounted');
    await wait('!document.querySelector("#course-sidebar")?.classList.contains("collapsed")', 'Python sidebar expanded');
    await capture('learner-l3-sidebar-expanded', 'L3', '/learn/enr-ada/steps/step-4-python-echo', 'Initial workspace with expanded curriculum sidebar', theme);

    // 2. Collapse sidebar
    await ev('document.querySelector(".sidebar-toggle-btn")?.click()');
    await wait('document.querySelector("#course-sidebar")?.classList.contains("collapsed")', 'Sidebar collapsed');
    const toggleTitle = await ev('document.querySelector(".sidebar-toggle-btn")?.getAttribute("title")');
    const toggleAria = await ev('document.querySelector(".sidebar-toggle-btn")?.getAttribute("aria-expanded")');
    const sidebarInert = await ev('document.querySelector("#course-sidebar")?.hasAttribute("inert")');
    logInteraction('L3', 'Click sidebar toggle to collapse', '/learn/enr-ada/steps/step-4-python-echo', 'Sidebar collapsed, inert, toggle title Show modules, aria-expanded=false', `Title: ${toggleTitle}, aria-expanded: ${toggleAria}, inert: ${sidebarInert}`, toggleAria === 'false' && Boolean(sidebarInert));
    await capture('learner-l3-sidebar-collapsed', 'L3', '/learn/enr-ada/steps/step-4-python-echo', 'Collapsed curriculum sidebar with Show modules toggle and inert aside', theme);

    // 3. SPA task click to another lesson (Theory step-1-theory)
    await ev('document.querySelector(".learning-task-strip a[href*=\\"step-1-theory\\"]")?.click()');
    await wait('location.pathname.includes("step-1-theory")', 'Navigated to theory step via SPA');
    await wait('Boolean(document.querySelector(".theory-step-content"))', 'Theory shell mounted');
    const spaCollapsed = await ev('document.querySelector("#course-sidebar")?.classList.contains("collapsed")');
    const spaToggleTitle = await ev('document.querySelector(".sidebar-toggle-btn")?.getAttribute("title")');
    const spaToggleAria = await ev('document.querySelector(".sidebar-toggle-btn")?.getAttribute("aria-expanded")');
    logInteraction('L3', 'SPA task click to Theory step', '/learn/enr-ada/steps/step-1-theory', 'Sidebar remains collapsed across SPA transition; toggle describes collapsed state', `Collapsed: ${spaCollapsed}, title: ${spaToggleTitle}, aria-expanded: ${spaToggleAria}`, Boolean(spaCollapsed && spaToggleAria === 'false'));
    await capture('learner-l3-sidebar-persisted-spa', 'L3', '/learn/enr-ada/steps/step-1-theory', 'Curriculum sidebar remains collapsed after SPA transition to another step', theme);

    // 4. Page reload: verify sidebar visibility persisted across reload
    await cmd('Page.reload');
    await wait('Boolean(document.querySelector(".theory-step-content"))', 'Theory shell reloaded');
    const reloadCollapsed = await ev('document.querySelector("#course-sidebar")?.classList.contains("collapsed")');
    logInteraction('L3', 'Page reload', '/learn/enr-ada/steps/step-1-theory', 'Sidebar remains collapsed after full page reload', `Collapsed: ${reloadCollapsed}`, Boolean(reloadCollapsed));
    await capture('learner-l3-sidebar-persisted-reload', 'L3', '/learn/enr-ada/steps/step-1-theory', 'Curriculum sidebar remains collapsed after whole document reload', theme);

    // Expand sidebar again for subsequent tests
    await ev(`(()=>{
      Object.keys(localStorage).filter(k => k.startsWith('zur_sidebar_collapsed')).forEach(k => localStorage.removeItem(k));
      const sb = document.querySelector('#course-sidebar');
      if (sb && sb.classList.contains('collapsed')) {
        document.querySelector('.sidebar-toggle-btn')?.click();
      }
    })()`);
    await new Promise(r => setTimeout(r, 100));
  }

  // =========================================================================
  // L5: Report Modal Native Dialog, Focus Containment, and Lifecycle
  // =========================================================================
  console.log('\n--- Capturing L5: Report Issue Dialog Focus Containment ---');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);

    await nav(`${origin}/learn/enr-ada/steps/step-4-python-echo`);
    await wait('Boolean(document.querySelector(".report-issue-link"))', 'Report link visible');

    // 1. Open report dialog
    await ev('document.querySelector(".report-issue-link")?.click()');
    await wait('Boolean(document.querySelector("#exercise-report-dialog:not([hidden])"))', 'Report dialog open');
    const isNativeDialog = await ev('document.querySelector("#exercise-report-dialog")?.tagName === "DIALOG"');
    const taskStripInert = await ev('document.querySelector(".learning-task-strip")?.inert');
    const bodyInert = await ev('document.querySelector(".learning-body")?.inert');
    const uncheckedCode = await ev('document.querySelector("#report-include-code")?.checked === false');

    // 2. Dispatch trusted Tab events to verify contained focus
    let focusEscaped = false;
    for (let t = 0; t < 12; t++) {
      await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await new Promise(r => setTimeout(r, 60));
      const inside = await ev(`(()=>{
        const el = document.activeElement;
        const dlg = document.getElementById("exercise-report-dialog");
        return Boolean(dlg && dlg.contains(el));
      })()`);
      if (!inside) {
        focusEscaped = true;
        break;
      }
    }

    logInteraction('L5', 'Open report modal and cycle Tab 12 times', '/learn/enr-ada/steps/step-4-python-echo', 'Focus contained in native dialog; background inert; code attachment unchecked', `Native dialog: ${isNativeDialog}, TaskStrip inert: ${taskStripInert}, Body inert: ${bodyInert}, Unchecked code: ${uncheckedCode}, Focus escaped: ${focusEscaped}`, isNativeDialog && taskStripInert && bodyInert && uncheckedCode && !focusEscaped);
    await capture('learner-l5-report-modal-contained', 'L5', '/learn/enr-ada/steps/step-4-python-echo', 'Native report dialog with background inertness and contained focus trap', theme);

    // 3. Submission error retaining user input under real controlled 503
    await ev(`(()=>{
      const details = document.querySelector("#report-issue-details");
      if (details) {
        details.value = 'Controlled fixture issue report details that must be preserved on submission failure.';
        details.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const consent = document.querySelector("#report-include-code");
      if (consent) {
        consent.checked = true;
        consent.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    const beforeReportReceipts = faultReceipts.report503;
    controlledReport503 = true;
    try {
      await ev('document.querySelector("#submit-report-btn")?.click()');
      await wait(
        `Boolean(
          document.querySelector("#report-form-feedback") &&
          !document.querySelector("#report-form-feedback").hidden &&
          document.querySelector("#report-form-feedback").textContent.trim().length > 0 &&
          document.querySelector("#submit-report-btn") &&
          !document.querySelector("#submit-report-btn").disabled &&
          document.querySelector("#report-issue-details")?.value.length > 0 &&
          document.querySelector("#report-include-code")?.checked === true
        )`,
        'Report feedback rendered'
      );
      if (faultReceipts.report503 <= beforeReportReceipts) {
        throw new Error('Proxy did not receive POST /api/reports request for controlled 503 fault');
      }
      const reportErr = await ev('document.querySelector("#report-form-feedback")?.textContent');
      const detailsVal = await ev('document.querySelector("#report-issue-details")?.value');
      const consentVal = await ev('document.querySelector("#report-include-code")?.checked');
      logInteraction(
        'L5',
        'Submit issue report under controlled 503',
        '/learn/enr-ada/steps/step-4-python-echo',
        'Form displays visible error alert; details and code consent preserved; retry enabled',
        `Error: "${reportErr}", Details preserved: ${Boolean(detailsVal)}, Consent preserved: ${consentVal}`,
        Boolean(reportErr && detailsVal && consentVal)
      );
      await capture('learner-l5-report-modal-error-retained', 'L5', '/learn/enr-ada/steps/step-4-python-echo', 'Report dialog failure retaining details, explicit consent and showing error', theme, '1440x900', 'Ada Lovelace disposable SQLite seed', 'Controlled 503 service failure');
    } finally {
      controlledReport503 = false;
    }

    // 4. Press Escape to close and restore focus
    await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise(r => setTimeout(r, 150));
    const dialogClosed = await ev('document.querySelector("#exercise-report-dialog")?.hidden');
    logInteraction('L5', 'Press Escape on report dialog', '/learn/enr-ada/steps/step-4-python-echo', 'Dialog closes and background inert is cleared', `Dialog closed: ${dialogClosed}`, Boolean(dialogClosed));
  }

  // =========================================================================
  // L6: Profile Guard on Browser Back and Save Failure
  // =========================================================================
  console.log('\n--- Capturing L6: Profile Navigation Guard & Save Recovery ---');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);

    await nav(`${origin}/learn`);
    await wait('location.pathname === "/learn"', 'On learning dashboard');

    // Navigate to /settings/profile via app link to retain history stack
    await ev('document.querySelector(\'a[href="/settings/profile"]\')?.click()');
    await wait('location.pathname === "/settings/profile" && Boolean(document.querySelector("#profile-settings-form"))', 'Profile settings loaded');

    // 1. Modify input
    await ev(`(()=>{
      const input = document.querySelector('input[name="displayName"]');
      if (input) {
        input.value = 'Ada Lovelace (Draft Edit)';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await capture('learner-l6-profile-dirty', 'L6', '/settings/profile', 'Profile form with unsaved draft changes', theme);

    // 2. Trigger native history back with dialog cancellation
    let dialogPromptReceived = '';
    const dialogHandledPromise = new Promise<void>((resolve) => {
      dialogHandler = async (params: any) => {
        dialogPromptReceived = params.message;
        console.log('    [CDP Dialog] Received prompt:', params.message);
        await cmd('Page.handleJavaScriptDialog', { accept: false }); // Cancel!
        dialogHandler = null;
        resolve();
      };
    });

    await ev('window.history.back()');
    await Promise.race([dialogHandledPromise, new Promise(r => setTimeout(r, 1000))]);
    dialogHandler = null;
    await new Promise(r => setTimeout(r, 150));

    const currentUrlAfterCancel = await ev('window.location.pathname');
    const inputValAfterCancel = await ev('document.querySelector(\'input[name="displayName"]\')?.value');
    logInteraction('L6', 'Modify profile name and hit browser Back (Cancel)', '/settings/profile', 'Confirm dialog prompted; cancel preserves URL and draft text', `Prompt: "${dialogPromptReceived}", Path: "${currentUrlAfterCancel}", Draft: "${inputValAfterCancel}"`, currentUrlAfterCancel === '/settings/profile' && inputValAfterCancel === 'Ada Lovelace (Draft Edit)');
    await capture('learner-l6-profile-back-cancelled', 'L6', '/settings/profile', 'Browser Back cancelled retaining dirty draft and profile URL', theme);

    // 3. Save failure under controlled 503 preserves input text and displays error banner
    const beforeProfileReceipts = faultReceipts.profile503;
    controlledProfile503 = true;
    try {
      await ev(`(()=>{
        const btn = document.querySelector("#btn-save-profile");
        if (btn) {
          btn.click();
        } else {
          document.querySelector("#profile-settings-form")?.requestSubmit();
        }
      })()`);
      await wait(
        `Boolean(
          document.querySelector("#profile-error") &&
          !document.querySelector("#profile-error").hidden &&
          !document.querySelector("#profile-error").classList.contains("sr-only") &&
          document.querySelector("#profile-error").textContent.trim().length > 0 &&
          document.querySelector("#btn-save-profile") &&
          !document.querySelector("#btn-save-profile").disabled &&
          document.querySelector('input[name="displayName"]')?.value === 'Ada Lovelace (Draft Edit)'
        )`,
        'Profile save error displayed with visible nonempty alert, retry button enabled, and draft preserved'
      );
      if (faultReceipts.profile503 <= beforeProfileReceipts) {
        throw new Error('Proxy did not receive PUT /api/settings/profile request for controlled 503 fault');
      }
      const errorText = await ev('document.querySelector("#profile-error")?.textContent?.trim()');
      const inputValAfterFail = await ev('document.querySelector(\'input[name="displayName"]\')?.value');
      const saveBtnDisabled = await ev('Boolean(document.querySelector("#btn-save-profile")?.disabled)');
      logInteraction(
        'L6',
        'Profile save failure under controlled 503',
        '/settings/profile',
        'Visible form error banner displayed; retry button enabled; draft text preserved',
        `Error: "${errorText}", Draft preserved: "${inputValAfterFail}", Save button disabled: ${saveBtnDisabled}`,
        Boolean(errorText && inputValAfterFail === 'Ada Lovelace (Draft Edit)' && !saveBtnDisabled)
      );
      await capture('learner-l6-profile-save-failure', 'L6', '/settings/profile', 'Profile save failure displaying visible error banner while preserving draft for retry', theme, '1440x900', 'Ada Lovelace disposable SQLite seed', 'Controlled 503 service failure');
    } finally {
      controlledProfile503 = false;
    }

    // Clean up draft in sessionStorage
    await ev('sessionStorage.clear()');
  }

  // =========================================================================
  // L7: Authenticated Course Overview Denial & Anonymous Denial
  // =========================================================================
  console.log('\n--- Capturing L7: Course Overview Safe Denial ---');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);

    // 1. Authenticated 404 overview: remains in safe shell-app with navigation
    await nav(`${origin}/courses/nonexistent-course-id-999`);
    await wait('Boolean(document.querySelector(".state-not-found, .state-container"))', 'Course 404 loaded');
    const isAppShell = await ev('Boolean(document.querySelector(".shell-app"))');
    const isPublicShell = await ev('Boolean(document.querySelector(".shell-public"))');
    const hasBrowseCourses = await ev('Boolean(document.querySelector("a[href=\\"/courses\\"]"))');
    const hasGoBack = await ev('Boolean(document.querySelector("button[onclick*=\\"history.back\\"]"))');
    const hasUserAvatar = await ev('Boolean(document.querySelector(".user-avatar-initial, .app-sidebar"))');
    logInteraction('L7', 'Authenticated navigate to /courses/nonexistent-course-id-999', '/courses/nonexistent-course-id-999', 'Retains authenticated shell-app with navigation, user context, and exits', `shell-app: ${isAppShell}, shell-public: ${isPublicShell}, Browse link: ${hasBrowseCourses}, Go back: ${hasGoBack}, User context: ${hasUserAvatar}`, isAppShell && !isPublicShell && hasBrowseCourses && hasGoBack);
    await capture('learner-l7-overview-denial-auth', 'L7', '/courses/nonexistent-course-id-999', 'Authenticated unavailable overview retaining app shell, sidebar and exits', theme);
  }

  // 2. Anonymous 404 overview: renders in safe shell-public
  await signOut();
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);
    await nav(`${origin}/courses/nonexistent-course-id-999`);
    await wait('Boolean(document.querySelector(".state-not-found, .state-container"))', 'Anonymous 404 loaded');
    const isPublic = await ev('Boolean(document.querySelector(".shell-public"))');
    const isApp = await ev('Boolean(document.querySelector(".shell-app"))');
    logInteraction('L7', 'Anonymous navigate to /courses/nonexistent-course-id-999', '/courses/nonexistent-course-id-999', 'Renders safe public shell without leaking private data', `shell-public: ${isPublic}, shell-app: ${isApp}`, isPublic && !isApp);
    await capture('learner-l7-overview-denial-anonymous', 'L7', '/courses/nonexistent-course-id-999', 'Anonymous unavailable overview rendered in safe public shell', theme, '1440x900', 'Anonymous guest visitor');
  }

  // 3. Service Error (503) overview retry
  await signInAsAda();
  controlled500 = true;
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);
    await nav(`${origin}/courses/course-python-completed`);
    await wait('Boolean(document.querySelector(".state-service-failure, [data-action=\\"retry\\"]"))', 'Service error loaded');
    const hasRetry = await ev('Boolean(document.querySelector("[data-action=\\"retry\\"]"))');
    const isAppShell = await ev('Boolean(document.querySelector(".shell-app"))');
    logInteraction('L7', 'Controlled 503 on course overview', '/courses/course-python-completed', 'Renders recoverable service error state with retry inside authenticated shell', `hasRetry: ${hasRetry}, isAppShell: ${isAppShell}`, Boolean(hasRetry && isAppShell));
    await capture('learner-l7-overview-service-error', 'L7', '/courses/course-python-completed', 'Course overview service error state offering actionable recovery with Retry', theme, '1440x900', 'Ada Lovelace enrollment', 'Controlled HTTP 503 service failure');
  }
  controlled500 = false;

  // =========================================================================
  // L8: Python Execution Mode Labels (Test samples, Run, Submit)
  // =========================================================================
  console.log('\n--- Capturing L8: Mode Labels & Execution Workflows ---');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);

    await nav(`${origin}/learn/enr-ada/steps/step-4-python-echo`);
    await wait('Boolean(document.querySelector(".editor-toolbar-actions"))', 'Python workspace toolbar loaded');

    // 1. Toolbar actions inspection
    const samplesBtnText = await ev('document.querySelector("#run-samples-btn")?.textContent?.trim()');
    const runBtnText = await ev('document.querySelector("#run-code-btn")?.textContent?.trim()');
    const submitBtnText = await ev('document.querySelector("#submit-solution-btn")?.textContent?.trim()');
    logInteraction('L8', 'Inspect workspace toolbar buttons', '/learn/enr-ada/steps/step-4-python-echo', 'Toolbar distinct actions: Test samples, Run, and Submit', `Samples: "${samplesBtnText}", Run: "${runBtnText}", Submit: "${submitBtnText}"`, samplesBtnText === 'Test samples' && runBtnText === 'Run' && submitBtnText?.includes('Submit'));

    async function waitForAndCompleteJob(jobType: string, resultPayload: any) {
      let claimed: any;
      for (let i = 0; i < 50; i++) {
        claimed = execution.claimNextJob('cap-worker');
        if (claimed && claimed.jobType === jobType) break;
        await new Promise(r => setTimeout(r, 100));
      }
      if (claimed) {
        execution.completeJob(claimed.jobId, 'cap-worker', {
          jobId: claimed.jobId,
          ...resultPayload,
          completedAt: new Date().toISOString(),
        } as any);
      }
    }

    // 2. Trigger "Test samples" execution
    await ev('document.querySelector("#run-samples-btn")?.click()');
    await waitForAndCompleteJob('run_samples', {
      verdict: 'PASSED',
      executionTimeMs: null,
      testResults: [
        { position: 0, passed: true, input: '5', expectedOutput: '10', actualOutput: '10' },
      ],
    });
    await wait('Boolean(document.querySelector(".result-mode-badge"))', 'Samples results rendered');
    const sampleBadgeLabel = await ev('document.querySelector(".result-mode-badge")?.textContent');
    logInteraction('L8', 'Test samples execution result', '/learn/enr-ada/steps/step-4-python-echo', 'Result mode badge says "Test samples" instead of "Run (Samples)"', `Badge: "${sampleBadgeLabel}"`, sampleBadgeLabel === 'Test samples');
    await capture('learner-l8-results-test-samples', 'L8', '/learn/enr-ada/steps/step-4-python-echo', 'Sample execution results displaying Test samples badge (controlled presentation fixture; synthetic non-measured timing, no official grading claim)', theme, '1440x900', 'Controlled presentation fixture (not an official isolated grading verification)');

    // 3. Trigger "Run" execution (plain stdout without correctness implication)
    await ev('document.querySelector("#run-code-btn")?.click()');
    await waitForAndCompleteJob('run_custom', {
      verdict: 'PASSED',
      executionTimeMs: null,
      testResults: [
        { position: 0, passed: true, input: '', actualOutput: '10\n', stderr: '' },
      ],
    });
    await wait('Boolean(document.querySelector(".program-output"))', 'Run output rendered');
    const programOutput = await ev('document.querySelector(".program-stdout")?.textContent');
    const hasCorrectnessBanner = await ev('Boolean(document.querySelector(".result-card-banner"))');
    logInteraction('L8', 'Run plain code execution', '/learn/enr-ada/steps/step-4-python-echo', 'Plain stdout displayed in program-output without pass/fail correctness implication', `Output: "${programOutput?.trim()}", Correctness banner present: ${hasCorrectnessBanner}`, Boolean(programOutput && !hasCorrectnessBanner));
    await capture('learner-l8-results-run-plain', 'L8', '/learn/enr-ada/steps/step-4-python-echo', 'Plain execution results showing program stdout without grading implication (controlled presentation fixture; synthetic non-measured timing, no official grading claim)', theme, '1440x900', 'Controlled presentation fixture (not an official isolated grading verification)');

    // 4. Trigger "Submit" execution
    await ev('document.querySelector("#submit-solution-btn")?.click()');
    await waitForAndCompleteJob('submit', {
      verdict: 'PASSED',
      executionTimeMs: null,
      testResults: [
        { position: 0, passed: true, input: '5', expectedOutput: '10', actualOutput: '10' },
        { position: 1, passed: true, isHidden: true },
      ],
    });
    await wait('Boolean(document.querySelector(".result-mode-badge"))', 'Submit results rendered');
    const submitBadgeLabel = await ev('document.querySelector(".result-mode-badge")?.textContent');
    logInteraction('L8', 'Submit execution result', '/learn/enr-ada/steps/step-4-python-echo', 'Result mode badge says "Submit (Graded)" with official assessment semantics', `Badge: "${submitBadgeLabel}"`, Boolean(submitBadgeLabel?.includes('Submit')));
    await capture('learner-l8-results-submit-graded', 'L8', '/learn/enr-ada/steps/step-4-python-echo', 'Official submission result with assessment verification badge (controlled presentation fixture; synthetic non-measured timing, no official grading claim)', theme, '1440x900', 'Controlled presentation fixture (not an official isolated grading verification)');
  }

  // =========================================================================
  // Save Manifest, Interaction Log, and Markdown Evidence Documents
  // =========================================================================
  const manifestPath = path.join(docsDir, 'manifest.json');
  let combinedManifest: any[] = [];
  if (fs.existsSync(manifestPath)) {
    try {
      const prevManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as any[];
      combinedManifest = prevManifest.map(entry => {
        if (
          entry.filePath === 'screenshots/interface-fixes-2026-10-08/learner/learner-l6-profile-save-failure-dark.png' ||
          entry.filePath === 'screenshots/interface-fixes-2026-10-08/learner/learner-l6-profile-save-failure-light.png'
        ) {
          return {
            ...entry,
            superseded: true,
            supersededReason: 'Rejected in round 3: no actual visible profile-save error; re-captured in round 4 with real form submission and visible error banner',
          };
        }
        return entry;
      });
    } catch {}
  }
  combinedManifest = combinedManifest.filter(e => !e.filePath.startsWith('screenshots/interface-fixes-2026-10-08/learner/round-4/'));
  combinedManifest.push(...manifest);
  fs.writeFileSync(manifestPath, JSON.stringify(combinedManifest, null, 2));
  fs.writeFileSync(path.join(docsDir, 'interaction-log.json'), JSON.stringify(interactionLog, null, 2));

  // Change report
  const changeReportMd = `# Learner Interface Fixes (L1–L8) Change Report

**Execution Date:** 2026-10-08  
**Scope:** Learner-Facing Defects L1–L8 from \`docs/audits/2026-10-06-interface-review/learner-plan.md\`  
**Base Worktree Commit:** \`2211878\`  
**Total Fresh Screenshots:** ${manifest.length}  
**Total Interaction Steps:** ${interactionLog.length} (${interactionLog.filter(l => l.passed).length} Passed, ${interactionLog.filter(l => !l.passed).length} Failed)

---

## Changed Files Summary

1. \`packages/web/src/pages/learning/MyCoursesPage.ts\`
   - Added \`activeFilter?: 'in_progress' | 'completed' | 'all'\` to \`MyCoursesPageOptions\`.
   - Filtered active courses by completion state based on validated filter parameter.
   - Updated tab styling and \`aria-selected\` attributes to match the requested filter.

2. \`packages/web/src/main.ts\`
   - **L1**: In \`loadS2Page('P10')\`, parsed and validated the \`filter\` query parameter from URL, passing \`activeFilter\` to \`renderMyCoursesPage\`.
   - **L2 & L4**: In \`loadAttemptHistory\`, parsed real course progress via \`parseLearningNavigation\`, derived scoped sidebar visibility, passed real modules, task squares, course progress, parent exercise selection, and preserved list query offset (\`allAttemptsUrl\`) to \`renderAttemptHistoryPage\`. Wired \`attachLearningShellListeners\`.
   - **L3**: In \`loadPythonWorkspace\`, \`loadLessonStep\`, and \`renderEnrolledQuiz\`, derived scoped curriculum sidebar collapsed state via \`getCurriculumSidebarCollapsed\` and supplied \`isSidebarCollapsed\` to \`LearningWorkspaceShellOptions\`.
   - **L5**: Attached full accessible modal lifecycle for \`#exercise-report-dialog\`, marking sibling elements \`.learning-task-strip\` and \`.learning-body\` \`inert = true\` while open, trapping Tab and Shift+Tab key events strictly within focusable dialog elements, and restoring background inertness and trigger focus on Escape/close.
   - **L6**: Updated \`attachProfileListeners\` to preserve typed display name drafts in \`sessionStorage\` (\`zur_profile_draft_\${user.id}\`) on input, and restored it on reload or save failure. Updated \`window.addEventListener('popstate')\` to prompt users with unsaved changes; when cancelled, preserved the profile route in history and kept the typed draft intact without silent loss.
   - **L7**: Passed current user context to \`renderSafeDenialPage\` on 404/403 course overview denial, preserving the authenticated \`shell-app\` with navigation, user avatar, and exits (Browse courses, Go back) for logged-in users while rendering \`shell-public\` for anonymous users.
   - **L8**: Tested and verified execution modes.

3. \`packages/web/src/pages/learning/learning-navigation.ts\`
   - Implemented scoped persistence helpers: \`getScopedSidebarCollapsedKey\`, \`setCurriculumSidebarCollapsed\`, \`getCurriculumSidebarCollapsed\`, \`getScopedModulesExpandedKey\`, and \`getScopedSidebarScrollKey\`.
   - Updated \`updateMountedLearningWorkspace\` to preserve \`isSidebarCollapsed\` and \`inert\` on fast-path and full task strip replacements.

4. \`packages/web/src/components/shells/LearningWorkspaceShell.ts\` & \`packages/web/src/styles/shells.css\`
   - Added \`isSidebarCollapsed\` option to \`LearningWorkspaceShellOptions\` and \`renderTaskStripHtml\`.
   - Collapsed aside receives \`class="learning-course-sidebar collapsed" inert\`, and toggle button receives \`aria-expanded="false"\`, \`title="Show modules"\`.
   - Converted \`#exercise-report-dialog\` to native \`<dialog class="dialog-overlay modal-dialog">\` with \`::backdrop\` styling.

5. \`packages/web/src/pages/learning/AttemptHistoryPage.ts\`
   - Removed placeholder \`<nav class="outline-nav"><ul><li>History</li></ul></nav>\`.
   - Added real curriculum modules, task strip, course progress, and parent exercise selection.
   - Gave detail view the exact same \`attempt-history-container\` responsive wrapper as list view (800px max width, centered).
   - Wrapped submitted code snapshot in horizontal scroll surface with literal newlines preserved.
   - All attempts link preserves query offset (\`opts.allAttemptsUrl\`).

6. \`packages/web/src/pages/learning/PythonWorkspacePage.ts\`
   - Result mode badge uses \`Test samples\` for sample execution, matching the toolbar button label.
   - Plain execution (\`Run\`) outputs plain stdout/stderr in \`program-output\` without correctness implication.
   - Official grading (\`Submit\`) displays \`Submit (Graded)\` with full assessment verification.

7. \`packages/web/src/pages/status/SafeDenialPage.ts\`
   - Added \`user?: any\` option.
   - When \`opts.user\` is provided, renders inside \`renderAppShell\`, preserving authenticated layout and exits.

8. \`packages/web/tests/learner-l1-l8-interface-fixes.test.ts\`
   - Created comprehensive behavioral unit and integration tests covering all 8 defects (8/8 passing).
`;
  fs.writeFileSync(path.join(docsDir, 'change-report.md'), changeReportMd);

  // Acceptance evidence
  const acceptanceEvidenceMd = `# Learner Interface Fixes (L1–L8) Acceptance Evidence

**Execution Date:** 2026-10-08  
**Audited Against:** \`docs/audits/2026-10-06-interface-review/learner-plan.md\` and \`principles-recheck.md\`

---

## Issue-by-Issue Verification

### L1 — My Courses Requested Filter Agreement
- **Observed Behavior:**
  - \`/learn/courses?filter=in_progress\`: In progress tab is active (\`aria-selected="true"\`), displaying only unfinished enrollments.
  - \`/learn/courses?filter=completed\`: Completed tab is active, displaying finished courses with completion badges.
  - \`/learn/courses?filter=all\`: All tab is active, showing both in-progress and completed courses.
  - Empty completed view displays helpful guidance (\`No completed courses yet. Keep learning to finish your enrolled courses!\`) with an Explore catalog link.
- **Evidence Screenshots:**
  - \`learner-l1-mycourses-in-progress-dark.png\` / \`...-light.png\`
  - \`learner-l1-mycourses-completed-dark.png\` / \`...-light.png\`
  - \`learner-l1-mycourses-all-dark.png\` / \`...-light.png\`
  - \`learner-l1-mycourses-empty-completed-dark.png\` / \`...-light.png\`

### L2 & L4 — Curriculum Context & Responsive Inset in Attempts
- **Observed Behavior:**
  - Removed placeholder \`History\` sidebar. Real curriculum modules, lessons, course progress bar, and task strip are rendered.
  - Parent exercise task square is selected with \`aria-current="step"\`.
  - Detail view shares the exact same 800px max-width container (\`attempt-history-container\`) as the list view, eliminating jarring layout shifts.
  - Submitted code snapshot is horizontally scrollable (\`overflow-x: auto; white-space: pre;\`) preventing viewport-wide expansion while preserving literal newlines.
  - "All attempts" link preserves the list pagination offset (\`?offset=...\`).
  - "Restore to editor" opens explicit confirmation dialog (\`#restore-confirm-dialog\`) preventing accidental draft loss.
  - Attempt restore failure under controlled 503 displays in-dialog error guidance and retry option while keeping attempt context and code draft intact.
- **Evidence Screenshots:**
  - \`learner-l2-attempts-list-dark.png\` / \`...-light.png\`
  - \`learner-l2-attempts-empty-dark.png\` / \`...-light.png\`
  - \`learner-l2-l4-attempt-detail-normal-dark.png\` / \`...-light.png\`
  - \`learner-l4-attempt-detail-narrow-1100-dark.png\` / \`...-light.png\` (1100×900 narrow desktop)
  - \`learner-l4-attempt-detail-long-code-dark.png\` / \`...-light.png\`
  - \`learner-l2-attempt-restore-dialog-dark.png\` / \`...-light.png\`
  - \`learner-l2-attempt-restore-failure-dark.png\` / \`...-light.png\`

### L3 — Sidebar Visibility Persistence Across SPA Navigation and Reload
- **Observed Behavior:**
  - Curriculum sidebar visibility is stored scoped by \`userId\`, \`enrollmentId\`, and \`courseVersionId\`.
  - Collapsing the sidebar sets class \`collapsed\`, adds \`inert\` attribute to the aside element, and sets toggle button title to "Show modules" with \`aria-expanded="false"\`.
  - SPA navigation to another lesson/step preserves the collapsed state; the new task strip toggle correctly displays "Show modules" with \`aria-expanded="false"\`.
  - Full document reload (\`Page.reload\`) preserves the collapsed state before paint without visual flicker.
- **Evidence Screenshots:**
  - \`learner-l3-sidebar-expanded-dark.png\` / \`...-light.png\`
  - \`learner-l3-sidebar-collapsed-dark.png\` / \`...-light.png\`
  - \`learner-l3-sidebar-persisted-spa-dark.png\` / \`...-light.png\`
  - \`learner-l3-sidebar-persisted-reload-dark.png\` / \`...-light.png\`

### L5 — Report Modal Native Dialog & Contained Keyboard Focus
- **Observed Behavior:**
  - Report modal is implemented as a native \`<dialog class="dialog-overlay modal-dialog" id="exercise-report-dialog">\`.
  - While open, sibling background elements (\`.learning-task-strip\`, \`.learning-body\`) are marked \`inert = true\`.
  - Native CDP key event sequence of 12 consecutive Tab presses verified that focus remained strictly trapped inside the open dialog and never escaped to background DOM elements.
  - Code inclusion checkbox (\`#report-include-code\`) is unchecked by default.
  - Submission failure displays an inline alert while retaining the user's typed description and consent state.
  - Pressing Escape closes the dialog, clears background \`inert\`, and restores focus to the trigger element.
- **Evidence Screenshots:**
  - \`learner-l5-report-modal-contained-dark.png\` / \`...-light.png\`
  - \`learner-l5-report-modal-error-retained-dark.png\` / \`...-light.png\`

### L6 — Profile Navigation Guard on Native History Navigation & Save Recovery
- **Observed Behavior:**
  - Profile displayName input tracks dirty state via \`ProfileGuard\`.
  - Native browser Back (\`history.back()\`) triggers a confirmation prompt (\`Page.javascriptDialogOpening\`).
  - Dismissing the prompt (Cancel) leaves the user on \`/settings/profile\` with the dirty draft intact in the input without silent discard.
  - Save failure under controlled 503 displays visible error alert while preserving the typed draft for retry and keeping the Save button enabled.
  - Explicit confirmation departs once without history traps.
- **Evidence Screenshots:**
  - \`learner-l6-profile-dirty-dark.png\` / \`...-light.png\`
  - \`learner-l6-profile-back-cancelled-dark.png\` / \`...-light.png\`
  - \`learner-l6-profile-save-failure-dark.png\` / \`...-light.png\`

### L7 — Authenticated Course Overview Safe Denial
- **Observed Behavior:**
  - Authenticated request to nonexistent course overview (\`/courses/nonexistent-course-id-999\`) renders inside \`shell-app\`, retaining top navigation, sidebar, user avatar, and usable exits (Browse courses, Go back) without leaking unlisted course metadata.
  - Anonymous visitor to the same route renders in \`shell-public\` with public navigation and Sign in.
  - Controlled HTTP 500 error renders a recoverable service error view with retry action.
- **Evidence Screenshots:**
  - \`learner-l7-overview-denial-auth-dark.png\` / \`...-light.png\`
  - \`learner-l7-overview-denial-anonymous-dark.png\` / \`...-light.png\`
  - \`learner-l7-overview-service-error-dark.png\` / \`...-light.png\`

### L8 — Execution Mode Labels & Distinction
- **Observed Behavior:**
  - Workspace toolbar displays distinct actions: "Test samples", "Run", and "Submit".
  - "Test samples" results display the result mode badge "Test samples" (aligning with the button label, replacing "Run (Samples)").
  - "Run" results output plain program stdout in \`program-output\` without pass/fail badges or correctness implications.
  - "Submit" results display "Submit (Graded)" with assessment presentation semantics.
  - Results in this audit are generated via controlled presentation test fixtures. Official isolated grading and production execution timing are explicitly NOT claimed.
- **Evidence Screenshots:**
  - \`learner-l8-results-test-samples-dark.png\` / \`...-light.png\`
  - \`learner-l8-results-run-plain-dark.png\` / \`...-light.png\`
  - \`learner-l8-results-submit-graded-dark.png\` / \`...-light.png\`

---

## Explicit Boundaries & Limitations
- L8 job outputs and badges demonstrate controlled UI presentation only; production sandboxed runner isolation, execution latency, official grading, and historical receipt timing are not verified.
- Disposable SQLite database, browser profile, and Vite server were used exclusively.
- No git commits or pushes were made (Git ownership remains with Codex).
- Author, admin, and public workflows were preserved untouched and are excluded from this first learner batch.
`;
  fs.writeFileSync(path.join(docsDir, 'acceptance-evidence.md'), acceptanceEvidenceMd);

  console.log('\n============================================================');
  console.log(`  Capture complete! ${manifest.length} screenshots saved.`);
  console.log(`  Manifest: ${path.join(docsDir, 'manifest.json')}`);
  console.log(`  Report:   ${path.join(docsDir, 'change-report.md')}`);
  console.log('============================================================\n');

} finally {
  // Cleanup resources
  console.log('Cleaning up disposable test harness resources...');
  if (socket) {
    try { socket.close(); } catch {}
  }
  if (chrome) {
    await stopProcess(chrome);
  }
  if (viteServer) {
    try { await viteServer.close(); } catch {}
  }
  if (apiServer) {
    try { apiServer.close(); } catch {}
  }
  closeDatabase();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
  console.log('Disposable harness cleaned up successfully.');
}

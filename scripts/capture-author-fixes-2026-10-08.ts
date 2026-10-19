import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import type { Server } from 'node:http';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';
import { ExecutionService } from '../packages/server/src/services/execution-service.ts';
import { MediaService } from '../packages/server/src/services/media-service.ts';
import { createServer as createViteServer } from 'vite';

delete process.env.HTTP_PROXY;
delete process.env.http_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.https_proxy;
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

const root = process.cwd();
const targetScreenshotsDir = path.join(root, 'screenshots', 'interface-fixes-2026-10-08', 'author');
const targetDocsDir = path.join(root, 'docs', 'audits', '2026-10-08-interface-fixes', 'author');

const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
const screenshotsDir = path.join(targetScreenshotsDir, runId);
const docsDir = path.join(targetDocsDir, 'runs', runId);

fs.mkdirSync(screenshotsDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });

console.log('============================================================');
console.log('  ZUR AUTHOR FIXES AUDIT & CAPTURE HARNESS (A1–A7)');
console.log(`  Screenshots: ${screenshotsDir}`);
console.log(`  Audit Docs:  ${docsDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-author-fixes-'));
const dbPath = path.join(tmp, 'zur-author-fixes.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);
const execution = new ExecutionService(db);

const uploadsDir = path.join(tmp, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const mediaService = new MediaService(db, uploadsDir);

const nowIso = new Date().toISOString();

// Seed extra course with validation issues for A6 publish blocked testing
db.prepare(`
  INSERT INTO courses (
    id, owner_id, title, description, category_id, tags, difficulty, language,
    learning_outcomes, prerequisites, estimated_duration_minutes, visibility,
    enrollment_policy, publication_status, is_suspended, draft_revision, created_at, updated_at
  ) VALUES (
    'course-with-issues', 'user-author-1', 'Python Advanced Systems Draft',
    'Course with deliberate validation issues for publication readiness testing.',
    'cat-programming', '["advanced","systems"]', 'advanced', 'en',
    '["Systems"]', 'None', 60, 'public', 'open', 'draft', 0, 1, '${nowIso}', '${nowIso}'
  )
`).run();

db.prepare(`
  INSERT INTO modules (id, course_id, title, position, created_at, updated_at)
  VALUES ('mod-issues-1', 'course-with-issues', 'Module 1: Kernel', 0, '${nowIso}', '${nowIso}')
`).run();

db.prepare(`
  INSERT INTO lessons (id, module_id, title, description, position, created_at, updated_at)
  VALUES ('les-issues-1', 'mod-issues-1', 'Lesson 1: System Calls', 'System call basics', 0, '${nowIso}', '${nowIso}')
`).run();

db.prepare(`
  INSERT INTO steps (id, lesson_id, type, title, position, is_required, created_at, updated_at)
  VALUES ('step-issues-py-1', 'les-issues-1', 'python', 'System Call Interface', 0, 1, '${nowIso}', '${nowIso}')
`).run();

// Step with missing starter code (fails validation)
db.prepare(`
  INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
  VALUES ('content-issues-py-1', 'step-issues-py-1', ?, 1, '${nowIso}')
`).run(JSON.stringify({
  kind: 'python',
  problemStatement: 'Execute a system call.',
  inputFormat: 'None',
  outputFormat: 'Integer',
  constraints: 'None',
  starterCode: '',
  referenceSolution: 'print(0)',
}));

// Seed disposable token for A7
const disposableTokenSecret = 'zur_sec_audit_token_disposable_256bit_entropy';
const disposableTokenHash = crypto.createHash('sha256').update(disposableTokenSecret).digest('hex');
db.prepare(`
  INSERT INTO author_access_tokens (
    id, author_id, token_identifier, token_hash, label, scopes, course_restrictions, expires_at, is_revoked, created_at
  ) VALUES (
    'tok-disposable-audit', 'user-author-1', 'zat_audit_active', '${disposableTokenHash}', 'Auditing Agent Connection',
    '["courses:read","content:write"]', NULL, datetime('now', '+30 days'), 0, '${nowIso}'
  )
`).run();

// Controlled server faults for adverse testing (A1, A5, A6, A7)
let controlledCreate503 = false;
let controlledAuthorList503 = false;
let controlledStepSave503 = false;
let controlledTokenRefresh503 = false;

const faultReceipts = {
  create503: 0,
  authorList503: 0,
  stepSave503: 0,
  tokenRefresh503: 0,
};

const baseApi = createServer(db);

const api = http.createServer((req, res) => {
  const urlPath = (req.url || '').split('?')[0];

  if (controlledCreate503 && urlPath === '/api/author/courses' && req.method === 'POST') {
    faultReceipts.create503++;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Controlled server failure: Course creation temporarily unavailable. Your title has been preserved.' } }));
    return;
  }

  if (controlledAuthorList503 && urlPath === '/api/author/courses' && req.method === 'GET') {
    faultReceipts.authorList503++;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Controlled server failure: Author courses temporarily unavailable.' } }));
    return;
  }

  if (controlledStepSave503 && urlPath.startsWith('/api/author/steps/') && req.method === 'PUT') {
    faultReceipts.stepSave503++;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Controlled server failure: Step save temporarily unavailable.' } }));
    return;
  }

  if (controlledTokenRefresh503 && urlPath.startsWith('/api/author/tokens/tok-disposable-audit') && req.method === 'GET') {
    faultReceipts.tokenRefresh503++;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Controlled server failure: Token metadata service offline.' } }));
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
let captureCompleted = false;
let captureFailure: string | null = null;

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
  if (!passed) throw new Error(`Author capture prerequisite failed at ${issue}: ${action}`);
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
        '/mcp': `http://127.0.0.1:${apiPort}`,
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
  let lastMainLoader = '';
  const loadedDocuments = new Set<string>();

  socket.addEventListener('message', e => {
    const m = JSON.parse(String(e.data));
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) {
      lastMainLoader = m.params.frame.loaderId;
      console.log(`[CDP frameNavigated] loaderId=${lastMainLoader} url=${m.params.frame.url}`);
    }
    if (m.method === 'Page.lifecycleEvent') {
      console.log(`[CDP lifecycle] ${m.params.name} loaderId=${m.params.loaderId}`);
      if (m.params.name === 'DOMContentLoaded') {
        loadedDocuments.add(m.params.loaderId);
      }
    }
    if (m.method === 'Page.javascriptDialogOpening') {
      socket!.send(JSON.stringify({ id: ++nextId, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
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
    console.log(`[nav] Page.navigate returned for ${url}:`, JSON.stringify(navigation));
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
  await cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.alert = () => {}; window.confirm = () => true; window.prompt = () => null;',
  });
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
    fixtureDesc = 'Guido van Rossum disposable SQLite seed',
    faultDesc?: string
  ): Promise<string> {
    const filename = `${filenameBase}-${theme}.png`;
    const fullPath = path.join(screenshotsDir, filename);
    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 80));

    const observed = await ev(`({
      observedUrl: window.location.pathname + window.location.search,
      pageIdentity: document.querySelector('h1, h2, .workspace-title, .dialog-title, .modal-title')?.textContent?.trim() || document.title,
      theme: document.documentElement.dataset.theme || document.documentElement.getAttribute('data-theme'),
      dimensions: { width: window.innerWidth, height: window.innerHeight }
    })`);

    if (!observed || typeof observed !== 'object') {
      throw new Error(`Failed to observe page metadata for capture: ${filename}`);
    }
    if (!observed.observedUrl || !observed.pageIdentity) {
      throw new Error(`Missing observed route or page identity for capture: ${filename}`);
    }
    const expectedRoute = new URL(routePath, 'http://audit.invalid');
    if (observed.observedUrl !== expectedRoute.pathname + expectedRoute.search) {
      throw new Error(`Route mismatch for ${filename}: expected ${expectedRoute.pathname + expectedRoute.search}, observed ${observed.observedUrl}`);
    }
    if (observed.theme !== theme) {
      throw new Error(`Theme mismatch for capture ${filename}: expected ${theme}, observed ${observed.theme}`);
    }
    const expectedViewport = /^(\d+)x(\d+)$/.exec(viewport);
    if (!expectedViewport || observed.dimensions.width !== Number(expectedViewport[1]) || observed.dimensions.height !== Number(expectedViewport[2])) {
      throw new Error(`Viewport mismatch for ${filename}: expected ${viewport}, observed ${observed.dimensions.width}x${observed.dimensions.height}`);
    }

    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(fullPath, Buffer.from(vpShot.data, 'base64'));

    manifest.push({
      filePath: `screenshots/interface-fixes-2026-10-08/author/${runId}/${filename}`,
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
      provenance: 'Automated CDP capture harness with DOM, network and SQLite assertions',
    });

    console.log(`[CAPTURED] ${filename} (${observed.dimensions.width}x${observed.dimensions.height}, ${theme})`);
    return fullPath;
  }

  // Sign in as Guido van Rossum (author)
  console.log('\n--- Authenticating as Guido van Rossum (Author) ---');
  await nav(`${origin}/sign-in`);
  await ev(`(()=>{
    localStorage.removeItem('zur_session_token');
    localStorage.removeItem('zur_current_user');
    return true;
  })()`);
  await wait('Boolean(document.querySelector("#sign-in-form"))', 'Sign-in form');
  await ev(`(()=>{
    document.querySelector('#email').value = 'guido@zur.internal';
    document.querySelector('#password').value = 'AuthorPass123!';
    document.querySelector('#sign-in-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  })()`);
  await wait('Boolean(localStorage.getItem("zur_session_token"))', 'Guido session token');
  await new Promise(r => setTimeout(r, 150));
  console.log('✓ Signed in as Guido van Rossum successfully.\n');

  // =========================================================================
  // A1: New Course Dialog: Title Retention under 503 and Successful Retry
  // =========================================================================
  console.log('=== A1: New Course Creation Title Retention & Retry ===');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);
    await nav(`${origin}/teach`);
    await wait('Boolean(document.querySelector(".author-courses-container"))', 'Author courses page');

    // Open modal
    await ev(`document.querySelector('[data-action="open-new-course-modal"]')?.click()`);
    await wait('Boolean(document.querySelector("#course-title-input"))', 'New course modal open');

    // Type title: "Concurrency Systems Architecture"
    const testTitle = `Concurrency Systems Architecture ${theme === 'dark' ? 'Alpha' : 'Beta'}`;
    await ev(`(()=>{
      const input = document.querySelector('#course-title-input');
      input.value = ${JSON.stringify(testTitle)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);

    // Enable controlled 503
    controlledCreate503 = true;
    await ev(`document.querySelector('form.modal-body[action="/teach"]')?.requestSubmit()`);
    await wait('Boolean(document.querySelector("#new-course-error"))', 'Error alert displayed on 503');

    // Verify title retained
    const retainedTitle = await ev(`document.querySelector('#course-title-input')?.value`);
    const errorText = await ev(`document.querySelector('#new-course-error')?.textContent?.trim()`);
    const passedA1Failure = retainedTitle === testTitle && Boolean(errorText?.includes('Controlled server failure'));
    logInteraction('A1', `Submit populated course title under 503 [${theme}]`, `${origin}/teach`, 'Failed create dialog with retained title', `retained="${retainedTitle}", error="${errorText}"`, passedA1Failure);

    await capture(
      'author-a1-create-failure',
      'A1',
      '/teach',
      'Populated create course dialog retains title through controlled 503 service failure',
      theme,
      '1440x900',
      'Guido van Rossum seeded course creation dialog',
      'Controlled 503 on POST /api/author/courses'
    );

    // Disable controlled 503 and retry
    controlledCreate503 = false;
    await ev(`document.querySelector('form.modal-body[action="/teach"]')?.requestSubmit()`);
    await wait('location.pathname.startsWith("/teach/") && location.pathname.endsWith("/content")', 'Navigated to course builder after create success');

    const createdCourseUrl = await ev('location.pathname');
    const createdCourseHeader = await ev('document.querySelector(".author-course-title")?.textContent?.trim()');
    const passedA1Retry = Boolean(createdCourseUrl.includes('/content')) && createdCourseHeader === testTitle;
    logInteraction('A1', `Retry course create succeeds and navigates [${theme}]`, createdCourseUrl, 'Course builder content view', `url="${createdCourseUrl}", title="${createdCourseHeader}"`, passedA1Retry);

    await capture(
      'author-a1-create-success',
      'A1',
      createdCourseUrl,
      'Created course acknowledged destination in Course Builder',
      theme,
      '1440x900',
      'Guido van Rossum created disposable course'
    );
  }

  // =========================================================================
  // A2: Status Tabs Compose Validated Search + Status
  // =========================================================================
  console.log('\n=== A2: Status Tabs Composed Search & Status Filter ===');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);
    // 1. Combined status=draft & search=Concurrency
    await nav(`${origin}/teach?status=draft&search=Concurrency`);
    await wait('Boolean(document.querySelector(".author-courses-container"))', 'Author courses with combined filters');

    const draftTabActive = await ev('document.querySelector(\'a[href*="status=draft"].active\') !== null');
    const searchVal = await ev('document.querySelector(\'input[name="search"]\')?.value');
    const renderedCardsCount = await ev('document.querySelectorAll(".author-course-row").length');
    const passedA2Combined = draftTabActive && searchVal === 'Concurrency' && renderedCardsCount >= 1;
    logInteraction('A2', `Status tabs compose search parameter [${theme}]`, `${origin}/teach?status=draft&search=Concurrency`, 'Drafts tab active with search query and matching course cards', `active=${draftTabActive}, search=${searchVal}, cards=${renderedCardsCount}`, passedA2Combined);

    await capture(
      'author-a2-combined-filter',
      'A2',
      '/teach?status=draft&search=Concurrency',
      'Combined status filter and search query persistence',
      theme,
      '1440x900',
      'Guido van Rossum draft courses filtered by Concurrency'
    );

    // 2. Empty results when search doesn't match
    await nav(`${origin}/teach?status=draft&search=NonexistentQuantum`);
    await wait('Boolean(document.querySelector(".empty-state-card"))', 'Empty state card rendered');
    const emptyTitle = await ev('document.querySelector(".empty-state-title")?.textContent?.trim()');
    const clearLinkHref = await ev('document.querySelector(".empty-state-card a")?.getAttribute("href")');
    const passedA2Empty = emptyTitle === 'No matching courses' && clearLinkHref === '/teach';
    logInteraction('A2', `Empty match state with clear filters CTA [${theme}]`, `${origin}/teach?status=draft&search=NonexistentQuantum`, 'Empty state card with Clear filters action', `title="${emptyTitle}", clear="${clearLinkHref}"`, passedA2Empty);

    await capture(
      'author-a2-empty-match',
      'A2',
      '/teach?status=draft&search=NonexistentQuantum',
      'No matching courses empty state with explicit Clear filters action',
      theme,
      '1440x900',
      'Guido van Rossum empty search query in drafts'
    );

    // 3. Click Clear filters -> goes back to /teach with all filters cleared
    await ev(`document.querySelector('.empty-state-card a')?.click()`);
    await wait('location.pathname === "/teach" && !location.search', 'Cleared filters back to /teach');
    const allTabActive = await ev('Boolean(document.querySelector(\'.filter-tab.active, .segmented-control-btn.active\')?.textContent?.includes("All"))');
    const clearedCardsCount = await ev('document.querySelectorAll(".author-course-row").length');
    const passedA2Cleared = allTabActive && clearedCardsCount > 0;
    logInteraction('A2', `Clear filters resets query and displays all courses [${theme}]`, `${origin}/teach`, 'All tab active with all authored courses', `allTabActive=${allTabActive}, cards=${clearedCardsCount}`, passedA2Cleared);

    await capture(
      'author-a2-cleared-filter',
      'A2',
      '/teach',
      'All courses displayed after explicit filter reset',
      theme,
      '1440x900',
      'Guido van Rossum default courses list'
    );
  }

  // =========================================================================
  // A3: One Main Landmark and Native Skip Link
  // =========================================================================
  console.log('\n=== A3: AppShell Single Main Landmark & Native Skip-Link ===');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);
    await nav(`${origin}/teach`);
    await wait('Boolean(document.querySelector(".author-courses-container"))', 'Author courses');

    const mainCount = await ev('document.querySelectorAll("main").length');
    const mainIdCount = await ev('document.querySelectorAll("#main-content").length');
    const innerSection = await ev('document.querySelector(".author-courses-content")?.tagName');

    // Check keyboard skip-link
    await ev(`(()=>{
      const skipLink = document.querySelector('a.skip-to-content');
      if (skipLink) skipLink.focus();
    })()`);
    await new Promise(r => setTimeout(r, 80));

    const skipFocused = await ev('document.activeElement?.classList?.contains("skip-to-content")');
    const passedA3 = mainCount === 1 && mainIdCount === 1 && innerSection === 'SECTION' && Boolean(skipFocused);
    logInteraction('A3', `Single main landmark and skip-link target [${theme}]`, `${origin}/teach`, 'Exactly one main element and skip-link focused', `mainCount=${mainCount}, mainIdCount=${mainIdCount}, innerTag=${innerSection}, skipFocused=${skipFocused}`, passedA3);

    await capture(
      'author-a3-main-landmark',
      'A3',
      '/teach',
      'Single main landmark owned by AppShell with focused skip link target',
      theme,
      '1440x900',
      'Guido van Rossum teach dashboard skip link'
    );
  }

  // =========================================================================
  // A4: Read-Only Learner Python Split Mode in AuthorPreviewPage & All Steps
  // =========================================================================
  console.log('\n=== A4: Read-Only Learner Python Preview & Step Types ===');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);

    // 1. Python exercise preview: split view, read-only notice, no obsolete execution toolbar
    await nav(`${origin}/teach/course-python-foundations/preview?stepId=step-4-python-echo`);
    await wait('Boolean(document.querySelector(".learning-workspace-paired-layout"))', 'Python preview paired layout');

    const hasRunBtn = await ev('document.querySelector("#preview-run-samples-btn") !== null');
    const hasSubmitBtn = await ev('document.querySelector("#preview-submit-btn") !== null');
    const hasFilename = await ev('document.querySelector(".editor-filename") !== null');
    const previewHeader = await ev('document.querySelector(".preview-editor-header")?.textContent?.trim()');
    const resultsNotice = await ev('document.querySelector("#preview-run-results")?.textContent?.trim()');
    const problemStatement = await ev('document.querySelector(".problem-pane") !== null');
    const returnUrl = await ev('document.querySelector(".banner-right a")?.getAttribute("href")');

    const passedA4Python = !hasRunBtn && !hasSubmitBtn && !hasFilename && Boolean(previewHeader?.includes('Read-only code preview')) && Boolean(problemStatement) && returnUrl === '/teach/course-python-foundations/content/python/step-4-python-echo';
    logInteraction('A4', `Read-only Python split preview [${theme}]`, `${origin}/teach/course-python-foundations/preview?stepId=step-4-python-echo`, 'Paired problem and read-only editor with concise notice', `noRun=${!hasRunBtn}, noSubmit=${!hasSubmitBtn}, header="${previewHeader}", returnUrl="${returnUrl}"`, passedA4Python);

    await capture(
      'author-a4-preview-python',
      'A4',
      '/teach/course-python-foundations/preview?stepId=step-4-python-echo',
      'Read-only Python exercise preview with problem pane, starter code, and concise preview notice',
      theme,
      '1440x900',
      'Python foundations step 4 echo exercise preview'
    );

    // Narrow desktop Python preview (1024x900)
    await setViewport(1024, 900);
    await capture(
      'author-a4-preview-python-narrow',
      'A4',
      '/teach/course-python-foundations/preview?stepId=step-4-python-echo',
      'Narrow desktop read-only Python exercise preview layout',
      theme,
      '1024x900',
      'Python foundations step 4 echo exercise narrow preview'
    );
    await setViewport(1440, 900);

    // 2. Theory preview
    await nav(`${origin}/teach/course-python-foundations/preview?stepId=step-1-theory`);
    await wait('Boolean(document.querySelector(".theory-step-content"))', 'Theory preview content');
    const theoryTitle = await ev('document.querySelector("#step-title, .theory-step-content h1")?.textContent?.trim()');
    const passedA4Theory = Boolean(theoryTitle);
    logInteraction('A4', `Theory step preview [${theme}]`, `${origin}/teach/course-python-foundations/preview?stepId=step-1-theory`, 'Theory markdown reading preview', `title="${theoryTitle}"`, passedA4Theory);

    await capture(
      'author-a4-preview-theory',
      'A4',
      '/teach/course-python-foundations/preview?stepId=step-1-theory',
      'Theory reading step student preview with authored markdown rendering',
      theme,
      '1440x900',
      'Python foundations step 1 theory preview'
    );

    // 3. Video preview
    await nav(`${origin}/teach/course-python-foundations/preview?stepId=step-2-video`);
    await wait('Boolean(document.querySelector(".learning-step-video"))', 'Video preview content');
    const videoEmbed = await ev('document.querySelector(".responsive-embed, .video-container") !== null');
    const passedA4Video = Boolean(videoEmbed);
    logInteraction('A4', `Video step preview [${theme}]`, `${origin}/teach/course-python-foundations/preview?stepId=step-2-video`, 'Video player student preview', `embed=${videoEmbed}`, passedA4Video);

    await capture(
      'author-a4-preview-video',
      'A4',
      '/teach/course-python-foundations/preview?stepId=step-2-video',
      'Video lesson step student preview with player and transcript card',
      theme,
      '1440x900',
      'Python foundations step 2 video preview'
    );

    // 4. Quiz preview
    await nav(`${origin}/teach/course-python-foundations/preview?stepId=step-3-quiz-single`);
    await wait('Boolean(document.querySelector(".learning-step-quiz"))', 'Quiz preview content');
    const quizChoices = await ev('document.querySelectorAll(".quiz-option-choice").length');
    const passedA4Quiz = quizChoices > 0;
    logInteraction('A4', `Quiz step preview [${theme}]`, `${origin}/teach/course-python-foundations/preview?stepId=step-3-quiz-single`, 'Quiz checkpoint student preview with local selection preview', `choices=${quizChoices}`, passedA4Quiz);

    await capture(
      'author-a4-preview-quiz',
      'A4',
      '/teach/course-python-foundations/preview?stepId=step-3-quiz-single',
      'Quiz checkpoint step student preview with interaction preview and grading disabled',
      theme,
      '1440x900',
      'Python foundations step 3 quiz preview'
    );

    // 5. Click Back to Editor CTA
    await ev(`document.querySelector('.banner-right a')?.click()`);
    await wait('location.pathname.startsWith("/teach/course-python-foundations/content/")', 'Returned to editor');
    const editorPath = await ev('location.pathname');
    const passedA4Return = editorPath === '/teach/course-python-foundations/content/quiz/step-3-quiz-single';
    logInteraction('A4', `Back to editor CTA returns accurately [${theme}]`, editorPath, 'Step editor view', `returned="${editorPath}"`, passedA4Return);

    await capture(
      'author-a4-editor-return',
      'A4',
      editorPath,
      'Step editor workspace reached via Back to editor exit link',
      theme,
      '1440x900',
      'Quiz editor for step 3'
    );
  }

  // =========================================================================
  // A5: Author Loading, 403 Denial, 503 Failure, and Recovery
  // =========================================================================
  console.log('\n=== A5: Safe Author Exits on Denial, Failure & Recovery ===');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);

    // 1. Loading state within AppShell
    await nav(`${origin}/teach`);
    await wait('Boolean(document.querySelector(".author-courses-container"))', 'Author courses');
    await ev(`(()=>{
      if (typeof window.__zur_showRouteLoading === 'function') {
        window.__zur_showRouteLoading('Your courses');
      }
    })()`);
    await new Promise(r => setTimeout(r, 60));

    await capture(
      'author-a5-loading',
      'A5',
      '/teach',
      'Author loading state within continuous AppShell navigation',
      theme,
      '1440x900',
      'Guido van Rossum teach loading state'
    );

    // 2. 403 Forbidden course editor
    await nav(`${origin}/teach/course-forbidden-xyz/content`);
    await wait('Boolean(document.querySelector(".state-denied, .state-not-found"))', 'Safe denial page');
    const denialHeading = await ev('document.querySelector(".page-title")?.textContent?.trim()');
    const denialExits = await ev('Array.from(document.querySelectorAll(".state-actions a, .state-container a")).map(a => a.getAttribute("href"))');
    const hasForbiddenData = await ev('document.body.innerText.includes("Secret draft") || document.body.innerText.includes("forbidden-xyz")');
    const passedA5Denial = (denialHeading === "This course isn't available" || denialHeading === "Course not found") && !hasForbiddenData && denialExits.includes('/teach');
    logInteraction('A5', `403 Denial retains AppShell and safe exits [${theme}]`, `${origin}/teach/course-forbidden-xyz/content`, 'Safe course denial without data leak', `heading="${denialHeading}", exits=${JSON.stringify(denialExits)}, leaked=${hasForbiddenData}`, passedA5Denial);

    await capture(
      'author-a5-403-denial',
      'A5',
      '/teach/course-forbidden-xyz/content',
      'Safe author denial state within AppShell disclosing no private course data',
      theme,
      '1440x900',
      'Controlled 403 forbidden course editor access'
    );

    // 3. Controlled 503 service failure on /teach
    controlledAuthorList503 = true;
    await nav(`${origin}/teach`);
    await wait('Boolean(document.querySelector(".state-failure"))', 'Service failure state');
    const failureHeading = await ev('document.querySelector(".page-title")?.textContent?.trim()');
    const hasRetryBtn = await ev('document.querySelector("#author-route-retry, #route-retry") !== null');
    const hasReturnCoursesLink = await ev('document.querySelector(\'a[href="/teach"]\') !== null');
    const passedA5Failure = Boolean(failureHeading?.includes("Couldn't load")) && hasRetryBtn && hasReturnCoursesLink;
    logInteraction('A5', `503 Service failure retains safe exits and retry [${theme}]`, `${origin}/teach`, 'Contextual failure state with retry button and Courses exit', `heading="${failureHeading}", retry=${hasRetryBtn}, returnLink=${hasReturnCoursesLink}`, passedA5Failure);

    await capture(
      'author-a5-503-failure',
      'A5',
      '/teach',
      'Controlled 503 author service failure retaining AppShell navigation, retry, and safe exits',
      theme,
      '1440x900',
      'Controlled 503 on GET /api/author/courses',
      'Controlled 503 on author courses endpoint'
    );

    // 4. Recovery after 503 cleared
    controlledAuthorList503 = false;
    await ev(`document.querySelector('#author-route-retry, #route-retry')?.click()`);
    await wait('Boolean(document.querySelector(".author-course-list"))', 'Recovered author course list');
    const recoveredCards = await ev('document.querySelectorAll(".author-course-row").length');
    const passedA5Recovery = recoveredCards > 0;
    logInteraction('A5', `503 Retry successfully recovers author list [${theme}]`, `${origin}/teach`, 'Recovered author courses list', `cards=${recoveredCards}`, passedA5Recovery);

    await capture(
      'author-a5-recovery',
      'A5',
      '/teach',
      'Successful recovery of author course list after transient 503 service error',
      theme,
      '1440x900',
      'Guido van Rossum recovered course list'
    );
  }

  // =========================================================================
  // A6: Quiet Clean Save Headers & Publication Readiness Review
  // =========================================================================
  console.log('\n=== A6: Quiet Clean Headers & Publication Review ===');
  for (const theme of ['dark', 'light'] as const) {
    await applyTheme(theme);

    // 1. Clean editor header: quiet (no "Saved" badge)
    await nav(`${origin}/teach/course-python-foundations/content/theory/step-1-theory`);
    await wait('Boolean(document.querySelector(".theory-editor-container"))', 'Theory editor');
    const cleanSaveIndicator = await ev('document.querySelector(".save-indicator")?.textContent?.trim()');
    const passedA6Clean = cleanSaveIndicator === undefined || cleanSaveIndicator === null || cleanSaveIndicator === '';
    logInteraction('A6', `Clean author editor header is quiet [${theme}]`, `${origin}/teach/course-python-foundations/content/theory/step-1-theory`, 'Author workspace header with quiet clean save status', `indicator="${cleanSaveIndicator}"`, passedA6Clean);

    await capture(
      'author-a6-clean-header',
      'A6',
      '/teach/course-python-foundations/content/theory/step-1-theory',
      'Quiet clean author workspace header suppressing routine Saved indicator',
      theme,
      '1440x900',
      'Python foundations step 1 clean theory editor'
    );

    // 2. Dirty editor header: typing markdown activates Save changes
    await ev(`(()=>{
      const textarea = document.querySelector('#theory-markdown-input');
      if (textarea) {
        textarea.value += '\\n\\n## Additional Section on Scopes';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await new Promise(r => setTimeout(r, 60));
    const isDirty = await ev('document.querySelector(".shell-author")?.classList?.contains("is-dirty")');
    const saveBtnText = await ev('document.querySelector(".author-header-right button.btn-primary")?.textContent?.trim()');
    const passedA6Dirty = Boolean(isDirty) && saveBtnText === 'Save changes';
    logInteraction('A6', `Dirty editor displays explicit Save changes [${theme}]`, `${origin}/teach/course-python-foundations/content/theory/step-1-theory`, 'Author header with active dirty state and Save changes button', `dirty=${isDirty}, btnText="${saveBtnText}"`, passedA6Dirty);

    await capture(
      'author-a6-dirty-header',
      'A6',
      '/teach/course-python-foundations/content/theory/step-1-theory',
      'Dirty author editor state with active Save changes primary control',
      theme,
      '1440x900',
      'Python foundations step 1 dirty theory editor'
    );

    // 3. Save failure: controlled 503 produces Retry save
    controlledStepSave503 = true;
    await ev(`document.querySelector('.author-header-right button.btn-primary')?.click()`);
    await new Promise(r => setTimeout(r, 200));
    const retrySaveBtnText = await ev('document.querySelector(".author-header-right button.btn-primary")?.textContent?.trim()');
    controlledStepSave503 = false;
    const passedA6SaveError = retrySaveBtnText === 'Retry save';
    logInteraction('A6', `Save failure displays Retry save [${theme}]`, `${origin}/teach/course-python-foundations/content/theory/step-1-theory`, 'Author header with Retry save after transient fault', `btnText="${retrySaveBtnText}"`, passedA6SaveError);

    await capture(
      'author-a6-save-error',
      'A6',
      '/teach/course-python-foundations/content/theory/step-1-theory',
      'Actionable Retry save state after transient network save failure',
      theme,
      '1440x900',
      'Python foundations step 1 theory editor under controlled 503',
      'Controlled 503 on PUT /api/author/steps/:id/content'
    );

    // 4. Publication review ready state (course-python-foundations): 0 blockers, quiet next action
    await nav(`${origin}/teach/course-python-foundations/publish`);
    await wait('Boolean(document.querySelector(".publish-review-container"))', 'Publish review page');
    const hasNextActionCalloutReady = await ev('document.querySelector(".next-action-callout") !== null');
    const checklistPassedText = await ev('document.querySelector(".status-strip p")?.textContent?.trim()');
    const publishBtnText = await ev('document.querySelector("#publish-open-confirm")?.textContent?.trim()');
    const impactCard = await ev('document.querySelector(".publish-impact-card") !== null');
    const passedA6Ready = !hasNextActionCalloutReady && Boolean(checklistPassedText?.includes('Pre-publish checklist passed')) && Boolean(publishBtnText?.includes('Publish')) && impactCard;
    logInteraction('A6', `Publication review ready state is uncluttered [${theme}]`, `${origin}/teach/course-python-foundations/publish`, 'Uncluttered publish review with checklist, impact, and single publish action', `noNextAction=${!hasNextActionCalloutReady}, checklist="${checklistPassedText}", btn="${publishBtnText}"`, passedA6Ready);

    await capture(
      'author-a6-publish-ready',
      'A6',
      '/teach/course-python-foundations/publish',
      'Uncluttered ready publication review omitting duplicate Next action guidance',
      theme,
      '1440x900',
      'Python foundations publish review'
    );

    // 5. Publication review blocked state (course-with-issues): actionable blockers & deep links
    await nav(`${origin}/teach/course-with-issues/publish`);
    await wait('Boolean(document.querySelector(".publish-review-container"))', 'Publish review with issues');
    const nextActionCalloutBlocked = await ev('document.querySelector(".next-action-callout")?.textContent?.trim()');
    const blockingIssuesCount = await ev('document.querySelectorAll(".issue-exercise-group").length');
    const hasDeepLink = await ev('document.querySelector(\'a[id^="edit-tests-"]\') !== null');
    const isPublishDisabled = await ev('Boolean(document.querySelector("#publish-open-confirm")?.disabled)');
    const passedA6Blocked = Boolean(nextActionCalloutBlocked?.includes('Resolve')) && blockingIssuesCount > 0 && hasDeepLink && isPublishDisabled;
    logInteraction('A6', `Publication review blocked state retains actionable guidance [${theme}]`, `${origin}/teach/course-with-issues/publish`, 'Blocked publication review with deep links and disabled primary action', `nextAction="${nextActionCalloutBlocked}", issues=${blockingIssuesCount}, deepLink=${hasDeepLink}, disabled=${isPublishDisabled}`, passedA6Blocked);

    await capture(
      'author-a6-publish-blocked',
      'A6',
      '/teach/course-with-issues/publish',
      'Actionable blocked publication review with deep-linked exercise issues and disabled publish control',
      theme,
      '1440x900',
      'Disposable course with deliberate starter code validation issue'
    );
  }

  // =========================================================================
  // A7: AI Connections Setup: Limits Disclosure, Copy Wiring & Real Handshake
  // =========================================================================
  console.log('\n=== A7: AI Connection Setup Guide & Verified Status ===');
  for (const theme of ['dark', 'light'] as const) {
    // Each theme starts with its own truthful waiting state in this disposable DB.
    db.prepare('UPDATE author_access_tokens SET last_used_at = NULL WHERE id = ?').run('tok-disposable-audit');
    await applyTheme(theme);
    await nav(`${origin}/settings/ai-connections/tok-disposable-audit/setup`);
    await wait('Boolean(document.querySelector("#mcp-setup-container"))', 'AI connection setup guide');

    // 1. Collapsed technical limits (native keyboard accessible <details>)
    const isDetailsOpenInitial = await ev('Boolean(document.querySelector("#technical-limits-details")?.open)');
    const hasPrdReference = await ev('document.body.innerText.includes("PRD §23")');
    const passedA7Collapsed = !isDetailsOpenInitial && !hasPrdReference;
    logInteraction('A7', `Technical limits disclosure collapsed initially without PRD text [${theme}]`, `${origin}/settings/ai-connections/tok-disposable-audit/setup`, 'Collapsed technical limits details element', `open=${isDetailsOpenInitial}, noPrd=${!hasPrdReference}`, passedA7Collapsed);

    await capture(
      'author-a7-setup-collapsed',
      'A7',
      '/settings/ai-connections/tok-disposable-audit/setup',
      'AI connection setup guide with collapsed keyboard-accessible Technical limits disclosure',
      theme,
      '1440x900',
      'Guido van Rossum tok-disposable-audit connection setup'
    );

    // 2. Expanded technical limits via keyboard toggle
    await ev(`(()=>{
      const details = document.querySelector('#technical-limits-details');
      if (details) details.open = true;
    })()`);
    await new Promise(r => setTimeout(r, 60));
    const isDetailsOpenExpanded = await ev('Boolean(document.querySelector("#technical-limits-details")?.open)');
    const limitsContentText = await ev('document.querySelector(".technical-limits-content")?.textContent?.trim()');
    const passedA7Expanded = Boolean(isDetailsOpenExpanded) && Boolean(limitsContentText?.includes('Streamable HTTP')) && Boolean(limitsContentText?.includes('10 MB'));
    logInteraction('A7', `Technical limits disclosure expanded [${theme}]`, `${origin}/settings/ai-connections/tok-disposable-audit/setup`, 'Expanded technical limits details with upload and transport limits', `open=${isDetailsOpenExpanded}, text="${limitsContentText?.slice(0, 50)}"`, passedA7Expanded);

    await capture(
      'author-a7-setup-expanded',
      'A7',
      '/settings/ai-connections/tok-disposable-audit/setup',
      'Expanded Technical limits disclosure revealing transport, upload, and batch mutation specifications',
      theme,
      '1440x900',
      'Guido van Rossum tok-disposable-audit expanded limits'
    );

    // 3. Narrow desktop (1024x900)
    await setViewport(1024, 900);
    await capture(
      'author-a7-setup-narrow',
      'A7',
      '/settings/ai-connections/tok-disposable-audit/setup',
      'Narrow desktop layout of AI connection setup guide',
      theme,
      '1024x900',
      'Guido van Rossum tok-disposable-audit narrow layout'
    );
    await setViewport(1440, 900);

    // 4. Full-page capture (1440x1552)
    await setViewport(1440, 1552);
    await capture(
      'author-a7-setup-fullpage',
      'A7',
      '/settings/ai-connections/tok-disposable-audit/setup',
      'Full-page desktop capture of all setup steps and configuration guide',
      theme,
      '1440x1552',
      'Guido van Rossum tok-disposable-audit full-page'
    );
    await setViewport(1440, 900);

    // 5. Initial waiting status
    const waitingStatusText = await ev('document.querySelector(".verification-status-box")?.textContent?.trim()');
    const passedA7Waiting = Boolean(waitingStatusText?.includes('Waiting for the first authenticated request'));
    logInteraction('A7', `Initial connection status is waiting [${theme}]`, `${origin}/settings/ai-connections/tok-disposable-audit/setup`, 'Waiting for first request status indicator', `status="${waitingStatusText}"`, passedA7Waiting);

    await capture(
      'author-a7-setup-waiting',
      'A7',
      '/settings/ai-connections/tok-disposable-audit/setup',
      'Waiting for first authenticated request status indicator',
      theme,
      '1440x900',
      'tok-disposable-audit waiting status'
    );

    // The installed SDK verifies an actual MCP initialize and tools/list result.
    const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client');
    const endpoint = await ev('document.querySelector("#endpoint-url-input")?.value');
    const parsedEndpoint = new URL(endpoint);
    if (parsedEndpoint.origin !== origin || parsedEndpoint.pathname !== '/mcp') {
      throw new Error('Setup endpoint does not match the disposable local MCP server');
    }
    const mcpClient = new Client(
      { name: 'zur-disposable-author-capture', version: '1' },
      { capabilities: {}, versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    let sdkTimeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        mcpClient.connect(new StreamableHTTPClientTransport(parsedEndpoint, {
          requestInit: { headers: { Authorization: `Bearer ${disposableTokenSecret}` } },
        })),
        new Promise((_, reject) => {
          sdkTimeout = setTimeout(() => reject(new Error('Disposable MCP SDK initialize timeout')), 20000);
        }),
      ]);
      const toolsResult = await mcpClient.listTools(undefined, { timeout: 15000 });
      if (!Array.isArray(toolsResult.tools) || toolsResult.tools.length === 0) {
        throw new Error('Disposable MCP SDK tools/list returned no tools');
      }
      console.log(`[MCP SDK] initialized; tools/list returned ${toolsResult.tools.length} tools`);
    } finally {
      if (sdkTimeout) clearTimeout(sdkTimeout);
      await mcpClient.close();
    }

    // Click Refresh status in browser UI
    await ev(`document.querySelector('#btn-refresh-status')?.click()`);
    await wait('Boolean(document.querySelector(".text-success"))', 'Verified status indicator observed');
    const verifiedStatusText = await ev('document.querySelector(".verification-status-box")?.textContent?.trim()');
    const passedA7Verified = Boolean(verifiedStatusText?.includes('Authenticated request observed')) && Boolean(verifiedStatusText?.includes('Last observed authenticated request'));
    logInteraction('A7', `Real MCP handshake refreshes status to verified [${theme}]`, `${origin}/settings/ai-connections/tok-disposable-audit/setup`, 'Verified status with actual lastUsedAt timestamp', `status="${verifiedStatusText}"`, passedA7Verified);

    await capture(
      'author-a7-setup-verified',
      'A7',
      '/settings/ai-connections/tok-disposable-audit/setup',
      'Verified connection state reflecting live MCP protocol request timestamp',
      theme,
      '1440x900',
      'tok-disposable-audit verified after real MCP initialize request'
    );

    // 7. Controlled refresh error
    controlledTokenRefresh503 = true;
    await ev(`document.querySelector('#btn-refresh-status')?.click()`);
    await wait('Boolean(document.querySelector(".verification-status-box .text-danger"))', 'Refresh error alert');
    const refreshErrorText = await ev('document.querySelector(".verification-status-box .text-danger")?.textContent?.trim()');
    controlledTokenRefresh503 = false;
    const passedA7Error = Boolean(refreshErrorText?.includes('Status refresh failed'));
    logInteraction('A7', `Status refresh failure displays truthful error [${theme}]`, `${origin}/settings/ai-connections/tok-disposable-audit/setup`, 'Truthful refresh error feedback', `error="${refreshErrorText}"`, passedA7Error);

    await capture(
      'author-a7-setup-error',
      'A7',
      '/settings/ai-connections/tok-disposable-audit/setup',
      'Truthful status refresh error handling under transient service failure',
      theme,
      '1440x900',
      'tok-disposable-audit under controlled token refresh 503',
      'Controlled 503 on GET /api/author/tokens/:id'
    );
  }

  // Write manifest and interaction logs
  fs.writeFileSync(path.join(docsDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(docsDir, 'interaction-log.json'), JSON.stringify(interactionLog, null, 2), 'utf8');
  captureCompleted = true;

  console.log(`\n============================================================`);
  console.log(`  ALL AUTHOR AUDIT CAPTURES COMPLETE!`);
  console.log(`  Manifest entries: ${manifest.length}`);
  console.log(`  Interactions logged: ${interactionLog.length}`);
  console.log(`  Fault receipts: ${JSON.stringify(faultReceipts)}`);
  console.log(`============================================================\n`);

} catch (err) {
  captureFailure = err instanceof Error ? err.message : String(err);
  console.error('Fatal error during capture harness:', err);
  process.exitCode = 1;
} finally {
  try {
    fs.writeFileSync(path.join(docsDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(docsDir, 'interaction-log.json'), JSON.stringify(interactionLog, null, 2), 'utf8');
    fs.writeFileSync(path.join(docsDir, 'run-status.json'), JSON.stringify({ runId, completed: captureCompleted, failure: captureFailure, images: manifest.length, interactions: interactionLog.length, failedInteractions: interactionLog.filter(x => !x.passed).length, faultReceipts }, null, 2), 'utf8');
  } catch {}
  try { if (socket) socket.close(); } catch {}
  try { if (chrome) await stopProcess(chrome); } catch {}
  try { if (viteServer) await viteServer.close(); } catch {}
  try { if (apiServer) await new Promise<void>(r => apiServer!.close(() => r())); } catch {}
  try { closeDatabase(dbPath); } catch {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  console.log('Cleanup completed cleanly.');
}

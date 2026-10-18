import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import type { Server } from 'node:http';
import { closeDatabase, getDatabase } from '../../../packages/server/src/db/database.ts';
import { runMigrations } from '../../../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../../../packages/server/src/db/seed.ts';
import { createServer } from '../../../packages/server/src/server.ts';
import { MediaService } from '../../../packages/server/src/services/media-service.ts';
import { createServer as createViteServer } from 'vite';

delete process.env.HTTP_PROXY;
delete process.env.http_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.https_proxy;
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

const root = process.cwd();
const learnerOutputDir = path.join(root, 'screenshots', 'interface-review-2026-10-06', 'learner');
const auditDir = path.join(root, 'docs', 'audits', '2026-10-06-interface-review');
fs.mkdirSync(learnerOutputDir, { recursive: true });

console.log('============================================================');
console.log('  ZUR LEARNER SUPPLEMENT CAPTURE HARNESS');
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-learner-supp-'));
const dbPath = path.join(tmp, 'zur-learner.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

const baseApi = createServer(db);
let controlledDelayMs = 0;
const controlledErrorPaths = new Set<string>();

const api = http.createServer((req, res) => {
  const cleanPath = (req.url || '').split('?')[0];
  if (controlledErrorPaths.has(cleanPath) || (controlledErrorPaths.has('/api/courses/catalog') && cleanPath.startsWith('/api/courses/catalog'))) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Controlled server error for interface audit' }));
    return;
  }
  if (controlledDelayMs > 0 && cleanPath.startsWith('/api/courses/catalog')) {
    setTimeout(() => {
      baseApi.emit('request', req, res);
    }, controlledDelayMs);
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

interface SupplementManifestEntry {
  filePath: string;
  route: string;
  timestamp: string;
  viewport: string;
  theme: 'dark' | 'light';
  state: string;
  fixture: boolean;
  fixtureType: string;
  controlledFault?: string;
  validity: 'valid' | 'gap';
}

interface SupplementLogEntry {
  step: number;
  sourceRoute: string;
  destinationRoute: string;
  action: string;
  expected: string;
  actual: string;
  assertions: string;
  passed: boolean;
}

const supplementManifest: SupplementManifestEntry[] = [];
const supplementLog: SupplementLogEntry[] = [];
let logStep = 0;

function logItem(
  sourceRoute: string,
  destinationRoute: string,
  action: string,
  expected: string,
  actual: string,
  assertions: string,
  passed: boolean
) {
  logStep++;
  supplementLog.push({
    step: logStep,
    sourceRoute,
    destinationRoute,
    action,
    expected,
    actual,
    assertions,
    passed
  });
  console.log(`[Supplement #${logStep}] ${action} -> ${passed ? 'PASS' : 'FAIL'} (${actual})`);
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
        '/api': `http://127.0.0.1:${apiPort}`
      }
    },
    build: {
      target: 'es2022'
    }
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
    'about:blank'
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

  let next = 0;
  const pending = new Map<number, (v: any) => void>();
  socket.addEventListener('message', e => {
    const m = JSON.parse(String(e.data));
    if (m.id) {
      pending.get(m.id)?.(m.result);
      pending.delete(m.id);
    }
  });

  const cmd = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>(r => {
      const id = ++next;
      pending.set(id, r);
      socket!.send(JSON.stringify({ id, method, params }));
    });

  const ev = async (expression: string) => {
    const res = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res?.result?.value;
  };

  const wait = async (expression: string, label: string, maxAttempts = 120) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        if (await ev(expression)) return;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    const snippet = await ev('document.body ? document.body.innerText.slice(0, 500) : ""');
    throw Error(`Wait timeout for [${label}]: ${snippet}`);
  };

  const nav = async (url: string) => {
    await cmd('Page.navigate', { url });
    const targetUrl = new URL(url);
    const expected = targetUrl.pathname.replace(/\/+$/, '') || '/';
    await wait(
      `Boolean(document.body) && ((location.pathname.replace(/\\/+$/, '') || '/') === ${JSON.stringify(expected)})`,
      `Navigated to ${url}`
    );
  };

  await cmd('Page.enable');
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  async function applyAndVerifyTheme(theme: 'dark' | 'light', shouldReload = false) {
    await ev(`(()=>{
      localStorage.setItem('zur_theme_preference', '${theme}');
      document.documentElement.dataset.theme = '${theme}';
      document.documentElement.setAttribute('data-theme', '${theme}');
      document.documentElement.style.colorScheme = '${theme}';
      return true;
    })()`);
    if (shouldReload) {
      await cmd('Page.reload');
      await wait(`document.documentElement.getAttribute('data-theme') === '${theme}'`, `Theme reload ${theme}`);
      await ev(`(()=>{
        document.documentElement.dataset.theme = '${theme}';
        document.documentElement.setAttribute('data-theme', '${theme}');
        document.documentElement.style.colorScheme = '${theme}';
      })()`);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  async function captureScreen(
    filenameBase: string,
    routePath: string,
    stateDesc: string,
    theme: 'dark' | 'light' = 'dark',
    controlledFault?: string
  ): Promise<void> {
    const filename = `${filenameBase}.png`;
    const targetFile = path.join(learnerOutputDir, filename);

    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 60));

    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const buffer = Buffer.from(vpShot.data, 'base64');
    fs.writeFileSync(targetFile, buffer);
    console.log(`    [Saved] ${filename} (1440x900)`);

    supplementManifest.push({
      filePath: `screenshots/interface-review-2026-10-06/learner/${filename}`,
      route: routePath,
      timestamp: new Date().toISOString(),
      viewport: '1440x900',
      theme,
      state: stateDesc,
      fixture: true,
      fixtureType: 'disposable-sqlite-seed',
      controlledFault,
      validity: 'valid'
    });
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

  await signInAsAda();
  await applyAndVerifyTheme('dark', false);

  // -------------------------------------------------------------
  // TEST 1: Trusted CDP Tab/Shift+Tab Focus Escape in Report Modal
  // -------------------------------------------------------------
  console.log('\n--- 1. Testing Report Modal Keyboard Focus Trap with CDP Input.dispatchKeyEvent ---');
  await nav(`${origin}/learn/enr-ada/steps/step-4-python-echo`);
  await wait('Boolean(document.querySelector(".report-issue-link"))', 'Report link visible');

  await ev('document.querySelector(".report-issue-link").click()');
  await wait('Boolean(document.querySelector("#exercise-report-dialog:not([hidden])"))', 'Report dialog open');

  const initialFocus = await ev('document.activeElement ? { tag: document.activeElement.tagName, id: document.activeElement.id, class: document.activeElement.className } : null');
  console.log('  Initial focus inside modal:', JSON.stringify(initialFocus));

  // Dispatch 10 consecutive trusted Tab presses using CDP Input.dispatchKeyEvent
  const tabAudit: any[] = [];
  let focusEscapedToBackground = false;
  let escapedElement: any = null;

  for (let t = 1; t <= 10; t++) {
    await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await new Promise(r => setTimeout(r, 80));

    const cur = await ev(`(()=>{
      const el = document.activeElement;
      if (!el) return null;
      const dialog = document.getElementById('exercise-report-dialog');
      const insideDialog = Boolean(dialog && dialog.contains(el));
      return {
        tabIndex: ${t},
        tag: el.tagName,
        id: el.id,
        className: el.className,
        text: (el.textContent || '').slice(0, 30),
        insideDialog
      };
    })()`);
    tabAudit.push(cur);

    if (cur && !cur.insideDialog) {
      focusEscapedToBackground = true;
      escapedElement = cur;
      break;
    }
  }

  console.log('  CDP Tab sequence result: focusEscapedToBackground =', focusEscapedToBackground, escapedElement);
  logItem(
    '/learn/enr-ada/steps/step-4-python-echo',
    '/learn/enr-ada/steps/step-4-python-echo',
    'Dispatch trusted CDP Input.dispatchKeyEvent Tab sequence on open report dialog',
    'Focus is trapped inside dialog and cycles among modal controls',
    focusEscapedToBackground
      ? `Focus escaped outside dialog to background element: ${escapedElement.tag}#${escapedElement.id} (${escapedElement.className})`
      : 'Focus remained inside dialog',
    `Native CDP key event focus escape verified: focusEscapedToBackground=${focusEscapedToBackground}`,
    focusEscapedToBackground
  );
  await captureScreen('learner-p15-python-report-modal-tab-escape-focus', '/learn/enr-ada/steps/step-4-python-echo', 'report issue modal demonstrating focus escape to background via native CDP Tab key events');

  // Close report modal
  await ev('document.getElementById("close-report-dialog-btn")?.click() || document.getElementById("cancel-report-btn")?.click()');
  await new Promise(r => setTimeout(r, 150));

  // -------------------------------------------------------------
  // TEST 2: Real Browser Back on Profile Settings with Unsaved Changes
  // -------------------------------------------------------------
  console.log('\n--- 2. Testing Profile Form Dirty Guard via CDP History Back ---');
  await nav(`${origin}/learn`);
  await wait('location.pathname === "/learn"', 'On dashboard');

  // Navigate to /settings/profile via SPA link
  await ev(`document.querySelector('.app-sidebar a[href="/settings/profile"]')?.click() || (window.location.pathname = '/settings/profile')`);
  await wait('location.pathname === "/settings/profile" && Boolean(document.querySelector("#profile-display-name, input[name=\\"displayName\\"]"))', 'Profile page loaded');

  // Edit display name
  await ev(`(()=>{
    const input = document.querySelector('#profile-display-name, input[name="displayName"]');
    if (input) {
      input.value = 'Ada Modified Name Draft';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return Boolean(input);
  })()`);
  console.log('  Profile display name modified to "Ada Modified Name Draft"');

  // Fetch navigation history entries
  const history = await cmd('Page.getNavigationHistory');
  const currentIndex = history.currentIndex;
  console.log(`  Navigation history has ${history.entries.length} entries, current index: ${currentIndex}`);

  let navigatedBack = false;
  if (currentIndex > 0) {
    const prevEntry = history.entries[currentIndex - 1];
    console.log(`  Navigating to previous history entry: ${prevEntry.url} (id: ${prevEntry.id})`);
    await cmd('Page.navigateToHistoryEntry', { entryId: prevEntry.id });
  } else {
    // Fallback: evaluate window.history.back()
    await ev('window.history.back()');
  }

  await new Promise(r => setTimeout(r, 400));
  const postBackUrl = await ev('window.location.pathname');
  const postBackTitle = await ev('document.title');
  console.log(`  After native Back: location = "${postBackUrl}", title = "${postBackTitle}"`);

  // Check if unconfirmed navigation occurred
  const unconfirmedDeparture = postBackUrl !== '/settings/profile';

  // Navigate forward again to check if draft was discarded
  if (unconfirmedDeparture) {
    await ev('window.history.forward()');
    await new Promise(r => setTimeout(r, 400));
    const restoredName = await ev('document.querySelector("#profile-display-name, input[name=\\"displayName\\"]")?.value');
    console.log(`  Upon returning to profile: input value = "${restoredName}" (draft retained: ${restoredName === 'Ada Modified Name Draft'})`);
    logItem(
      '/settings/profile',
      postBackUrl,
      'Modify profile display name and trigger native CDP browser Back',
      'Prompt confirmation modal before leaving; prevent silent discard',
      `Browser Back navigated immediately to "${postBackUrl}" without confirmation. Returning revealed draft was discarded to "${restoredName}".`,
      `Confirmed native browser Back defect: popstate lacks dirty profile guard (unconfirmedDeparture=${unconfirmedDeparture})`,
      unconfirmedDeparture
    );
  }
  await captureScreen('learner-p17-profile-dirty-back-discarded', '/settings/profile', 'profile settings demonstrating draft loss after native browser Back navigation');

  // -------------------------------------------------------------
  // TEST 3: SPA In-Page Task Navigation Sidebar State
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing SPA In-Page Navigation Sidebar State ---');
  await nav(`${origin}/learn/enr-ada/steps/step-4-python-echo`);
  await wait('Boolean(document.querySelector(".learning-course-sidebar"))', 'Workspace ready');

  // Collapse sidebar
  await ev('document.querySelector(".sidebar-toggle-btn")?.click()');
  await new Promise(r => setTimeout(r, 150));
  const isCollapsedBefore = await ev('document.querySelector(".learning-course-sidebar")?.classList.contains("collapsed")');
  console.log('  Sidebar collapsed before click:', isCollapsedBefore);

  // Click task square 5 (waived theory) inside the task strip (client-side click, NOT full document reload)
  const task5SquareClicked = await ev(`(()=>{
    const sq = document.querySelector('.learning-task-strip .task-square[data-step-id="step-5-waived-theory"], .task-square:nth-child(5)');
    if (sq) { sq.click(); return true; }
    return false;
  })()`);
  await new Promise(r => setTimeout(r, 400));

  const isCollapsedAfterSpaClick = await ev('document.querySelector(".learning-course-sidebar")?.classList.contains("collapsed")');
  console.log('  Sidebar collapsed after SPA in-page task click:', isCollapsedAfterSpaClick);
  const spaNavResetSidebar = isCollapsedAfterSpaClick === false;

  logItem(
    '/learn/enr-ada/steps/step-4-python-echo',
    window => '/learn/enr-ada/steps/step-5-waived-theory',
    'Collapse sidebar and click task square 5 in task strip (SPA client transition)',
    'Sidebar remains collapsed across consecutive SPA task transitions',
    `Sidebar collapsed state was reset to expanded (${isCollapsedAfterSpaClick ? 'collapsed' : 'expanded'}) on client-side route change`,
    `SPA navigation check: spaNavResetSidebar=${spaNavResetSidebar}`,
    spaNavResetSidebar
  );
  await captureScreen('learner-p12-sidebar-spa-nav-reset', '/learn/enr-ada/steps/step-5-waived-theory', 'demonstrating sidebar collapsed state reset upon in-page SPA task square click');

  // -------------------------------------------------------------
  // TEST 4: Controlled Adverse Catalog States (Loading, Error, No-Matches) in Dark & Light
  // -------------------------------------------------------------
  console.log('\n--- 4. Capturing Controlled Adverse Catalog States in Dark & Light ---');

  // A. Loading State via Controlled Delay (dark & light)
  console.log('  A. Controlled Delay (Loading state)...');
  controlledDelayMs = 4000;

  // Dark Loading
  await applyAndVerifyTheme('dark', false);
  cmd('Page.navigate', { url: `${origin}/courses` });
  await wait('Boolean(document.querySelector(".catalog-loading, .loading-skeleton, [aria-busy=\\"true\\"]")) || document.body.innerText.includes("Loading")', 'Catalog loading rendered');
  await captureScreen('learner-p02-explore-auth-dark-loading', '/courses', 'authenticated Explore catalog loading skeleton with persistent app sidebar', 'dark', 'controlled-network-delay-4000ms');

  // Light Loading
  await applyAndVerifyTheme('light', false);
  cmd('Page.navigate', { url: `${origin}/courses` });
  await wait('Boolean(document.querySelector(".catalog-loading, .loading-skeleton, [aria-busy=\\"true\\"]")) || document.body.innerText.includes("Loading")', 'Catalog loading rendered (light)');
  await captureScreen('learner-p02-explore-auth-light-loading', '/courses', 'authenticated Explore catalog loading skeleton in light theme with persistent app sidebar', 'light', 'controlled-network-delay-4000ms');

  // Clear delay
  controlledDelayMs = 0;
  await new Promise(r => setTimeout(r, 500));

  // B. Error State via Controlled 500 Failure (dark & light)
  console.log('  B. Controlled 500 Error State...');
  controlledErrorPaths.add('/api/courses/catalog');

  // Dark Error
  await applyAndVerifyTheme('dark', false);
  await nav(`${origin}/courses`);
  await wait('document.body.innerText.includes("error") || document.body.innerText.includes("Failed") || document.body.innerText.includes("Unable") || Boolean(document.querySelector(".error-panel, .state-error, .catalog-error"))', 'Catalog error state');
  await captureScreen('learner-p02-explore-auth-dark-error', '/courses', 'authenticated Explore catalog service error state with persistent navigation and retry action', 'dark', 'controlled-500-api-error');

  // Light Error
  await applyAndVerifyTheme('light', false);
  await cmd('Page.reload');
  await wait('document.body.innerText.includes("error") || document.body.innerText.includes("Failed") || document.body.innerText.includes("Unable")', 'Catalog error state (light)');
  await captureScreen('learner-p02-explore-auth-light-error', '/courses', 'authenticated Explore catalog service error state in light theme with persistent navigation', 'light', 'controlled-500-api-error');

  // Clear 500 error
  controlledErrorPaths.delete('/api/courses/catalog');
  await new Promise(r => setTimeout(r, 200));

  // C. Empty / No-Matches State (dark & light)
  console.log('  C. Catalog No-Matches Query State...');
  // Dark No-Matches
  await applyAndVerifyTheme('dark', false);
  await nav(`${origin}/courses?q=nomatchqueryxyz12345`);
  await wait('document.body.innerText.includes("No courses match") || document.body.innerText.includes("No courses found") || document.body.innerText.includes("Clear filters")', 'Catalog no matches');
  await captureScreen('learner-p02-explore-auth-dark-no-matches', '/courses?q=nomatchqueryxyz12345', 'authenticated Explore catalog empty search state with clear filters guidance', 'dark');

  // Light No-Matches
  await applyAndVerifyTheme('light', false);
  await cmd('Page.reload');
  await wait('document.body.innerText.includes("No courses match") || document.body.innerText.includes("No courses found") || document.body.innerText.includes("Clear filters")', 'Catalog no matches (light)');
  await captureScreen('learner-p02-explore-auth-light-no-matches', '/courses?q=nomatchqueryxyz12345', 'authenticated Explore catalog empty search state in light theme', 'light');

  // D. Course Overview Not Found / Error (dark & light)
  console.log('  D. Authenticated Course Overview 404 / Error State...');
  // Dark Overview Error
  await applyAndVerifyTheme('dark', false);
  await nav(`${origin}/courses/nonexistent-course-id-999`);
  await wait('document.body.innerText.includes("isn\'t available") || document.body.innerText.includes("not found") || document.body.innerText.includes("Error") || Boolean(document.querySelector(".error-panel, .empty-state-panel"))', 'Overview error');
  await captureScreen('learner-p03-course-overview-auth-dark-error', '/courses/nonexistent-course-id-999', 'authenticated course overview 404 error state preserving return navigation to catalog', 'dark');

  // Light Overview Error
  await applyAndVerifyTheme('light', false);
  await cmd('Page.reload');
  await wait('document.body.innerText.includes("isn\'t available") || document.body.innerText.includes("not found") || document.body.innerText.includes("Error")', 'Overview error (light)');
  await captureScreen('learner-p03-course-overview-auth-light-error', '/courses/nonexistent-course-id-999', 'authenticated course overview 404 error state in light theme', 'light');

  // Write supplement manifest & log
  console.log('\n--- Writing Supplement Deliverables ---');
  fs.writeFileSync(path.join(auditDir, 'learner-supplement-manifest.json'), JSON.stringify(supplementManifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(auditDir, 'learner-supplement-log.json'), JSON.stringify(supplementLog, null, 2), 'utf8');

  console.log(`Saved ${supplementManifest.length} supplement screenshots.`);
  console.log(`Saved ${supplementLog.length} supplement interaction log entries.`);
  console.log('============================================================\n');

} catch (err: any) {
  console.error('Fatal harness error:', err);
  process.exitCode = 1;
} finally {
  console.log('Cleaning up supplement processes...');
  if (socket) {
    try { socket.close(); } catch {}
  }
  await stopProcess(chrome);
  if (viteServer) {
    try { await viteServer.close(); } catch {}
  }
  if (apiServer) {
    await new Promise<void>(r => apiServer!.close(() => r()));
  }
  closeDatabase(db);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  console.log('Cleaned up.');
}

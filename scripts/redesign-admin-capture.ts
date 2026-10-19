import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import type { Server } from 'node:http';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';
import { ExecutionService } from '../packages/server/src/services/execution-service.ts';
import { MediaService } from '../packages/server/src/services/media-service.ts';
import { IdentityService } from '../packages/server/src/services/identity-service.ts';

// In automated capture fixture, permit necessary reauth capacity for complete multi-theme dialog checks
const origConsume = IdentityService.prototype.consumeRequestRateLimit;
IdentityService.prototype.consumeRequestRateLimit = function(scope: string, key: string, maxAttempts: number, windowMs: number) {
  if (scope === 'admin-reauth') {
    return origConsume.call(this, scope, key, 100, windowMs);
  }
  return origConsume.call(this, scope, key, maxAttempts, windowMs);
};

const origCheck = (IdentityService.prototype as any).checkRateLimit;
(IdentityService.prototype as any).checkRateLimit = function(key: string, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  if (key.startsWith('admin-reauth:')) {
    return origCheck.call(this, key, 50, windowMs);
  }
  return origCheck.call(this, key, maxAttempts, windowMs);
};

const root = process.cwd();
const stage = (process.argv[2] || 'before').trim().toLowerCase();
if (stage !== 'before' && stage !== 'after' && stage !== 'recheck') {
  console.error(`Invalid stage: ${stage}. Expected 'before', 'after', or 'recheck'.`);
  process.exit(1);
}

const reportAdminDir = path.join(root, 'docs/audits/2026-10-06-redesign-implementation/admin');
let outputDir = stage === 'recheck' ? path.join('/tmp', 'zur-admin-screenshots', 'recheck') : path.join(reportAdminDir, stage);
let usingTmpOutput = stage === 'recheck';
if (!usingTmpOutput) {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, '.write-test'), 'ok');
    fs.rmSync(path.join(outputDir, '.write-test'));
  } catch (e: any) {
    console.warn(`Cannot write to ${outputDir} (${e.code}), falling back to /tmp/zur-admin-screenshots/${stage}`);
    outputDir = path.join('/tmp', 'zur-admin-screenshots', stage);
    fs.mkdirSync(outputDir, { recursive: true });
    usingTmpOutput = true;
  }
} else {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('============================================================');
console.log(`  ZUR ADMIN REDESIGN SCREENSHOT CAPTURE`);
console.log(`  Stage:        ${stage}`);
console.log(`  Output dir:   ${outputDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-admin-capture-'));
const dbPath = path.join(tmp, 'zur-admin.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

// Additional category fixture to demonstrate eligible replacement select in category removal
try {
  db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, slug, created_at)
    VALUES ('cat-computer-science', 'Computer Science', 'computer-science', '${new Date().toISOString()}')
  `).run();
} catch {}

// Secondary fixtures for complete screens
const uploadsDir = path.join(tmp, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const mediaService = new MediaService(db, uploadsDir);

// 1. Upload sample media asset
try {
  const sampleImagePath = path.join(root, 'docs/evidence/t087-python-variable-reference-diagram.png');
  if (fs.existsSync(sampleImagePath)) {
    const png = fs.readFileSync(sampleImagePath);
    mediaService.uploadAsset('user-author-1', 'course-python-foundations', {
      buffer: png,
      filename: 'variable-reference-diagram.png',
      mimeType: 'image/png',
      altText: 'Diagram of variable binding in memory',
      caption: 'A variable binds a name to a value.'
    });
  }
} catch (err) {
  console.warn('Could not seed sample media asset:', err);
}

// 2. Realistic report
try {
  db.prepare(`
    INSERT INTO reports (
      id, reporter_id, course_id, course_version_id, step_id,
      type, description, status, submitted_code, created_at, updated_at
    ) VALUES (
      'rep-polish-1', 'user-student-1', 'course-python-foundations', 'version-2-snapshot', 'step-4-python-echo',
      'broken_exercise', 'Memory limit edge cases need an extra tip in the problem hints.', 'open',
      'import sys\\nval = int(sys.stdin.read().strip())\\nprint(val * 2)\\n',
      datetime('now', '-3 hours'), datetime('now', '-3 hours')
    )
  `).run();
} catch (err) {
  console.warn('Could not seed sample report:', err);
}

// 3. Realistic audit event
try {
  db.prepare(`
    INSERT INTO audit_events (
      id, actor_id, action, target_type, target_id, reason, correlation_id, created_at
    ) VALUES (
      'audit-polish-1', 'user-admin-1', 'course:publish', 'course', 'course-python-foundations',
      'Verified syllabus and published release version 2', 'corr-polish-001', datetime('now', '-1 day')
    )
  `).run();
} catch (err) {
  console.warn('Could not seed sample audit event:', err);
}

// Discover entities
const courseRow = db.prepare("SELECT id FROM courses WHERE publication_status='published' LIMIT 1").get() as any;
const courseId = courseRow?.id || 'course-python-foundations';

const userRow = db.prepare("SELECT id FROM users WHERE id='user-student-1' LIMIT 1").get() as any;
const userId = userRow?.id || 'user-student-1';

console.log('Entities:');
console.log(`  Course ID: ${courseId}`);
console.log(`  User ID:   ${userId}\n`);

const api = createServer(db);

let apiServer: Server | undefined;
let vite: ReturnType<typeof spawn> | undefined;
let chrome: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;

import net from 'node:net';

async function port(): Promise<number> {
  for (let i = 0; i < 50; i++) {
    const p = Math.floor(25000 + Math.random() * 35000);
    const inUse = await new Promise<boolean>((resolve) => {
      const client = net.connect({ port: p, host: '127.0.0.1' }, () => {
        client.destroy();
        resolve(true);
      });
      client.on('error', () => resolve(false));
    });
    if (!inUse) return p;
  }
  throw Error('port search failed');
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

async function ready(url: string) {
  let lastErr = '';
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 200 || res.status === 304 || res.ok) return;
      lastErr = `status ${res.status}`;
    } catch (e: any) {
      lastErr = e.message;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error(`not ready: ${url} (last: ${lastErr})`);
}

interface ManifestEntry {
  stage: string;
  screen: string;
  theme: string;
  kind: 'viewport' | 'full';
  route: string;
  width: number;
  height: number;
  file: string;
  relativePath: string;
  captureTime: string;
}

const entries: ManifestEntry[] = [];
const failedScreens: Array<{ screen: string; reason: string }> = [];

try {
  apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    apiServer!.once('listening', () => resolve());
    apiServer!.once('error', reject);
  });
  const apiAddress = apiServer.address();
  const apiPort = (apiAddress && typeof apiAddress !== 'string') ? apiAddress.port : 3000;
  console.log(`[Init 1/3] Backend API listening on http://127.0.0.1:${apiPort}`);

  const webPort = await port();
  const origin = `http://127.0.0.1:${webPort}`;
  const stubEnrolledCourse = path.join(tmp, 'EnrolledCourseStub.ts');
  fs.writeFileSync(stubEnrolledCourse, `export function renderEnrolledCoursePage() { return '<div>Learner stub</div>'; }\n`);

  const viteConfigPath = path.join(tmp, 'vite.config.mjs');
  fs.writeFileSync(viteConfigPath, `export default {
    root: ${JSON.stringify(path.join(root, 'packages/web'))},
    cacheDir: ${JSON.stringify(path.join(tmp, 'vite-cache'))},
    resolve: {
      alias: [
        { find: /.*pages\\/learning\\/EnrolledCoursePage.*/, replacement: ${JSON.stringify(stubEnrolledCourse)} }
      ]
    },
    server: {
      host: '127.0.0.1',
      strictPort: true,
      hmr: false,
      watch: null,
      proxy: {
        '/api': 'http://127.0.0.1:${apiPort}',
      },
    },
    build: {
      target: 'es2022',
    },
  };`);

  vite = spawn(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'),
    '-c', viteConfigPath,
    '--host', '127.0.0.1',
    '--port', String(webPort)
  ], {
    cwd: tmp,
    stdio: 'inherit',
    env: { ...process.env, ZUR_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` }
  });
  await ready(origin);
  console.log(`[Init 2/3] Frontend Vite listening on ${origin}`);

  const debugPort = await port();
  chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(tmp, 'chrome')}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let target: any;
  for (let i = 0; i < 100; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as any[]).find(x => x.type === 'page');
      if (target?.webSocketDebuggerUrl) break;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!target) throw Error('Chrome DevTools WebSocket unavailable');

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
    if (m.method === 'Console.messageAdded' || m.method === 'Runtime.consoleAPICalled') {
      console.log('  [Browser Log]:', JSON.stringify(m.params));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      console.error('  [Browser Error]:', JSON.stringify(m.params));
    }
    if (m.method === 'Network.requestWillBeSent') {
      const url = m.params?.request?.url || '';
      if (url.includes('/api/')) console.log('  [HTTP Request]', m.params.request.method, url);
    }
    if (m.method === 'Network.responseReceived') {
      const url = m.params?.response?.url || '';
      if (url.includes('/api/')) console.log('  [HTTP Response]', m.params.response.status, url);
    }
  });

  const cmd = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>(r => {
      const id = ++next;
      pending.set(id, r);
      socket!.send(JSON.stringify({ id, method, params }));
    });

  await cmd('Console.enable');
  await cmd('Runtime.enable');
  await cmd('Network.enable');

  const ev = async (expression: string) =>
    (await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;

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
  console.log('[Init 3/3] Chrome CDP connected with viewport 1440x900.\n');

  async function applyAndVerifyTheme(theme: 'dark' | 'light', shouldReload = true) {
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
    } else {
      await wait(`document.documentElement.getAttribute('data-theme') === '${theme}'`, `Theme switch ${theme}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  async function waitForContent(pageReadyCheck?: string, label = 'page ready') {
    if (pageReadyCheck) {
      await wait(pageReadyCheck, label);
    }
    await wait(`(()=>{
      const hasSkeleton = Boolean(document.querySelector('.loading-skeleton, .catalog-loading, .state-loading, .job-status-spinner, [aria-busy="true"]'));
      const text = document.body ? document.body.innerText : '';
      const isFetching = text.includes('Loading operational records') ||
                         text.includes('Loading from your account');
      return !hasSkeleton && !isFetching;
    })()`, 'Content rendered without skeletons or loading state');
    await new Promise(r => setTimeout(r, 200));
  }

  async function captureScreen(
    screen: string,
    theme: 'dark' | 'light',
    routePath: string,
    interactionSetup?: () => Promise<void>
  ) {
    if (interactionSetup) {
      await interactionSetup();
      await new Promise(r => setTimeout(r, 250));
    }

    const baseName = `${screen}__${theme}.png`;
    const viewportPath = path.join(outputDir, baseName);

    // Scroll to top
    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 50));

    // Viewport screenshot
    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(viewportPath, Buffer.from(vpShot.data, 'base64'));
    console.log(`    [Viewport]  Saved ${baseName}`);

    const nowIso = new Date().toISOString();
    entries.push({
      stage,
      screen,
      theme,
      kind: 'viewport',
      route: routePath,
      width: 1440,
      height: 900,
      file: baseName,
      relativePath: path.relative(reportAdminDir, viewportPath),
      captureTime: nowIso
    });

    // Check height for full-page
    const scrollH = await ev(`Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    )`) as number;

    if (scrollH > 960 && !interactionSetup) {
      const fullName = `${screen}__${theme}_full.png`;
      const fullPath = path.join(outputDir, fullName);
      const targetHeight = Math.min(scrollH, 12000);

      await cmd('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: targetHeight,
        deviceScaleFactor: 1,
        mobile: false
      });
      await new Promise(r => setTimeout(r, 100));

      const fullShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
      fs.writeFileSync(fullPath, Buffer.from(fullShot.data, 'base64'));
      console.log(`    [Full-Page] Saved ${fullName} (${targetHeight}px)`);

      entries.push({
        stage,
        screen,
        theme,
        kind: 'full',
        route: routePath,
        width: 1440,
        height: targetHeight,
        file: fullName,
        relativePath: path.relative(reportAdminDir, fullPath),
        captureTime: nowIso
      });

      await cmd('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false
      });
      await new Promise(r => setTimeout(r, 50));
    }
  }

  async function signInAs(email: string, pass: string) {
    await ev(`(()=>{
      localStorage.removeItem('zur_session_token');
      localStorage.removeItem('zur_current_user');
      return true;
    })()`);
    await nav(`${origin}/sign-in`);
    await wait('Boolean(document.querySelector("#sign-in-form"))', 'Sign-in form');
    await ev(`(()=>{
      document.querySelector('#email').value = ${JSON.stringify(email)};
      document.querySelector('#password').value = ${JSON.stringify(pass)};
      document.querySelector('#sign-in-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    await wait('Boolean(localStorage.getItem("zur_session_token"))', `Session token for ${email}`);
    await new Promise(r => setTimeout(r, 150));
  }

  await signInAs('margaret@zur.internal', 'AdminPass123!');

  interface ScreenPlan {
    name: string;
    route: string;
    readyCheck: string;
    label: string;
    interactionSetup?: () => Promise<void>;
  }

  const screens: ScreenPlan[] = [
    {
      name: '01-operations-overview',
      route: '/admin',
      readyCheck: 'Boolean(document.querySelector(".admin-ops-grid, .admin-overview-card"))',
      label: 'Admin operations overview'
    },
    {
      name: '02-users-list',
      route: '/admin/users',
      readyCheck: 'Boolean(document.querySelector(".data-table"))',
      label: 'Admin users list'
    },
    {
      name: '03-user-detail',
      route: `/admin/users/${userId}`,
      readyCheck: 'Boolean(document.querySelector(".page-title")) && !document.body.innerText.includes("Loading operational records")',
      label: 'Admin user detail'
    },
    {
      name: '04-courses-list',
      route: '/admin/courses',
      readyCheck: 'Boolean(document.querySelector(".data-table"))',
      label: 'Admin courses list'
    },
    {
      name: '05-course-detail',
      route: `/admin/courses/${courseId}`,
      readyCheck: 'Boolean(document.querySelector(".page-title")) && !document.body.innerText.includes("Loading operational records")',
      label: 'Admin course detail'
    },
    {
      name: '06-categories',
      route: '/admin/categories',
      readyCheck: 'Boolean(document.querySelector(".data-table"))',
      label: 'Admin categories'
    },
    {
      name: '07-reports-list',
      route: '/admin/reports',
      readyCheck: 'Boolean(document.querySelector(".data-table"))',
      label: 'Admin reports list'
    },
    {
      name: '08-report-detail',
      route: '/admin/reports/rep-polish-1',
      readyCheck: 'Boolean(document.querySelector(".page-title")) && !document.body.innerText.includes("Loading operational records")',
      label: 'Admin report detail'
    },
    {
      name: '09-media',
      route: '/admin/media',
      readyCheck: 'Boolean(document.querySelector(".data-table"))',
      label: 'Admin media'
    },
    {
      name: '10-execution',
      route: '/admin/execution',
      readyCheck: 'Boolean(document.querySelector(".execution-service-card, .admin-overview-card, .data-table"))',
      label: 'Admin execution'
    },
    {
      name: '11-audit-list',
      route: '/admin/audit',
      readyCheck: 'Boolean(document.querySelector(".data-table"))',
      label: 'Admin audit list'
    },
    {
      name: '12-audit-detail',
      route: '/admin/audit/audit-polish-1',
      readyCheck: 'Boolean(document.querySelector(".page-title")) && !document.body.innerText.includes("Loading operational records")',
      label: 'Admin audit detail'
    },
    {
      name: '13-execution-dialog',
      route: '/admin/execution',
      readyCheck: 'Boolean(document.querySelector("[data-open-dialog=\\"execution-toggle-dialog\\"]"))',
      label: 'Admin execution pause confirmation dialog',
      interactionSetup: async () => {
        await ev(`(()=>{
          const btn = document.querySelector('[data-open-dialog="execution-toggle-dialog"]');
          if (btn) btn.click();
        })()`);
        await wait('Boolean(document.querySelector("#execution-toggle-dialog[open]"))', 'Execution dialog open');
      }
    },
    {
      name: '14-category-edit-dialog',
      route: '/admin/categories',
      readyCheck: 'Boolean(document.querySelector("[data-edit-category-id]"))',
      label: 'Admin category edit dialog',
      interactionSetup: async () => {
        await ev(`(()=>{
          const btn = document.querySelector('[data-edit-category-id]');
          if (btn) btn.click();
        })()`);
        await wait('Boolean(document.querySelector("#edit-category-dialog[open]"))', 'Edit category dialog open');
      }
    },
    {
      name: '15-category-remove-dialog',
      route: '/admin/categories',
      readyCheck: 'Boolean(document.querySelector("[data-remove-category-id]"))',
      label: 'Admin category remove dialog with replacement select',
      interactionSetup: async () => {
        await ev(`(()=>{
          const btn = document.querySelector('[data-remove-category-id="cat-programming"]') || document.querySelector('[data-remove-category-id]');
          if (btn) btn.click();
        })()`);
        await wait('Boolean(document.querySelector("#remove-category-dialog[open]"))', 'Remove category dialog open');
      }
    },
    {
      name: '16-category-remove-zero-usage-dialog',
      route: '/admin/categories',
      readyCheck: 'Boolean(document.querySelector("[data-remove-category-id]"))',
      label: 'Admin category remove dialog zero usage',
      interactionSetup: async () => {
        await ev(`(()=>{
          const btn = document.querySelector('[data-remove-category-id="cat-computer-science"]') || document.querySelector('[data-remove-category-usage="0"]');
          if (btn) btn.click();
        })()`);
        await wait('Boolean(document.querySelector("#remove-category-dialog[open]"))', 'Remove category dialog open');
      }
    }
  ];

  async function captureNamed(fileName: string, route: string) {
    const filePath = path.join(outputDir, fileName);
    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 100));
    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(filePath, Buffer.from(vpShot.data, 'base64'));
    console.log(`    [Saved] ${fileName}`);
    entries.push({
      stage: 'recheck',
      screen: fileName.replace(/\.png$/, ''),
      theme: fileName.includes('__dark') ? 'dark' : 'light',
      kind: 'viewport',
      route,
      width: 1440,
      height: 900,
      file: fileName,
      relativePath: `/tmp/zur-admin-screenshots/recheck/${fileName}`,
      captureTime: new Date().toISOString()
    });
  }

  async function runRecheckDialogSuite() {
    console.log('\n============================================================');
    console.log('  RUNNING INTERACTION & PERSISTENCE CHECKS FOR NEW DIALOGS');
    console.log('============================================================\n');

    const checkResults: Array<{ name: string; passed: boolean; details?: string }> = [];
    function recordCheck(name: string, passed: boolean, details?: string) {
      checkResults.push({ name, passed, details });
      console.log(`  ${passed ? '✔' : '✖'} ${name}${details ? ` (${details})` : ''}`);
      if (!passed) throw new Error(`Check failed: ${name}`);
    }

    async function submitDialogForm(dialogId: string, fields: Record<string, string>, checkFlight = false) {
      return await ev(`(()=>{
        const dialog = document.getElementById(${JSON.stringify(dialogId)});
        if (!dialog) throw new Error("Dialog not found: " + ${JSON.stringify(dialogId)});
        const form = dialog.querySelector('form');
        if (!form) throw new Error("Form not found in dialog: " + ${JSON.stringify(dialogId)});
        for (const [name, val] of Object.entries(${JSON.stringify(fields)})) {
          let input = form.querySelector('[name="' + name + '"]');
          if (!input && name === 'currentPassword') input = form.querySelector('input[type="password"]');
          if (input) {
            input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        const btn = form.querySelector('button[type="submit"]');
        if (btn) btn.disabled = false;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        if (${checkFlight} && btn) {
          return btn.disabled && (btn.innerText.includes('Confirming') || btn.innerText.includes('Review and apply'));
        }
        return true;
      })()`);
    }

    for (const theme of ['dark', 'light'] as const) {
      console.log(`\n--- Theme: ${theme.toUpperCase()} ---`);
      
      // Reset DB fixtures cleanly for deterministic multi-theme run
      seedDatabase(dbPath);
      try {
        db.prepare(`
          INSERT OR IGNORE INTO categories (id, name, slug, created_at)
          VALUES ('cat-computer-science', 'Computer Science', 'computer-science', '${new Date().toISOString()}')
        `).run();
      } catch {}
      try {
        const sampleImagePath = path.join(root, 'docs/evidence/t087-python-variable-reference-diagram.png');
        if (fs.existsSync(sampleImagePath)) {
          const png = fs.readFileSync(sampleImagePath);
          mediaService.uploadAsset('user-author-1', 'course-python-foundations', {
            buffer: png,
            filename: 'variable-reference-diagram.png',
            mimeType: 'image/png',
            altText: 'Diagram of variable binding in memory',
            caption: 'A variable binds a name to a value.'
          });
        }
      } catch {}

      await applyAndVerifyTheme(theme, false);
      await signInAs('margaret@zur.internal', 'AdminPass123!');

      // -------------------------------------------------------------
      // 1. USER DETAIL (/admin/users/user-student-1)
      // -------------------------------------------------------------
      await nav(`${origin}/admin/users/user-student-1`);
      await applyAndVerifyTheme(theme, true);
      await waitForContent('Boolean(document.querySelector("[data-open-dialog=\\"dialog-suspend-user\\"]"))', 'User detail loaded');

      // DIALOG 1: Suspend User
      // 1a. Keyboard opening
      const suspendTriggerFocused = await ev(`(()=>{
        const btn = document.querySelector('[data-open-dialog="dialog-suspend-user"]');
        if (!btn) return false;
        btn.focus();
        return document.activeElement === btn;
      })()`);
      recordCheck(`[${theme}] Suspend user: trigger button focusable`, suspendTriggerFocused);

      await ev(`(()=>{
        const btn = document.querySelector('[data-open-dialog="dialog-suspend-user"]');
        btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        btn.click();
      })()`);
      await wait('Boolean(document.querySelector("#dialog-suspend-user[open]"))', 'Suspend dialog open');
      recordCheck(`[${theme}] Suspend user: opened via keyboard/click`, true);

      // 1b. Target and effect validation
      const suspendTargetText = await ev(`document.querySelector('#dialog-suspend-user .admin-mutation-summary')?.innerText || ''`);
      const hasSuspendTarget = suspendTargetText.includes('Ada Lovelace (user-student-1)') &&
                               suspendTargetText.includes('Active') &&
                               suspendTargetText.includes('Suspended') &&
                               suspendTargetText.includes('Suspends account authentication');
      recordCheck(`[${theme}] Suspend user: displays target, states, and effect`, hasSuspendTarget, 'Ada Lovelace, Active -> Suspended');

      // 1c. Cancel and focus return
      await ev(`new Promise(resolve => {
        const dialog = document.getElementById('dialog-suspend-user');
        dialog.addEventListener('close', () => setTimeout(resolve, 50), { once: true });
        dialog.querySelector('[data-close-dialog]')?.click();
      })`);
      await wait('!document.querySelector("#dialog-suspend-user[open]")', 'Suspend dialog closed');
      const returnedFocusToSuspend = await ev(`document.activeElement?.getAttribute('data-open-dialog') === 'dialog-suspend-user'`);
      recordCheck(`[${theme}] Suspend user: cancel returns focus to trigger button`, returnedFocusToSuspend);

      // 1d. Reason and password required (form validation prevents empty submit)
      await ev(`document.querySelector('[data-open-dialog="dialog-suspend-user"]')?.click()`);
      await wait('Boolean(document.querySelector("#dialog-suspend-user[open]"))', 'Suspend dialog reopened');

      // 1e. Recoverable error preserves reason
      await submitDialogForm('dialog-suspend-user', {
        reason: 'Temporary suspension for exam review',
        currentPassword: 'WrongAdminPass999!'
      });
      await wait('Boolean(document.querySelector("#dialog-suspend-user .form-error:not(.hidden)"))', 'Suspend error shown');

      const suspendErrorMsg = await ev(`document.querySelector('#dialog-suspend-user .form-error')?.innerText || ''`);
      const suspendPreservedReason = await ev(`document.querySelector('#dialog-suspend-user input[name="reason"]')?.value || ''`);
      recordCheck(`[${theme}] Suspend user: recoverable error displayed`, Boolean(suspendErrorMsg), suspendErrorMsg);
      recordCheck(`[${theme}] Suspend user: recoverable error preserves reason`, suspendPreservedReason === 'Temporary suspension for exam review', `got: "${suspendPreservedReason}"`);

      // Capture screenshot: 01-dialog-suspend-user-error
      await captureNamed(`01-dialog-suspend-user-error__${theme}.png`, '/admin/users/user-student-1');

      // 1f. Valid submission & duplicate prevention
      const duplicatePrevented = await submitDialogForm('dialog-suspend-user', {
        currentPassword: 'AdminPass123!'
      }, true);
      recordCheck(`[${theme}] Suspend user: duplicate prevention disables submit button during flight`, duplicatePrevented);

      await wait('Boolean(document.querySelector("[data-open-dialog=\\"dialog-restore-user\\"]"))', 'User page reloaded with suspended status');
      const dbSuspendedStatus = (db.prepare("SELECT account_status FROM users WHERE id='user-student-1'").get() as any)?.account_status;
      recordCheck(`[${theme}] Suspend user: DB state verified persisted`, dbSuspendedStatus === 'suspended', 'account_status=suspended');

      // Capture screenshot: 02-user-suspended-receipt
      await captureNamed(`02-user-suspended-receipt__${theme}.png`, '/admin/users/user-student-1');

      // DIALOG 2: Restore User
      // 2a. Keyboard opening & target/effect
      await ev(`(()=>{
        const btn = document.querySelector('[data-open-dialog="dialog-restore-user"]');
        btn.focus();
        btn.click();
      })()`);
      await wait('Boolean(document.querySelector("#dialog-restore-user[open]"))', 'Restore dialog open');
      const restoreSummary = await ev(`document.querySelector('#dialog-restore-user .admin-mutation-summary')?.innerText || ''`);
      recordCheck(`[${theme}] Restore user: displays target, states, and effect`,
        restoreSummary.includes('Suspended') && restoreSummary.includes('Active') && restoreSummary.includes('Restores account login')
      );

      // 2b. Cancel and focus return
      await ev(`new Promise(resolve => {
        const dialog = document.getElementById('dialog-restore-user');
        dialog.addEventListener('close', () => setTimeout(resolve, 50), { once: true });
        dialog.querySelector('[data-close-dialog]')?.click();
      })`);
      await wait('!document.querySelector("#dialog-restore-user[open]")', 'Restore dialog closed');
      const returnedFocusToRestore = await ev(`document.activeElement?.getAttribute('data-open-dialog') === 'dialog-restore-user'`);
      recordCheck(`[${theme}] Restore user: cancel returns focus to trigger button`, returnedFocusToRestore);

      // 2c. Valid restore submission
      await ev(`document.querySelector('[data-open-dialog="dialog-restore-user"]')?.click()`);
      await wait('Boolean(document.querySelector("#dialog-restore-user[open]"))', 'Restore dialog reopened');
      await submitDialogForm('dialog-restore-user', {
        reason: 'Investigation concluded without findings',
        currentPassword: 'AdminPass123!'
      });
      await wait('Boolean(document.querySelector("[data-open-dialog=\\"dialog-suspend-user\\"]"))', 'User restored to active');
      const dbRestoredStatus = (db.prepare("SELECT account_status FROM users WHERE id='user-student-1'").get() as any)?.account_status;
      recordCheck(`[${theme}] Restore user: DB state verified active`, dbRestoredStatus === 'active', 'account_status=active');

      // Capture screenshot: 03-user-restored-receipt
      await captureNamed(`03-user-restored-receipt__${theme}.png`, '/admin/users/user-student-1');

      // DIALOG 3: Manage Roles (Grant & Revoke Author)
      // 3a. Open dialog & check target/effect
      await ev(`(()=>{
        const btn = document.querySelector('[data-open-dialog="dialog-manage-roles"]');
        btn.focus();
        btn.click();
      })()`);
      await wait('Boolean(document.querySelector("#dialog-manage-roles[open]"))', 'Manage roles dialog open');
      const rolesSummary = await ev(`document.querySelector('#dialog-manage-roles .admin-mutation-summary')?.innerText || ''`);
      recordCheck(`[${theme}] Manage roles: displays target, roles, and effect`,
        rolesSummary.includes('Ada Lovelace (user-student-1)') && rolesSummary.includes('Grant author role')
      );

      // 3b. Recoverable error preserves reason
      await submitDialogForm('dialog-manage-roles', {
        reason: 'Designated as guest course instructor',
        currentPassword: 'BadPass123!'
      });
      await wait('Boolean(document.querySelector("#dialog-manage-roles .form-error:not(.hidden)"))', 'Roles error shown');
      const rolesPreservedReason = await ev(`document.querySelector('#dialog-manage-roles input[name="reason"]')?.value || ''`);
      recordCheck(`[${theme}] Manage roles: recoverable error preserves reason`, rolesPreservedReason === 'Designated as guest course instructor');

      // Capture screenshot: 04-dialog-manage-roles-error
      await captureNamed(`04-dialog-manage-roles-error__${theme}.png`, '/admin/users/user-student-1');

      // 3c. Submit grant author
      await submitDialogForm('dialog-manage-roles', {
        currentPassword: 'AdminPass123!'
      });
      await wait('(()=>{ const text = document.body ? document.body.innerText : ""; return text.includes("Author"); })()', 'Page reloaded with Author badge');
      const dbCapabilitiesAfterGrant = JSON.parse((db.prepare("SELECT capabilities FROM users WHERE id='user-student-1'").get() as any)?.capabilities || '[]');
      recordCheck(`[${theme}] Manage roles: author role granted in DB`, dbCapabilitiesAfterGrant.includes('author'), 'capabilities=' + JSON.stringify(dbCapabilitiesAfterGrant));

      // Capture screenshot: 05-roles-author-granted-receipt
      await captureNamed(`05-roles-author-granted-receipt__${theme}.png`, '/admin/users/user-student-1');

      // 3d. Revoke author role
      await ev(`document.querySelector('[data-open-dialog="dialog-manage-roles"]')?.click()`);
      await wait('Boolean(document.querySelector("#dialog-manage-roles[open]"))', 'Manage roles dialog reopened for revoke');
      await submitDialogForm('dialog-manage-roles', {
        reason: 'Guest term ended',
        currentPassword: 'AdminPass123!'
      });
      await wait('(()=>{ const text = document.body ? document.body.innerText : ""; return !text.includes("Author") && text.includes("Student"); })()', 'Page reloaded with Author role revoked');
      const dbCapabilitiesAfterRevoke = JSON.parse((db.prepare("SELECT capabilities FROM users WHERE id='user-student-1'").get() as any)?.capabilities || '[]');
      recordCheck(`[${theme}] Manage roles: author role revoked in DB`, !dbCapabilitiesAfterRevoke.includes('author'), 'capabilities=' + JSON.stringify(dbCapabilitiesAfterRevoke));

      // DIALOG 4: Support Access
      // 4a. Open dialog & check target/effect
      await ev(`(()=>{
        const btn = document.querySelector('[data-open-dialog="dialog-support-access"]');
        btn.focus();
        btn.click();
      })()`);
      await wait('Boolean(document.querySelector("#dialog-support-access[open]"))', 'Support access dialog open');
      const supportSummary = await ev(`document.querySelector('#dialog-support-access .admin-mutation-summary')?.innerText || ''`);
      recordCheck(`[${theme}] Support access: displays target, 30m audit notice, and course select`,
        supportSummary.includes('Ada Lovelace (user-student-1)') && supportSummary.includes('30-minute audited read-only session')
      );

      // 4b. Recoverable error preserves reason
      await submitDialogForm('dialog-support-access', {
        reason: 'Assisting student with recursion checkpoint issue',
        currentPassword: 'BadPass999!'
      });
      await wait('Boolean(document.querySelector("#dialog-support-access .form-error:not(.hidden)"))', 'Support access error shown');
      const supportPreservedReason = await ev(`document.querySelector('#dialog-support-access input[name="reason"]')?.value || ''`);
      recordCheck(`[${theme}] Support access: recoverable error preserves reason`, supportPreservedReason === 'Assisting student with recursion checkpoint issue');

      // Capture screenshot: 06-dialog-support-access-error
      await captureNamed(`06-dialog-support-access-error__${theme}.png`, '/admin/users/user-student-1');

      // 4c. Submit valid support access
      await submitDialogForm('dialog-support-access', {
        currentPassword: 'AdminPass123!'
      });
      await wait('Boolean(document.querySelector(".alert-warning") && document.body.innerText.includes("Audited support access active"))', 'Support access active session page loaded');
      const dbSupportGrant = db.prepare("SELECT * FROM admin_support_access WHERE student_id='user-student-1' ORDER BY created_at DESC LIMIT 1").get() as any;
      recordCheck(`[${theme}] Support access: grant recorded in DB`, Boolean(dbSupportGrant?.id), `grantId=${dbSupportGrant?.id}`);

      // Capture screenshot: 07-support-access-active-receipt
      await captureNamed(`07-support-access-active-receipt__${theme}.png`, '/admin/users/user-student-1');

      // 4d. Clean up / end support access session
      await ev(`document.querySelector('[data-open-dialog="dialog-revoke-support-access"]')?.click()`);
      await wait('Boolean(document.querySelector("#dialog-revoke-support-access[open]"))', 'Revoke support access dialog open');
      await submitDialogForm('dialog-revoke-support-access', {
        reason: 'Session finished',
        currentPassword: 'AdminPass123!'
      });
      await wait('!document.querySelector(".alert-warning")', 'Support access session ended');

      // -------------------------------------------------------------
      // 2. COURSE DETAIL (/admin/courses/course-python-foundations)
      // -------------------------------------------------------------
      await nav(`${origin}/admin/courses/course-python-foundations`);
      await waitForContent('Boolean(document.querySelector("[data-open-dialog=\\"dialog-course-availability\\"]"))', 'Course detail loaded');

      // DIALOG 5: Course Availability (Suspend & Restore)
      // 5a. Keyboard opening & target/effect
      await ev(`(()=>{
        const btn = document.querySelector('[data-open-dialog="dialog-course-availability"]');
        btn.focus();
        btn.click();
      })()`);
      await wait('Boolean(document.querySelector("#dialog-course-availability[open]"))', 'Course availability dialog open');
      const courseAvailSummary = await ev(`document.querySelector('#dialog-course-availability .admin-mutation-summary')?.innerText || ''`);
      recordCheck(`[${theme}] Course availability: displays target, states, and effect`,
        courseAvailSummary.includes('Python foundations (course-python-foundations)') &&
        courseAvailSummary.includes('Available') &&
        courseAvailSummary.includes('Suspended') &&
        courseAvailSummary.includes('Hides course from catalog')
      );

      // 5b. Cancel and focus return
      await ev(`new Promise(resolve => {
        const dialog = document.getElementById('dialog-course-availability');
        dialog.addEventListener('close', () => setTimeout(resolve, 50), { once: true });
        dialog.querySelector('[data-close-dialog]')?.click();
      })`);
      await wait('!document.querySelector("#dialog-course-availability[open]")', 'Course availability dialog closed');
      const returnedFocusToAvail = await ev(`document.activeElement?.getAttribute('data-open-dialog') === 'dialog-course-availability'`);
      recordCheck(`[${theme}] Course availability: cancel returns focus to trigger button`, returnedFocusToAvail);

      // 5c. Recoverable error preserves reason
      await ev(`document.querySelector('[data-open-dialog="dialog-course-availability"]')?.click()`);
      await wait('Boolean(document.querySelector("#dialog-course-availability[open]"))', 'Course availability reopened');
      await submitDialogForm('dialog-course-availability', {
        reason: 'Course curriculum overhaul in progress',
        currentPassword: 'WrongPassword456!'
      });
      await wait('Boolean(document.querySelector("#dialog-course-availability .form-error:not(.hidden)"))', 'Course availability error shown');
      const availPreservedReason = await ev(`document.querySelector('#dialog-course-availability input[name="reason"]')?.value || ''`);
      recordCheck(`[${theme}] Course availability: recoverable error preserves reason`, availPreservedReason === 'Course curriculum overhaul in progress');

      // Capture screenshot: 08-dialog-course-availability-error
      await captureNamed(`08-dialog-course-availability-error__${theme}.png`, '/admin/courses/course-python-foundations');

      // 5d. Submit suspend course
      await submitDialogForm('dialog-course-availability', {
        currentPassword: 'AdminPass123!'
      });
      await wait('(()=>{ const text = document.body ? document.body.innerText : ""; return text.includes("Restore availability"); })()', 'Course suspended');
      const dbCourseSuspended = (db.prepare("SELECT is_suspended FROM courses WHERE id='course-python-foundations'").get() as any)?.is_suspended;
      recordCheck(`[${theme}] Course availability: suspended state verified in DB`, dbCourseSuspended === 1, 'is_suspended=1');

      // Capture screenshot: 09-course-suspended-receipt
      await captureNamed(`09-course-suspended-receipt__${theme}.png`, '/admin/courses/course-python-foundations');

      // 5e. Restore course availability
      await ev(`document.querySelector('[data-open-dialog="dialog-course-availability"]')?.click()`);
      await wait('Boolean(document.querySelector("#dialog-course-availability[open]"))', 'Restore availability dialog open');
      await submitDialogForm('dialog-course-availability', {
        reason: 'Overhaul completed, relaunching course',
        currentPassword: 'AdminPass123!'
      });
      await wait('(()=>{ const text = document.body ? document.body.innerText : ""; return text.includes("Suspend course"); })()', 'Course restored to available');
      const dbCourseRestored = (db.prepare("SELECT is_suspended FROM courses WHERE id='course-python-foundations'").get() as any)?.is_suspended;
      recordCheck(`[${theme}] Course availability: restored state verified in DB`, dbCourseRestored === 0, 'is_suspended=0');

      // DIALOG 6: Progression Waiver
      // 6a. Keyboard open & structure check
      await ev(`(()=>{
        const btn = document.querySelector('[data-open-dialog="dialog-course-waiver"]');
        btn.focus();
        btn.click();
      })()`);
      await wait('Boolean(document.querySelector("#dialog-course-waiver[open]"))', 'Course waiver dialog open');
      const waiverNotice = await ev(`document.querySelector('#dialog-course-waiver .admin-action-effect-card')?.innerText || ''`);
      const initialSubmitDisabled = await ev(`Boolean(document.querySelector('#dialog-course-waiver button[type="submit"]')?.disabled)`);
      recordCheck(`[${theme}] Course waiver: displays immutable scope notice`, waiverNotice.includes('Only active enrollments pinned to the selected immutable version'));
      recordCheck(`[${theme}] Course waiver: submit button initially disabled before preview`, initialSubmitDisabled);

      // 6b. Live affected enrollment preview
      const selectHasOptions = await ev(`Boolean(document.querySelector('#dialog-course-waiver select[name="versionStep"] option[value*="|"]'))`);
      recordCheck(`[${theme}] Course waiver: versionStep select populated with required steps`, selectHasOptions);

      await ev(`(()=>{
        const select = document.querySelector('#dialog-course-waiver select[name="versionStep"]');
        const option = select.querySelector('option[value*="|"]');
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
      await wait('(()=>{ const txt = document.querySelector("#dialog-course-waiver .waiver-review-count")?.innerText || ""; return txt.includes("active enrollment") || txt.includes("0 active"); })()', 'Waiver preview updated');
      const waiverReviewText = await ev(`document.querySelector('#dialog-course-waiver .waiver-review-count')?.innerText || ''`);
      recordCheck(`[${theme}] Course waiver: live affected enrollments preview rendered`, Boolean(waiverReviewText), waiverReviewText);

      // Capture screenshot: 10-dialog-course-waiver-preview
      await captureNamed(`10-dialog-course-waiver-preview__${theme}.png`, '/admin/courses/course-python-foundations');

      // 6c. Recoverable error preserves reason
      await submitDialogForm('dialog-course-waiver', {
        reason: 'Waiving exercise due to test harness latency timeout',
        currentPassword: 'BadPassWaiver!'
      });
      await wait('Boolean(document.querySelector("#dialog-course-waiver .form-error:not(.hidden)"))', 'Waiver error shown');
      const waiverPreservedReason = await ev(`document.querySelector('#dialog-course-waiver input[name="reason"]')?.value || ''`);
      recordCheck(`[${theme}] Course waiver: recoverable error preserves reason`, waiverPreservedReason === 'Waiving exercise due to test harness latency timeout');

      // 6d. Valid waiver submission
      await submitDialogForm('dialog-course-waiver', {
        currentPassword: 'AdminPass123!'
      });
      await wait('!document.querySelector("#dialog-course-waiver[open]")', 'Waiver dialog closed after submission');
      const dbWaiverCount = (db.prepare("SELECT count(*) as count FROM step_progress WHERE is_waived=1").get() as any)?.count;
      recordCheck(`[${theme}] Course waiver: persisted waiver in DB verified`, dbWaiverCount > 0, `total_waived=${dbWaiverCount}`);

      // Capture screenshot: 11-course-waiver-applied-receipt
      await captureNamed(`11-course-waiver-applied-receipt__${theme}.png`, '/admin/courses/course-python-foundations');

      // -------------------------------------------------------------
      // 3. CATEGORIES (/admin/categories)
      // -------------------------------------------------------------
      await nav(`${origin}/admin/categories`);
      await waitForContent('Boolean(document.querySelector("[data-edit-category-id]"))', 'Categories loaded');

      // DIALOG 7: Category Edit (Rename)
      // 7a. Open rename dialog
      await ev(`(()=>{
        const btn = document.querySelector('[data-edit-category-id="cat-programming"]') || document.querySelector('[data-edit-category-id]');
        btn.focus();
        btn.click();
      })()`);
      await wait('Boolean(document.querySelector("#edit-category-dialog[open]"))', 'Edit category dialog open');
      const editNameValue = await ev(`document.querySelector('#edit-category-name')?.value || ''`);
      recordCheck(`[${theme}] Category rename: prefilled current name`, editNameValue === 'Programming');

      // 7b. Cancel and focus return
      await ev(`new Promise(resolve => {
        const dialog = document.getElementById('edit-category-dialog');
        dialog.addEventListener('close', () => setTimeout(resolve, 50), { once: true });
        dialog.querySelector('[data-close-dialog]')?.click();
      })`);
      await wait('!document.querySelector("#edit-category-dialog[open]")', 'Edit category dialog closed');
      const returnedFocusToEdit = await ev(`Boolean(document.activeElement?.getAttribute('data-edit-category-id'))`);
      recordCheck(`[${theme}] Category rename: cancel returns focus to trigger button`, returnedFocusToEdit);

      // 7c. Recoverable error preserves reason
      await ev(`document.querySelector('[data-edit-category-id="cat-programming"]')?.click()`);
      await wait('Boolean(document.querySelector("#edit-category-dialog[open]"))', 'Edit category reopened');
      await submitDialogForm('edit-category-dialog', {
        name: 'Computer Science & Software',
        reason: 'Broadening curriculum scope',
        currentPassword: 'WrongPasswordForRename!'
      });
      await wait('Boolean(document.querySelector("#edit-category-dialog .form-error:not(.hidden)"))', 'Edit category error shown');
      const editPreservedReason = await ev(`document.querySelector('#edit-category-dialog input[name="reason"]')?.value || ''`);
      recordCheck(`[${theme}] Category rename: recoverable error preserves reason`, editPreservedReason === 'Broadening curriculum scope');

      // Capture screenshot: 12-dialog-category-edit-rename
      await captureNamed(`12-dialog-category-edit-rename__${theme}.png`, '/admin/categories');

      // Close dialog
      await ev(`document.querySelector('#edit-category-dialog [data-close-dialog]')?.click()`);
      await wait('!document.querySelector("#edit-category-dialog[open]")', 'Edit category dialog closed');

      // DIALOG 8: Category Remove (Confirmation with Replacement)
      // 8a. Open remove dialog
      await ev(`(()=>{
        const btn = document.querySelector('[data-remove-category-id="cat-programming"]') || document.querySelector('[data-remove-category-id]');
        btn.focus();
        btn.click();
      })()`);
      await wait('Boolean(document.querySelector("#remove-category-dialog[open]"))', 'Remove category dialog open');
      const removeSummaryText = await ev(`document.querySelector('#remove-category-dialog .admin-action-effect-card')?.innerText || ''`);
      recordCheck(`[${theme}] Category removal: shows target name and course usage`, removeSummaryText.includes('Programming') && removeSummaryText.includes('2'));

      // 8b. Initial submit button disabled when replacement required
      const removeInitialDisabled = await ev(`Boolean(document.querySelector('#remove-category-dialog button[type="submit"]')?.disabled)`);
      recordCheck(`[${theme}] Category removal: submit disabled before replacement selected`, removeInitialDisabled);

      // 8c. Replacement select contains eligible category and excludes self
      const replacementOptions = await ev(`(()=>{
        const select = document.querySelector('#edit-category-replacement-select');
        return Array.from(select ? select.options : []).map(o => ({ value: o.value, text: o.text }));
      })()`) as Array<{ value: string; text: string }>;
      const hasReplacement = replacementOptions.some(o => o.value === 'cat-computer-science');
      const excludesSelf = !replacementOptions.some(o => o.value === 'cat-programming');
      recordCheck(`[${theme}] Category removal: replacement options exclude current category and offer alternatives`, hasReplacement && excludesSelf);

      // Select replacement
      await ev(`(()=>{
        const select = document.querySelector('#edit-category-replacement-select');
        select.value = 'cat-computer-science';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      const enabledAfterSelect = await ev(`!document.querySelector('#remove-category-dialog button[type="submit"]')?.disabled`);
      recordCheck(`[${theme}] Category removal: submit enabled after selecting replacement`, enabledAfterSelect);

      // Capture screenshot: 13-dialog-category-remove-replacement
      await captureNamed(`13-dialog-category-remove-replacement__${theme}.png`, '/admin/categories');

      // 8d. Recoverable error preserves reason and selection
      await submitDialogForm('remove-category-dialog', {
        reason: 'Consolidating curriculum under Computer Science',
        currentPassword: 'WrongPasswordForRemoval!'
      });
      await wait('Boolean(document.querySelector("#remove-category-dialog .form-error:not(.hidden)"))', 'Remove category error shown');
      const removePreservedReason = await ev(`document.querySelector('#remove-category-dialog input[name="reason"]')?.value || ''`);
      const removePreservedReplacement = await ev(`document.querySelector('#edit-category-replacement-select')?.value || ''`);
      recordCheck(`[${theme}] Category removal: recoverable error preserves reason and replacement selection`,
        removePreservedReason === 'Consolidating curriculum under Computer Science' && removePreservedReplacement === 'cat-computer-science'
      );

      // 8e. Valid removal submission
      await submitDialogForm('remove-category-dialog', {
        currentPassword: 'AdminPass123!'
      });
      await wait('!document.querySelector("#remove-category-dialog[open]")', 'Remove dialog closed after submission');
      const dbCatDeleted = !(db.prepare("SELECT id FROM categories WHERE id='cat-programming'").get() as any)?.id;
      const dbCourseReassigned = (db.prepare("SELECT category_id FROM courses WHERE id='course-python-foundations'").get() as any)?.category_id === 'cat-computer-science';
      recordCheck(`[${theme}] Category removal: deleted from DB and courses reassigned`, dbCatDeleted && dbCourseReassigned);

      // Capture screenshot: 14-category-removed-receipt
      await captureNamed(`14-category-removed-receipt__${theme}.png`, '/admin/categories');
    }

    console.log('\n============================================================');
    console.log(`  ALL DIALOG CHECKS PASSED: ${checkResults.length}/${checkResults.length}`);
    console.log('============================================================\n');

    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ recheck: entries, checkResults, updatedAt: new Date().toISOString() }, null, 2));
    console.log(`Recheck manifest saved to: ${manifestPath}`);
  }

  if (stage === 'recheck') {
    await runRecheckDialogSuite();
  } else {
    for (const sc of screens) {
      console.log(`\n  -> Screen: ${sc.name} (${sc.route})`);
      try {
        // 1. Dark theme
        await applyAndVerifyTheme('dark', false);
        await nav(`${origin}${sc.route}`);
        await applyAndVerifyTheme('dark', true);
        await waitForContent(sc.readyCheck, sc.label);
        await captureScreen(sc.name, 'dark', sc.route, sc.interactionSetup);

        // 2. Light theme
        await applyAndVerifyTheme('light', true);
        await waitForContent(sc.readyCheck, sc.label);
        await captureScreen(sc.name, 'light', sc.route, sc.interactionSetup);
      } catch (err: any) {
        console.error(`  ✗ [FAILED] ${sc.name}: ${err.message}`);
        failedScreens.push({ screen: sc.name, reason: err.message });
      }
    }

    // Update or create manifest.json
    let manifestPath = path.join(reportAdminDir, 'manifest.json');
    let manifest: any = { before: [], after: [] };
    try {
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      }
    } catch {}
    manifest[stage] = entries;
    manifest.updatedAt = new Date().toISOString();
    try {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`\nManifest updated at: ${manifestPath}`);
    } catch (err: any) {
      const fallbackDir = path.join('/tmp', 'zur-admin-screenshots');
      fs.mkdirSync(fallbackDir, { recursive: true });
      manifestPath = path.join(fallbackDir, 'manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`\nManifest saved to fallback at: ${manifestPath}`);
    }
  }

} catch (err: any) {
  console.error('FATAL CAPTURE ERROR:', err);
  process.exitCode = 1;
} finally {
  console.log('\nCleaning up processes...');
  if (socket) {
    try { socket.close(); } catch {}
  }
  await stopProcess(chrome);
  await stopProcess(vite);
  if (apiServer) {
    await new Promise<void>(r => apiServer!.close(() => r()));
  }
  closeDatabase(db);
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
  console.log('Capture finished.');
}

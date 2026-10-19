import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import type { Server } from 'node:http';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';
import { createServer as createViteServer } from 'vite';

delete process.env.HTTP_PROXY;
delete process.env.http_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.https_proxy;
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

const root = process.cwd();
const screenshotsDir = path.join(root, 'screenshots', 'interface-fixes-2026-10-08', 'learner', 'round-5');
fs.mkdirSync(screenshotsDir, { recursive: true });

console.log('============================================================');
console.log('  ZUR LEARNER ROUND 5 TARGETED RESTORE CAPTURE');
console.log(`  Destination: ${screenshotsDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-learner-round-5-'));
const dbPath = path.join(tmp, 'zur-learner-round-5.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

const nowIso = new Date().toISOString();

// Extra seed: Historical attempt 2 for step-4-python-echo in enr-ada
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

let controlledRestore503 = false;
let restore503Receipts = 0;

const baseApi = createServer(db);

const api = http.createServer((req, res) => {
  const urlPath = (req.url || '').split('?')[0];
  if (controlledRestore503 && urlPath.startsWith('/api/attempts/') && urlPath.endsWith('/restore') && req.method === 'POST') {
    restore503Receipts++;
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

const capturedResults: any[] = [];

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
  let lastMainLoader = '';
  const loadedDocuments = new Set<string>();

  socket.addEventListener('message', e => {
    const m = JSON.parse(String(e.data));
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

  // Sign in as Ada Lovelace
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

  for (const theme of ['dark', 'light'] as const) {
    console.log(`\n--- Capturing Round 5 Restore Failure (${theme}) ---`);
    await applyTheme(theme);

    await nav(`${origin}/learn/enr-ada/steps/step-4-python-echo/attempts/att-ada-2`);
    await wait('Boolean(document.querySelector("#restore-to-editor-btn"))', 'Attempt detail loaded');

    // Open restore dialog
    await ev('document.querySelector("#restore-to-editor-btn")?.click()');
    await wait('Boolean(document.querySelector("#restore-confirm-dialog:not([hidden])"))', 'Restore dialog opened');

    const beforeReceipts = restore503Receipts;
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

      if (restore503Receipts <= beforeReceipts) {
        throw new Error('Proxy did not receive POST /api/attempts/:id/restore request for controlled 503 fault');
      }

      // Query visibility and element metrics
      const visibility = await ev(`(()=>{
        const e = document.querySelector('#restore-error-message');
        const d = document.querySelector('#restore-confirm-dialog');
        const r = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        return {
          text: e.textContent,
          hidden: e.hidden,
          inDialog: d.contains(e),
          display: s.display,
          visibility: s.visibility,
          opacity: s.opacity,
          width: r.width,
          height: r.height,
          checkVisibility: e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
          dialogOpen: d.open,
          dialogOpenAttr: d.hasAttribute('open'),
          retryBtn: document.querySelector('#confirm-restore-btn')?.textContent,
          retryEnabled: !document.querySelector('#confirm-restore-btn')?.disabled
        };
      })()`);

      console.log(`[Visibility Check - ${theme}]`, JSON.stringify(visibility));
      if (!visibility.checkVisibility) {
        throw new Error(`Restore error message checkVisibility is false in ${theme}`);
      }
      if (visibility.width <= 0 || visibility.height <= 0) {
        throw new Error(`Restore error message has non-positive geometry in ${theme}: ${visibility.width}x${visibility.height}`);
      }
      if (!visibility.dialogOpen) {
        throw new Error(`Restore dialog is not open in ${theme}`);
      }

      const filename = `learner-l2-attempt-restore-failure-${theme}.png`;
      const fullPath = path.join(screenshotsDir, filename);
      await ev('window.scrollTo(0, 0)');
      await new Promise(r => setTimeout(r, 100));

      const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
      fs.writeFileSync(fullPath, Buffer.from(vpShot.data, 'base64'));
      console.log(`[Captured] ${fullPath} (${theme})`);

      capturedResults.push({
        theme,
        filename,
        fullPath,
        visibility,
        timestamp: new Date().toISOString()
      });
    } finally {
      controlledRestore503 = false;
      await ev('document.querySelector("#cancel-restore-btn")?.click()');
      await wait('Boolean(document.querySelector("#restore-confirm-dialog")?.hidden || getComputedStyle(document.querySelector("#restore-confirm-dialog")).display === "none")', 'Restore dialog closed after capture');
    }
  }

  console.log('\n============================================================');
  console.log('ROUND 5 CAPTURE SUMMARY:');
  console.log(JSON.stringify(capturedResults, null, 2));
  console.log('============================================================\n');

} finally {
  socket?.close();
  await stopProcess(chrome);
  await viteServer?.close();
  await new Promise<void>(r => {
    if (apiServer) apiServer.close(() => r());
    else r();
  });
  closeDatabase(dbPath);
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
}

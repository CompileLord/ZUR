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
  console.log('Captured S4-M04 operational and Python workspace responsive/adverse fixtures.');
} finally {
  closeDatabase(dbPath);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

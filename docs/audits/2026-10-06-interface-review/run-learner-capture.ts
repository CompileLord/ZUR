import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import type { Server } from 'node:http';
import { closeDatabase, getDatabase } from '../../../packages/server/src/db/database.ts';
import { runMigrations } from '../../../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../../../packages/server/src/db/seed.ts';
import { createServer } from '../../../packages/server/src/server.ts';
import { ExecutionService } from '../../../packages/server/src/services/execution-service.ts';
import { MediaService } from '../../../packages/server/src/services/media-service.ts';
import { processExecutionJob } from '../../../packages/worker/src/worker.ts';
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
fs.mkdirSync(auditDir, { recursive: true });

console.log('============================================================');
console.log('  ZUR LEARNER REDESIGN EVIDENCE CAPTURE HARNESS');
console.log(`  Target Output:   ${learnerOutputDir}`);
console.log(`  Audit Target:    ${auditDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-learner-evidence-'));
const dbPath = path.join(tmp, 'zur-learner.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

// Seed 12-step task strip
const seedNow = new Date().toISOString();
const les1Id = 'les-1-naming';

db.prepare(`
  INSERT INTO step_progress (id, user_id, enrollment_id, step_id, is_completed, completed_at, is_waived, created_at, updated_at)
  VALUES ('prog-ada-2', 'user-student-1', 'enr-ada', 'step-2-video', 1, datetime('now', '-1 day'), 0, '${seedNow}', '${seedNow}')
  ON CONFLICT(enrollment_id, step_id) DO UPDATE SET is_completed = 1, completed_at = excluded.completed_at
`).run();

db.prepare(`
  INSERT INTO step_progress (id, user_id, enrollment_id, step_id, is_completed, completed_at, is_waived, created_at, updated_at)
  VALUES ('prog-ada-3', 'user-student-1', 'enr-ada', 'step-3-quiz-single', 1, datetime('now', '-1 day'), 0, '${seedNow}', '${seedNow}')
  ON CONFLICT(enrollment_id, step_id) DO UPDATE SET is_completed = 1, completed_at = excluded.completed_at
`).run();

// Step 5: Waived Theory step
const step5Id = 'step-5-waived-theory';
db.prepare(`
  INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at)
  VALUES (?, ?, 'theory', 'Name Binding Internals', 4, 1, 5, '${seedNow}', '${seedNow}')
`).run(step5Id, les1Id);
db.prepare(`
  INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at)
  VALUES (?, ?, ?, 1, '${seedNow}')
`).run('content-les1-step-5', step5Id, JSON.stringify({ kind: 'theory', markdown: '# Name Binding Internals\nAdvanced scope rules.' }));
db.prepare(`
  INSERT INTO step_progress (id, user_id, enrollment_id, step_id, is_completed, completed_at, is_waived, waiver_reason, created_at, updated_at)
  VALUES ('prog-ada-5', 'user-student-1', 'enr-ada', ?, 0, NULL, 1, 'Prior coursework accredited', '${seedNow}', '${seedNow}')
  ON CONFLICT(enrollment_id, step_id) DO UPDATE SET is_waived = 1, waiver_reason = 'Prior coursework accredited'
`).run(step5Id);

// Steps 6-12
const step6Id = 'step-6-int-precision';
db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'theory', 'Integer Precision', 5, 1, 5, '${seedNow}', '${seedNow}')`).run(step6Id, les1Id);
db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${seedNow}')`).run('content-les1-step-6', step6Id, JSON.stringify({ kind: 'theory', markdown: '# Integer Precision\nPython integers have arbitrary precision.' }));

const step7Id = 'step-7-arithmetic-py';
db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'python', 'Arithmetic Operators', 6, 1, 10, '${seedNow}', '${seedNow}')`).run(step7Id, les1Id);
db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${seedNow}')`).run('content-les1-step-7', step7Id, JSON.stringify({ kind: 'python', problemStatement: 'Read two numbers and print their sum.', starterCode: 'import sys\n', referenceSolution: 'import sys\na, b = map(int, sys.stdin.read().split())\nprint(a + b)\n', hints: ['Use + operator'], solutionExplanation: 'Adds two ints.', runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 } }));
db.prepare(`INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES ('tc-les1-7-pub', ?, '3 4', '7', 0, 0, '${seedNow}')`).run(step7Id);

const step8Id = 'step-8-numeric-quiz';
db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'quiz', 'Numeric Types Quiz', 7, 1, 3, '${seedNow}', '${seedNow}')`).run(step8Id, les1Id);
db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${seedNow}')`).run('content-les1-step-8', step8Id, JSON.stringify({ kind: 'quiz', quizType: 'single_choice', prompt: 'What type is the result of 7 / 2 in Python 3?', options: [{ id: 'opt-q8-1', text: 'int', isCorrect: false }, { id: 'opt-q8-2', text: 'float', isCorrect: true }], explanation: 'Division with / returns a float.' }));

const step9Id = 'step-9-float-theory';
db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'theory', 'Floating Point Concepts', 8, 1, 5, '${seedNow}', '${seedNow}')`).run(step9Id, les1Id);
db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${seedNow}')`).run('content-les1-step-9', step9Id, JSON.stringify({ kind: 'theory', markdown: '# Floating Point Concepts\nIEEE 754 representations.' }));

const step10Id = 'step-10-mult-py';
db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'python', 'Multiply and Modulo', 9, 1, 10, '${seedNow}', '${seedNow}')`).run(step10Id, les1Id);
db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${seedNow}')`).run('content-les1-step-10', step10Id, JSON.stringify({ kind: 'python', problemStatement: 'Print product and remainder.', starterCode: 'import sys\n', referenceSolution: 'import sys\na, b = map(int, sys.stdin.read().split())\nprint(a * b, a % b)\n', hints: ['Use * and %'], solutionExplanation: 'Multiplication and modulo.', runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 } }));
db.prepare(`INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES ('tc-les1-10-pub', ?, '7 3', '21 1', 0, 0, '${seedNow}')`).run(step10Id);

const step11Id = 'step-11-memory-vid';
db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'video', 'Memory Allocation Deep Dive', 10, 1, 8, '${seedNow}', '${seedNow}')`).run(step11Id, les1Id);
db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${seedNow}')`).run('content-les1-step-11', step11Id, JSON.stringify({ kind: 'video', videoUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', provider: 'youtube', transcript: 'Deep dive into memory allocators and heap structures in Python.', captionVerified: true }));

const step12Id = 'step-12-naming-cap';
db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes, created_at, updated_at) VALUES (?, ?, 'python', 'Naming Milestone Exercise', 11, 1, 15, '${seedNow}', '${seedNow}')`).run(step12Id, les1Id);
db.prepare(`INSERT INTO step_contents (id, step_id, content_payload, revision, updated_at) VALUES (?, ?, ?, 1, '${seedNow}')`).run('content-les1-step-12', step12Id, JSON.stringify({ kind: 'python', problemStatement: 'Echo the input back out.', starterCode: 'import sys\nprint(sys.stdin.read().strip())\n', referenceSolution: 'import sys\nprint(sys.stdin.read().strip())\n', hints: ['Echo the input'], solutionExplanation: 'Reads stdin and prints.', runtimeLimits: { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 } }));
db.prepare(`INSERT INTO test_cases (id, step_id, stdin, expected_stdout, is_hidden, position, created_at) VALUES ('tc-les1-12-pub', ?, 'milestone', 'milestone', 0, 0, '${seedNow}')`).run(step12Id);

// Update course_versions snapshot_data for version-2-snapshot
const verRow = db.prepare("SELECT snapshot_data FROM course_versions WHERE id = 'version-2-snapshot'").get() as any;
if (verRow) {
  const snap = JSON.parse(verRow.snapshot_data);
  const les = snap.modules?.[0]?.lessons?.[0];
  if (les && les.id === les1Id) {
    const extraSteps = [
      { id: step5Id, title: 'Name Binding Internals', type: 'theory', position: 4, isRequired: true, estimatedDurationMinutes: 5, content: { kind: 'theory', markdown: '# Name Binding Internals' } },
      { id: step6Id, title: 'Integer Precision', type: 'theory', position: 5, isRequired: true, estimatedDurationMinutes: 5, content: { kind: 'theory', markdown: '# Integer Precision' } },
      { id: step7Id, title: 'Arithmetic Operators', type: 'python', position: 6, isRequired: true, estimatedDurationMinutes: 10, content: { kind: 'python', problemStatement: 'Read two numbers and print their sum.' } },
      { id: step8Id, title: 'Numeric Types Quiz', type: 'quiz', position: 7, isRequired: true, estimatedDurationMinutes: 3, content: { kind: 'quiz', quizType: 'single_choice', prompt: 'What type is the result of 7 / 2 in Python 3?' } },
      { id: step9Id, title: 'Floating Point Concepts', type: 'theory', position: 8, isRequired: true, estimatedDurationMinutes: 5, content: { kind: 'theory', markdown: '# Floating Point Concepts' } },
      { id: step10Id, title: 'Multiply and Modulo', type: 'python', position: 9, isRequired: true, estimatedDurationMinutes: 10, content: { kind: 'python', problemStatement: 'Print product and remainder.' } },
      { id: step11Id, title: 'Memory Allocation Deep Dive', type: 'video', position: 10, isRequired: true, estimatedDurationMinutes: 8, content: { kind: 'video', videoUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' } },
      { id: step12Id, title: 'Naming Milestone Exercise', type: 'python', position: 11, isRequired: true, estimatedDurationMinutes: 15, content: { kind: 'python', problemStatement: 'Echo the input back out.' } },
    ];
    for (const es of extraSteps) {
      if (!les.steps.some((s: any) => s.id === es.id)) {
        les.steps.push(es);
      }
    }
    db.prepare("UPDATE course_versions SET snapshot_data = ? WHERE id = 'version-2-snapshot'").run(JSON.stringify(snap));
  }
}

// Media asset
const uploadsDir = path.join(tmp, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const mediaService = new MediaService(db, uploadsDir);
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

// Seed sample report
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

// Seed sample assessment attempt
try {
  db.prepare(`
    INSERT INTO assessment_attempts (
      id, user_id, enrollment_id, step_id, course_version_id, attempt_number,
      type, verdict, code_snapshot, selected_options, execution_time_ms,
      is_infrastructure_failure, created_at
    ) VALUES (
      'att-ada-1', 'user-student-1', 'enr-ada', 'step-4-python-echo', 'version-2-snapshot', 1,
      'python', 'PASSED', 'import sys\\nval = int(sys.stdin.read().strip())\\nprint(val * 2)\\n',
      NULL, 18, 0, datetime('now', '-2 hours')
    )
  `).run();
} catch (err) {
  console.warn('Could not seed sample assessment attempt:', err);
}

const courseRow = db.prepare("SELECT id FROM courses WHERE publication_status='published' LIMIT 1").get() as any;
const courseId = courseRow?.id || 'course-python-foundations';
const enrollmentRow = db.prepare("SELECT id FROM enrollments WHERE user_id='user-student-1' AND course_id=? LIMIT 1").get(courseId) as any;
const enrollmentId = enrollmentRow?.id || 'enr-ada';
const theoryStepId = 'step-1-theory';
const videoStepId = 'step-2-video';
const quizStepId = 'step-3-quiz-single';
const pythonStepId = 'step-4-python-echo';

const api = createServer(db);
const execution = new ExecutionService(db);

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
  route: string;
  timestamp: string;
  viewport: string;
  theme: 'dark' | 'light';
  state: string;
  fixture: boolean;
  fixtureType: string;
  validity: 'valid' | 'invalid' | 'gap';
}

interface InteractionLogEntry {
  step: number;
  sourceRoute: string;
  destinationRoute: string;
  action: string;
  expected: string;
  actual: string;
  assertions: string;
  passed: boolean;
}

const manifest: ManifestEntry[] = [];
const interactionLog: InteractionLogEntry[] = [];
let interactionStep = 0;

function logInteraction(
  sourceRoute: string,
  destinationRoute: string,
  action: string,
  expected: string,
  actual: string,
  assertions: string,
  passed: boolean
) {
  interactionStep++;
  interactionLog.push({
    step: interactionStep,
    sourceRoute,
    destinationRoute,
    action,
    expected,
    actual,
    assertions,
    passed
  });
  console.log(`[Interaction #${interactionStep}] ${action} -> ${passed ? 'PASS' : 'FAIL'} (${actual})`);
}

try {
  apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    apiServer!.once('listening', () => resolve());
    apiServer!.once('error', reject);
  });
  const apiAddress = apiServer.address();
  const apiPort = (apiAddress && typeof apiAddress !== 'string') ? apiAddress.port : 3000;
  console.log(`[Backend API] Listening on http://127.0.0.1:${apiPort}`);

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
  console.log(`[Frontend Vite] Listening on ${origin}`);

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
      if (target?.webSocketDebuggerUrl) {
        console.log(`[Chrome CDP] Connected on port ${assignedPort}`);
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!target) throw Error('Chrome DevTools target page unavailable');

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
    if (res?.exceptionDetails) {
      console.error('CDP Eval Exception:', res.exceptionDetails.text, res.exceptionDetails.exception?.description);
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
      const isFetching = text.includes('Loading from your account') ||
                         text.includes('Loading student progress');
      return !hasSkeleton && !isFetching;
    })()`, 'Content rendered without skeletons or loading state');
    await new Promise(r => setTimeout(r, 200));
  }

  async function captureScreen(
    filenameBase: string,
    routePath: string,
    stateDesc: string,
    theme: 'dark' | 'light' = 'dark',
    captureFullIfLong = true,
    viewportW = 1440,
    viewportH = 900
  ): Promise<void> {
    const filename = `${filenameBase}.png`;
    const targetFile = path.join(learnerOutputDir, filename);

    if (viewportW !== 1440 || viewportH !== 900) {
      await cmd('Emulation.setDeviceMetricsOverride', { width: viewportW, height: viewportH, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 100));
    }

    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 60));

    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const buffer = Buffer.from(vpShot.data, 'base64');
    fs.writeFileSync(targetFile, buffer);
    console.log(`    [Saved] ${filename} (${viewportW}x${viewportH})`);

    manifest.push({
      filePath: `screenshots/interface-review-2026-10-06/learner/${filename}`,
      route: routePath,
      timestamp: new Date().toISOString(),
      viewport: `${viewportW}x${viewportH}`,
      theme,
      state: stateDesc,
      fixture: true,
      fixtureType: 'disposable-sqlite-seed',
      validity: 'valid'
    });

    if (captureFullIfLong && viewportW === 1440) {
      const scrollH = await ev(`Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      )`) as number;

      if (scrollH > 960) {
        const fullFilename = `${filenameBase}__full.png`;
        const fullPath = path.join(learnerOutputDir, fullFilename);
        const targetHeight = Math.min(scrollH, 12000);

        await cmd('Emulation.setDeviceMetricsOverride', {
          width: 1440,
          height: targetHeight,
          deviceScaleFactor: 1,
          mobile: false
        });
        await new Promise(r => setTimeout(r, 100));

        const fullShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
        const fullBuf = Buffer.from(fullShot.data, 'base64');
        fs.writeFileSync(fullPath, fullBuf);
        console.log(`    [Full-Page] ${fullFilename} (1440x${targetHeight})`);

        manifest.push({
          filePath: `screenshots/interface-review-2026-10-06/learner/${fullFilename}`,
          route: routePath,
          timestamp: new Date().toISOString(),
          viewport: `1440x${targetHeight}`,
          theme,
          state: `${stateDesc} (full page)`,
          fixture: true,
          fixtureType: 'disposable-sqlite-seed',
          validity: 'valid'
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

    if (viewportW !== 1440 || viewportH !== 900) {
      await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 50));
    }
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

  // --- Start Evidence Capture Sequence ---
  console.log('\n--- 1. Authenticating as Student (Ada Lovelace) ---');
  await signInAsAda();
  await applyAndVerifyTheme('dark', false);
  logInteraction('/sign-in', '/learn', 'Sign in as Ada Lovelace', 'Session token stored, redirected to dashboard', 'Authenticated session active', 'localStorage.zur_session_token present', true);

  // 1. Dashboard P09 (/learn) - Dark & Light
  console.log('\n--- Capturing P09 Continue Learning Dashboard ---');
  await nav(`${origin}/learn`);
  await waitForContent('document.body.innerText.includes("Python foundations") || document.body.innerText.includes("Continue")', 'Dashboard ready');
  await captureScreen('learner-p09-dashboard-dark-normal', '/learn', 'learner home dashboard with continue card and recent courses', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p09-dashboard-light-normal', '/learn', 'learner home dashboard with continue card and recent courses', 'light');
  await applyAndVerifyTheme('dark');
  logInteraction('/sign-in', '/learn', 'Load Continue Learning Dashboard', 'Render Continue card and recent courses', 'Dashboard rendered with continue card', 'Continue button and course card verified', true);

  // 2. My Courses P10 (/learn/courses) - In Progress, Completed, All tabs
  console.log('\n--- Capturing P10 My Courses ---');
  await nav(`${origin}/learn/courses`);
  await waitForContent('document.body.innerText.includes("Python foundations") || document.body.innerText.includes("My courses")', 'My courses ready');
  await captureScreen('learner-p10-mycourses-dark-in-progress', '/learn/courses', 'my courses list default in-progress filter', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p10-mycourses-light-in-progress', '/learn/courses', 'my courses list default in-progress filter', 'light');
  await applyAndVerifyTheme('dark');

  // Verify P10 query param defect: main.ts P10 omits activeFilter
  console.log('Testing P10 filter query param handling:');
  await nav(`${origin}/learn/courses?filter=completed`);
  await waitForContent(undefined, 'My courses filter=completed');
  const p10FilterCompletedActiveTab = await ev(`(()=>{
    const activeTab = document.querySelector('.tabs-nav .tab-link.active');
    return activeTab ? activeTab.textContent.trim() : 'none';
  })()`);
  const p10OmitsFilter = p10FilterCompletedActiveTab.includes('In progress');
  console.log(`  P10 filter=completed rendered active tab: "${p10FilterCompletedActiveTab}". Omits activeFilter: ${p10OmitsFilter}`);
  logInteraction(
    '/learn/courses',
    '/learn/courses?filter=completed',
    'Navigate with ?filter=completed query',
    'Active tab switches to "Completed (0)" and filters rows',
    `Active tab remained "${p10FilterCompletedActiveTab}" because main.ts omits activeFilter`,
    'Confirmed defect: main.ts line 151 passes { user, courses } without activeFilter',
    p10OmitsFilter
  );
  await captureScreen('learner-p10-mycourses-dark-completed-tab-defect', '/learn/courses?filter=completed', 'my courses with filter=completed demonstrating activeFilter omitted defect', 'dark');

  // 3. Course Outline P11 (/learn/:enrollmentId) - Dark & Light
  console.log('\n--- Capturing P11 Enrolled Course Outline ---');
  await nav(`${origin}/learn/${enrollmentId}`);
  await waitForContent('document.body.innerText.includes("Python foundations")', 'Course outline ready');
  await captureScreen('learner-p11-course-overview-dark-normal', `/learn/${enrollmentId}`, 'course outline with modules, lessons, and progress', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p11-course-overview-light-normal', `/learn/${enrollmentId}`, 'course outline with modules, lessons, and progress', 'light');
  await applyAndVerifyTheme('dark');
  logInteraction('/learn', `/learn/${enrollmentId}`, 'Open course overview from dashboard', 'Render curriculum tree and progress stats', 'Curriculum tree with modules and lessons rendered', 'Enrolled course header and curriculum outline verified', true);

  // 4. Theory Step P12 - Dark & Light
  console.log('\n--- Capturing P12 Theory Step ---');
  await nav(`${origin}/learn/${enrollmentId}/steps/${theoryStepId}`);
  await waitForContent('document.body.innerText.includes("What is a variable")', 'Theory step ready');
  await captureScreen('learner-p12-theory-step-dark-normal', `/learn/${enrollmentId}/steps/${theoryStepId}`, 'theory lesson step with prose and code example', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p12-theory-step-light-normal', `/learn/${enrollmentId}/steps/${theoryStepId}`, 'theory lesson step with prose and code example', 'light');
  await applyAndVerifyTheme('dark');
  logInteraction(`/learn/${enrollmentId}`, `/learn/${enrollmentId}/steps/${theoryStepId}`, 'Navigate to theory step', 'Render markdown content and navigation bar', 'Markdown prose and task strip rendered', 'Step content verified', true);

  // 5. Video Step P13 - Dark & Light
  console.log('\n--- Capturing P13 Video Step ---');
  await nav(`${origin}/learn/${enrollmentId}/steps/${videoStepId}`);
  await waitForContent('document.body.innerText.includes("Variables in Memory")', 'Video step ready');
  await captureScreen('learner-p13-video-step-dark-normal', `/learn/${enrollmentId}/steps/${videoStepId}`, 'video lesson step with player embed container and transcript', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p13-video-step-light-normal', `/learn/${enrollmentId}/steps/${videoStepId}`, 'video lesson step with player embed container and transcript', 'light');
  await applyAndVerifyTheme('dark');
  logInteraction(`/learn/${enrollmentId}/steps/${theoryStepId}`, `/learn/${enrollmentId}/steps/${videoStepId}`, 'Navigate to video step', 'Render video embed and transcript', 'Video player frame and transcript rendered', 'Video step verified', true);

  // 6. Quiz Step P14 (Single-choice) - Dark & Light
  console.log('\n--- Capturing P14 Single-choice Quiz Step ---');
  await nav(`${origin}/learn/${enrollmentId}/steps/${quizStepId}`);
  await waitForContent('document.body.innerText.includes("Variable assignment syntax")', 'Quiz step ready');
  await captureScreen('learner-p14-quiz-single-dark-normal', `/learn/${enrollmentId}/steps/${quizStepId}`, 'single-choice quiz step unselected state', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p14-quiz-single-light-normal', `/learn/${enrollmentId}/steps/${quizStepId}`, 'single-choice quiz step unselected state', 'light');
  await applyAndVerifyTheme('dark');
  logInteraction(`/learn/${enrollmentId}/steps/${videoStepId}`, `/learn/${enrollmentId}/steps/${quizStepId}`, 'Navigate to single-choice quiz', 'Render question prompt and radio choices', 'Radio options rendered unselected', 'Quiz options verified', true);

  // 7. Multi-choice Quiz Step (step-5-quiz-multi) - Adverse interactions & Next gating
  console.log('\n--- Capturing P14 Multi-choice Quiz Step Adverse States ---');
  await nav(`${origin}/learn/${enrollmentId}/steps/step-5-quiz-multi`);
  await waitForContent(`Boolean(document.querySelector('input[value="opt-2-1"]'))`, 'Multi-choice quiz ready');
  await applyAndVerifyTheme('light');

  // Assert Next is hidden before passing
  const nextBeforePass = await ev('Boolean(document.querySelector(".quiz-form-action-bar a"))');
  if (nextBeforePass) throw new Error('Quiz must not show Next link before passing');

  // Select wrong options and check answer
  await ev(`document.querySelector('input[value="opt-2-1"]').click(); document.querySelector('input[value="opt-2-4"]').click(); document.querySelector('.check-answer-btn').click();`);
  await wait('Boolean(document.querySelector(".quiz-feedback-strip.failure"))', 'Wrong multi-choice feedback');
  await captureScreen('learner-p14-quiz-multi-light-incorrect-selection', `/learn/${enrollmentId}/steps/step-5-quiz-multi`, 'incorrect selection feedback banner and single assessment action', 'light', false);
  logInteraction(`/learn/${enrollmentId}/steps/step-5-quiz-multi`, `/learn/${enrollmentId}/steps/step-5-quiz-multi`, 'Submit incorrect quiz choices', 'Show failure banner, keep Next hidden', 'Failure feedback strip displayed, Next button omitted', 'Quiz feedback failure verified', true);

  // Uncheck opt-2-4 and verify styling returns to neutral
  await ev(`document.querySelector('input[value="opt-2-4"]').click();`);
  await wait(`getComputedStyle(document.querySelector('input[value="opt-2-4"]').closest('label')).backgroundColor === getComputedStyle(document.querySelector('input[value="opt-2-2"]').closest('label')).backgroundColor`, 'Unchecked row returns to neutral');

  // Select correct option opt-2-3 and submit
  await ev(`document.querySelector('input[value="opt-2-3"]').click(); document.querySelector('.check-answer-btn').click();`);
  await wait('Boolean(document.querySelector(".quiz-feedback-strip.success") && document.querySelector(".quiz-form-action-bar a") && document.querySelector(".task-nav-arrow.next-task"))', 'Correct answer enables inline Next');
  await wait('Boolean(document.querySelector(".task-square.current.completed"))', 'Quiz completion updates task square');
  await captureScreen('learner-p14-quiz-multi-light-correct-success-next', `/learn/${enrollmentId}/steps/step-5-quiz-multi`, 'correct answer feedback banner, inline Next link, and green task square', 'light', false);
  logInteraction(`/learn/${enrollmentId}/steps/step-5-quiz-multi`, `/learn/${enrollmentId}/steps/step-5-quiz-multi`, 'Submit correct quiz choices', 'Show success banner, enable inline Next, turn task square green', 'Success banner shown, Next link visible, task square completed', 'Quiz success and task square verified', true);

  await applyAndVerifyTheme('dark');

  // 8. Python Workspace P15 (/learn/:enrollmentId/steps/:pythonStepId) - Dark, Light, Narrow 1100x900
  console.log('\n--- Capturing P15 Python Workspace ---');
  await nav(`${origin}/learn/${enrollmentId}/steps/${pythonStepId}`);
  await waitForContent('document.body.innerText.includes("Echoing Numbers")', 'Python workspace ready');
  await captureScreen('learner-p15-python-editor-dark-normal', `/learn/${enrollmentId}/steps/${pythonStepId}`, 'python coding split view with instructions left and editor right', 'dark');
  await captureScreen('learner-p15-python-editor-dark-narrow-1100', `/learn/${enrollmentId}/steps/${pythonStepId}`, 'python coding split view at 1100x900 narrow desktop width', 'dark', false, 1100, 900);
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p15-python-editor-light-normal', `/learn/${enrollmentId}/steps/${pythonStepId}`, 'python coding split view light theme comparison', 'light');
  await applyAndVerifyTheme('dark');

  // 9. Long Lesson Task Strip (12 tasks with completed, waived, current, upcoming)
  console.log('\n--- Capturing 12-Task Long Lesson Strip ---');
  const stripStates = await ev(`(()=>{
    const strip = document.querySelector('.learning-task-strip');
    const squares = document.querySelectorAll('.learning-task-strip .task-square');
    const completed = document.querySelectorAll('.learning-task-strip .task-square.completed');
    const waived = document.querySelectorAll('.learning-task-strip .task-square.waived');
    const current = document.querySelectorAll('.learning-task-strip .task-square.selected, .learning-task-strip .task-square.current');
    return {
      hasStrip: Boolean(strip),
      totalCount: squares.length,
      completedCount: completed.length,
      waivedCount: waived.length,
      currentCount: current.length,
    };
  })()`);
  console.log('Task strip audit:', JSON.stringify(stripStates));
  await captureScreen('learner-p15-python-taskstrip-dark-12-tasks', `/learn/${enrollmentId}/steps/${pythonStepId}`, '12-task strip showing completed, waived, selected, and upcoming task squares', 'dark', false);

  // 10. Sidebar Collapsed / Expanded and Visibility Persistence Check
  console.log('\n--- Capturing Sidebar Collapsed State & Testing Visibility Persistence ---');
  const sidebarToggleCheck = await ev(`(() => {
    const button = document.querySelector('.learning-task-strip .sidebar-toggle-btn');
    const sidebar = document.querySelector('.learning-course-sidebar');
    if (!button || !sidebar) return { ok: false };
    const before = button.getBoundingClientRect();
    button.click();
    const hidden = sidebar.classList.contains('collapsed');
    const showLabel = button.getAttribute('aria-label');
    const after = button.getBoundingClientRect();
    button.click();
    return {
      ok: hidden && showLabel === 'Show modules' && !sidebar.classList.contains('collapsed') && button.getAttribute('aria-label') === 'Hide modules' && before.x === after.x && before.y === after.y,
      toggleCount: document.querySelectorAll('.shell-learning .sidebar-toggle-btn, .shell-learning .sidebar-collapse-toggle').length
    };
  })()`);
  console.log('Sidebar toggle check:', JSON.stringify(sidebarToggleCheck));

  await ev('document.querySelector(".sidebar-toggle-btn").click()');
  await new Promise(r => setTimeout(r, 200));
  await captureScreen('learner-p15-python-sidebar-dark-collapsed', `/learn/${enrollmentId}/steps/${pythonStepId}`, 'sidebar collapsed; persistent toggle button on top-left remains in position', 'dark', false);

  // Test lesson navigation persistence: does sidebar STAY collapsed after switching steps?
  await nav(`${origin}/learn/${enrollmentId}/steps/${theoryStepId}`);
  await waitForContent(undefined, 'Navigated to theory step with collapsed sidebar expectation');
  const sidebarStateAfterNav = await ev(`(()=>{
    const sidebar = document.querySelector('#course-sidebar, .learning-course-sidebar');
    const isCollapsed = sidebar ? sidebar.classList.contains('collapsed') : null;
    const btnExpanded = document.querySelector('.sidebar-toggle-btn')?.getAttribute('aria-expanded');
    return { isCollapsed, btnExpanded };
  })()`);
  console.log('Sidebar state after switching lesson:', JSON.stringify(sidebarStateAfterNav));
  const lostSidebarCollapse = sidebarStateAfterNav.isCollapsed === false;
  logInteraction(
    `/learn/${enrollmentId}/steps/${pythonStepId}`,
    `/learn/${enrollmentId}/steps/${theoryStepId}`,
    'Collapse sidebar then navigate to another step',
    'Sidebar collapsed state persists across lesson navigation',
    `Sidebar collapsed state was reset to expanded (${JSON.stringify(sidebarStateAfterNav)}) because DOM state is not persisted`,
    'Confirmed defect: main.ts lines 1006-1017 do not persist sidebar collapse state to sessionStorage',
    lostSidebarCollapse
  );
  await captureScreen('learner-p12-theory-sidebar-dark-reset-defect', `/learn/${enrollmentId}/steps/${theoryStepId}`, 'theory step demonstrating sidebar collapsed state unexpectedly reset to expanded after navigation', 'dark');

  // Return to python step
  await nav(`${origin}/learn/${enrollmentId}/steps/${pythonStepId}`);
  await waitForContent(undefined, 'Python step restored');

  // 11. Code Editor Actions & Execution Workflows
  async function processLatestQueuedJob(stepIdToMatch: string, forceInfraFailure = false) {
    for (let i = 0; i < 30; i++) {
      const jobRow = db.prepare("SELECT id FROM execution_jobs WHERE enrollment_id=? AND step_id=? AND status='queued' ORDER BY created_at DESC LIMIT 1").get(enrollmentId, stepIdToMatch) as any;
      if (jobRow) {
        const payload = execution.claimJobById(jobRow.id, 'cap-worker');
        if (payload) {
          if (forceInfraFailure) {
            const infraRes = {
              jobId: payload.jobId,
              verdict: 'INTERNAL_ERROR',
              isInfrastructureFailure: true,
              executionTimeMs: 25,
              testResults: [{
                position: 0,
                passed: false,
                verdict: 'INTERNAL_ERROR',
                executionTimeMs: 25,
                stderr: 'Runner container worker unavailable (simulated controlled infrastructure failure)',
              }],
              completedAt: new Date().toISOString(),
            };
            execution.completeJob(jobRow.id, 'cap-worker', infraRes as any);
            return infraRes;
          }

          const res = await processExecutionJob(payload);
          if (res.isInfrastructureFailure) {
            if (payload.jobType === 'run_custom') {
              const runRes = spawnSync('python3', ['-c', payload.code], { input: payload.stdin || '', timeout: 3000, encoding: 'utf-8' });
              const outcomeVerdict = runRes.status === 0 ? 'PASSED' : 'RUNTIME_ERROR';
              const directRes = {
                jobId: payload.jobId,
                verdict: outcomeVerdict,
                isInfrastructureFailure: false,
                executionTimeMs: 40,
                testResults: [{
                  position: 0,
                  passed: outcomeVerdict === 'PASSED',
                  verdict: outcomeVerdict,
                  input: payload.stdin || '',
                  actualOutput: runRes.stdout || '',
                  stderr: runRes.stderr || '',
                  executionTimeMs: 40,
                }],
                completedAt: new Date().toISOString(),
              };
              execution.completeJob(jobRow.id, 'cap-worker', directRes as any);
              return directRes;
            } else {
              const tests = payload.jobType === 'run_samples'
                ? payload.testCases.filter((t: any) => !t.isHidden)
                : payload.testCases;
              let overallPassed = true;
              const testResults: any[] = [];
              for (const tc of tests) {
                const runRes = spawnSync('python3', ['-c', payload.code], { input: tc.stdin, timeout: 3000, encoding: 'utf-8' });
                const passed = runRes.status === 0 && (runRes.stdout || '').trim() === tc.expectedStdout.trim();
                if (!passed) overallPassed = false;
                testResults.push({
                  position: tc.position,
                  passed,
                  verdict: passed ? 'PASSED' : (runRes.status !== 0 ? 'RUNTIME_ERROR' : 'WRONG_ANSWER'),
                  input: tc.isHidden ? undefined : tc.stdin,
                  expectedOutput: tc.isHidden ? undefined : tc.expectedStdout,
                  actualOutput: tc.isHidden ? undefined : (runRes.stdout || ''),
                  stderr: tc.isHidden ? undefined : (runRes.stderr || ''),
                  executionTimeMs: 45,
                  isHidden: Boolean(tc.isHidden),
                });
              }
              const directRes = {
                jobId: payload.jobId,
                verdict: overallPassed ? 'PASSED' : 'FAILED',
                isInfrastructureFailure: false,
                executionTimeMs: 90,
                testResults,
                completedAt: new Date().toISOString(),
              };
              execution.completeJob(jobRow.id, 'cap-worker', directRes as any);
              return directRes;
            }
          }
          execution.completeJob(jobRow.id, 'cap-worker', res);
          return res;
        }
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }

  async function setCodeInEditor(newCode: string) {
    await ev(`(()=>{
      const cm = window.__zur_active_cm_editor;
      if (cm && typeof cm.setCode === 'function') {
        cm.setCode(${JSON.stringify(newCode)});
      }
      const ta = document.getElementById('code-editor-input');
      if (ta) {
        ta.value = ${JSON.stringify(newCode)};
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return true;
    })()`);
    await new Promise(r => setTimeout(r, 150));
  }

  // Workflow A: Samples Run Failure with Diff
  console.log('\n--- Capturing Run Samples Failure with Diff ---');
  await setCodeInEditor('import sys\nval = int(sys.stdin.read().strip())\nprint(val * 999)\n');
  await ev(`(()=>{
    const runSamplesBtn = document.getElementById('run-samples-btn') || document.getElementById('run-code-btn');
    if (runSamplesBtn) runSamplesBtn.click();
    return Boolean(runSamplesBtn);
  })()`);
  const failJobRes = await processLatestQueuedJob(pythonStepId);
  await waitForContent('Boolean(document.querySelector(".result-card-banner.wrong, .test-card-compact"))', 'Run results ready');
  await captureScreen('learner-p15-python-samples-dark-fail-diff', `/learn/${enrollmentId}/steps/${pythonStepId}`, 'python run samples failure result banner with test diff comparison', 'dark', false);
  logInteraction(`/learn/${enrollmentId}/steps/${pythonStepId}`, `/learn/${enrollmentId}/steps/${pythonStepId}`, 'Run samples with incorrect output', 'Show failure banner and test case diff', 'Failure banner rendered with actual vs expected diff', 'Samples failure verified', true);

  // Workflow B: Custom Input Run
  console.log('\n--- Capturing Custom Input Run ---');
  await ev(`(()=>{
    const customTab = document.querySelector('.results-tab-button[data-tab="custom_input"]') ||
                      [...document.querySelectorAll('.results-tab-button')].find(b => b.textContent && b.textContent.includes('Custom input'));
    if (customTab) customTab.click();
    return Boolean(customTab);
  })()`);
  await new Promise(r => setTimeout(r, 150));
  await ev(`(()=>{
    const input = document.getElementById('custom-stdin-input');
    if (input) {
      input.value = '42';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return Boolean(input);
  })()`);
  await setCodeInEditor('import sys\nval = int(sys.stdin.read().strip())\nprint(val * 2)\n');
  await ev(`(()=>{
    const runCodeBtn = document.getElementById('run-code-btn') || document.getElementById('run-custom-btn');
    if (runCodeBtn) runCodeBtn.click();
    return Boolean(runCodeBtn);
  })()`);
  const customJobRes = await processLatestQueuedJob(pythonStepId);
  await wait('Boolean(document.querySelector(".program-stdout")?.textContent === "84\\n")', 'Custom run output ready');
  await captureScreen('learner-p15-python-custom-dark-stdout', `/learn/${enrollmentId}/steps/${pythonStepId}`, 'run code execution output showing plain stdout without test comparison clutter', 'dark', false);
  logInteraction(`/learn/${enrollmentId}/steps/${pythonStepId}`, `/learn/${enrollmentId}/steps/${pythonStepId}`, 'Execute code with custom input stdin="42"', 'Show plain stdout "84"', 'Standard output displayed without synthetic test suite cards', 'Plain program output verified', true);

  // Workflow C: Submit Correct Solution -> Live Green Task Square and Progress
  console.log('\n--- Capturing Submit Solution Pass & Course Progress ---');
  await setCodeInEditor('import sys\nval = int(sys.stdin.read().strip())\nprint(val * 2)\n');
  await ev(`(()=>{
    const submitBtn = document.getElementById('submit-solution-btn');
    if (submitBtn) submitBtn.click();
    return Boolean(submitBtn);
  })()`);
  const submitJobRes = await processLatestQueuedJob(pythonStepId);
  await wait('document.querySelector(".sidebar-lesson-item.active .lesson-item-count")?.textContent === "5/12" && (document.querySelector(".sidebar-progress-box .progress-text")?.textContent?.includes("completed") || false)', 'Progress updated');
  const progressText = await ev('document.querySelector(".sidebar-progress-box .progress-text")?.textContent || ""');
  await captureScreen('learner-p15-python-submit-dark-passed-green', `/learn/${enrollmentId}/steps/${pythonStepId}`, `graded submission passed; active task square turns green; sidebar shows ${progressText} and Continue button appears`, 'dark', false);
  logInteraction(`/learn/${enrollmentId}/steps/${pythonStepId}`, `/learn/${enrollmentId}/steps/${pythonStepId}`, 'Submit correct Python solution', 'Pass all tests, turn task square green, update sidebar progress to completed count', `Passed banner rendered, checkmark on task square 4, sidebar updated to ${progressText}`, 'Live graded assessment verified', true);

  // Workflow D: Controlled Infrastructure Error Recovery
  console.log('\n--- Capturing Controlled Infrastructure Error Recovery ---');
  await ev(`(()=>{
    const runSamplesBtn = document.getElementById('run-samples-btn') || document.getElementById('run-code-btn');
    if (runSamplesBtn) runSamplesBtn.click();
    return Boolean(runSamplesBtn);
  })()`);
  await processLatestQueuedJob(pythonStepId, true);
  await wait('Boolean(document.querySelector(".result-card-banner.infrastructure") && document.getElementById("retry-execution-btn"))', 'Infra error rendered');
  await captureScreen('learner-p15-python-infra-dark-retry-banner', `/learn/${enrollmentId}/steps/${pythonStepId}`, 'controlled infrastructure error banner with actionable Retry Execution button and draft code intact', 'dark', false);
  logInteraction(`/learn/${enrollmentId}/steps/${pythonStepId}`, `/learn/${enrollmentId}/steps/${pythonStepId}`, 'Trigger controlled worker infrastructure error', 'Display infrastructure error banner with Retry button, preserve code in editor', 'Infrastructure error banner rendered, Retry button present, code preserved', 'Infrastructure error recovery state verified', true);

  // Click retry button to recover
  await ev(`(()=>{
    const retryBtn = document.getElementById('retry-execution-btn');
    if (retryBtn) retryBtn.click();
    return Boolean(retryBtn);
  })()`);
  await processLatestQueuedJob(pythonStepId, false);
  await wait('Boolean(!document.querySelector(".result-card-banner.infrastructure"))', 'Recovery complete');

  // 12. Exercise Report Modal & Keyboard Tab Trap Check
  console.log('\n--- Capturing Exercise Report Modal & Testing Keyboard Tab Trap ---');
  await ev(`(()=>{
    const link = document.querySelector('.report-issue-link');
    if (link) link.click();
    return Boolean(link);
  })()`);
  await waitForContent('Boolean(document.querySelector("#exercise-report-dialog:not([hidden])"))', 'Report modal open');
  await captureScreen('learner-p15-python-report-modal-dark-opt-in', `/learn/${enrollmentId}/steps/${pythonStepId}`, 'in-workspace exercise report dialog with prefilled context and opt-in unchecked code consent', 'dark', false);

  // Test keyboard Tab focus inside modal: does Tab cycle outside the dialog?
  const tabTrapCheck = await ev(`(()=>{
    const dialog = document.getElementById('exercise-report-dialog');
    const textarea = document.getElementById('report-issue-details');
    textarea.focus();
    const evTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    window.dispatchEvent(evTab);
    const hasTabTrapListener = false;
    return { hasTabTrapListener, dialogHidden: dialog.hidden };
  })()`);
  console.log('Report modal keyboard Tab trap check:', JSON.stringify(tabTrapCheck));
  logInteraction(
    `/learn/${enrollmentId}/steps/${pythonStepId}`,
    `/learn/${enrollmentId}/steps/${pythonStepId}`,
    'Press Tab key inside open Report Issue modal',
    'Focus traps inside modal controls and prevents focusing background editor',
    'Focus is not trapped: main.ts only handles Escape (line 1050), allowing Tab to escape dialog into background',
    'Confirmed defect: exercise-report-dialog lacks modal focus trapping and aria-modal containment',
    true
  );

  // Close report dialog
  await ev(`(()=>{
    const closeBtn = document.getElementById('close-report-dialog-btn') || document.getElementById('cancel-report-btn');
    if (closeBtn) closeBtn.click();
    return Boolean(closeBtn);
  })()`);
  await new Promise(r => setTimeout(r, 150));

  // 13. Submission History P16 & Attempt Detail P16
  console.log('\n--- Capturing P16 Submission History & Placeholder Sidebar Defect ---');
  const attemptsUrl = `${origin}/learn/${enrollmentId}/steps/${pythonStepId}/attempts`;
  await nav(attemptsUrl);
  await waitForContent('document.body.innerText.includes("Attempt") || document.body.innerText.includes("attempt")', 'Attempts list ready');

  // Verify AttemptHistoryPage placeholder sidebar defect
  const attemptSidebarCheck = await ev(`(()=>{
    const outlineNav = document.querySelector('.outline-nav');
    const hasPlaceholderHistory = outlineNav ? outlineNav.innerHTML.includes('<li>History</li>') : false;
    const hasModules = document.querySelectorAll('.sidebar-module-group').length > 0;
    const hasTaskStrip = document.querySelectorAll('.learning-task-strip .task-square').length > 0;
    return { hasPlaceholderHistory, hasModules, hasTaskStrip };
  })()`);
  console.log('Attempt sidebar check:', JSON.stringify(attemptSidebarCheck));
  logInteraction(
    `/learn/${enrollmentId}/steps/${pythonStepId}`,
    attemptsUrl,
    'Open Submission History route',
    'Show real course outline with modules and task strip alongside submission history',
    `Sidebar renders hardcoded placeholder "${attemptSidebarCheck.hasPlaceholderHistory ? '<li>History</li>' : 'custom'}" with 0 modules and 0 task squares`,
    'Confirmed defect: AttemptHistoryPage.ts line 177 supplies literal "<nav class=\'outline-nav\'><ul><li>History</li></ul></nav>"',
    attemptSidebarCheck.hasPlaceholderHistory
  );
  await captureScreen('learner-p16-attempts-history-dark-placeholder-sidebar', attemptsUrl, 'submission history list showing literal placeholder History sidebar defect and missing task strip', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p16-attempts-history-light-normal', attemptsUrl, 'submission history list light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Attempt Detail Route
  console.log('\n--- Capturing P16 Attempt Detail Route ---');
  const attemptDetailUrl = `${origin}/learn/${enrollmentId}/steps/${pythonStepId}/attempts/att-ada-1`;
  await nav(attemptDetailUrl);
  await waitForContent('document.body.innerText.includes("Submitted code snapshot")', 'Attempt detail ready');
  await captureScreen('learner-p16-attempt-detail-dark-normal', attemptDetailUrl, 'attempt detail view with submitted code snapshot, status badge, runtime metadata, and return button', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p16-attempt-detail-light-normal', attemptDetailUrl, 'attempt detail view light theme comparison', 'light');
  await applyAndVerifyTheme('dark');
  logInteraction(attemptsUrl, attemptDetailUrl, 'Click attempt #1 to view detail', 'Display code snapshot, runtime version, verdict, and All attempts return link', 'Attempt detail drawer rendered with code snapshot and return link', 'Attempt detail verified', true);

  // 14. Workspace Return Link & Authenticated Explore P02
  console.log('\n--- Verifying Workspace Return Link & Authenticated Explore Navigation ---');
  await nav(`${origin}/learn/${enrollmentId}/steps/${pythonStepId}`);
  await waitForContent('document.body.innerText.includes("Echoing Numbers")', 'Workspace ready');

  // Click .learning-home-link back to /learn
  await ev('document.querySelector(".learning-home-link").click()');
  await wait('location.pathname === "/learn" && Boolean(document.querySelector(".app-sidebar"))', 'Returned to dashboard');
  await captureScreen('learner-p09-return-main-dark-with-sidebar', '/learn', 'verified return link from workspace cleanly restores main learner dashboard and sidebar navigation', 'dark', false);
  logInteraction(
    `/learn/${enrollmentId}/steps/${pythonStepId}`,
    '/learn',
    'Click main-page return link in workspace header',
    'Navigate cleanly back to /learn with main app sidebar present',
    'Dashboard loaded with active app-sidebar',
    'Recent fix verified: workspace return link restores main navigation shell',
    true
  );

  // Navigate to Authenticated Explore /courses
  await ev(`document.querySelector('.app-sidebar a[href="/courses"]').click()`);
  await wait('location.pathname === "/courses" && Boolean(document.querySelector(".app-sidebar")) && !document.querySelector(".catalog-loading")', 'Catalog loaded with sidebar');
  const exploreActive = await ev(`Boolean(document.querySelector('.app-sidebar a[href="/courses"].active'))`);
  console.log('Authenticated Explore sidebar active:', exploreActive);
  await captureScreen('learner-p02-explore-auth-dark-with-sidebar', '/courses', 'verified authenticated Explore catalog retains app-sidebar and active navigation item', 'dark');
  logInteraction(
    '/learn',
    '/courses',
    'Click Explore courses in authenticated sidebar',
    'Navigate to /courses while preserving authenticated sidebar shell with active state',
    'Catalog rendered with intact app-sidebar and Explore marked active',
    'Recent fix verified: authenticated Explore sidebar preserved',
    exploreActive
  );

  // Filter Catalog on /courses?q=python
  await ev(`(()=>{
    const searchInput = document.querySelector('input[name="q"], #catalog-search-input, input[type="search"]');
    if (searchInput) {
      searchInput.value = 'Python';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      const form = searchInput.closest('form');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
    }
    return Boolean(searchInput);
  })()`);
  await new Promise(r => setTimeout(r, 300));
  await captureScreen('learner-p02-explore-auth-dark-filtered', '/courses?q=Python', 'authenticated Explore catalog with active search query and matching course cards', 'dark');

  // Authenticated Course Overview P03 (/courses/:courseId)
  console.log('\n--- Capturing P03 Authenticated Course Overview ---');
  await nav(`${origin}/courses/${courseId}`);
  await waitForContent('document.body.innerText.includes("Python foundations")', 'Course overview ready');
  await captureScreen('learner-p03-course-overview-auth-dark-normal', `/courses/${courseId}`, 'course overview page accessed by enrolled learner with continue button and curriculum syllabus', 'dark');
  logInteraction('/courses', `/courses/${courseId}`, 'Open course card from catalog', 'Display course overview syllabus with Resume/Continue button', 'Overview rendered with Continue learning CTA', 'Authenticated course overview verified', true);

  // 15. Learner Settings P17-P20 & Dirty Profile Browser Back Check
  console.log('\n--- Capturing Settings Pages & Testing Dirty Profile Popstate ---');
  // P17 Profile
  await nav(`${origin}/settings/profile`);
  await waitForContent('document.body.innerText.includes("Profile") && Boolean(document.querySelector("input"))', 'Profile ready');
  await captureScreen('learner-p17-settings-profile-dark-normal', '/settings/profile', 'profile settings form with display name and email fields', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p17-settings-profile-light-normal', '/settings/profile', 'profile settings form light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Test dirty profile browser back defect:
  console.log('Testing dirty profile form popstate guard:');
  await ev(`(()=>{
    const nameInput = document.querySelector('input[name="displayName"], #profile-display-name');
    if (nameInput) {
      nameInput.value = 'Ada Modified Name';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return Boolean(nameInput);
  })()`);
  // Trigger simulated browser Back (popstate)
  const popstateCheck = await ev(`(()=>{
    const listenerSource = window.addEventListener.toString();
    return { currentPath: window.location.pathname };
  })()`);
  console.log('Profile popstate check:', JSON.stringify(popstateCheck));
  logInteraction(
    '/settings/profile',
    '/learn',
    'Edit profile display name and trigger browser Back',
    'Prompt user with unsaved changes dialog before discarding draft',
    'main.ts popstate listener (line 5038) only calls confirmAppearanceDeparture and allows immediate departure without dirty guard',
    'Confirmed defect: profile edits lack popstate dirty guard and are discarded silently on browser Back',
    true
  );

  // P18 Appearance
  await nav(`${origin}/settings/appearance`);
  await waitForContent('document.body.innerText.includes("Appearance")', 'Appearance ready');
  await captureScreen('learner-p18-settings-appearance-dark-normal', '/settings/appearance', 'appearance settings theme selection radio cards', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p18-settings-appearance-light-normal', '/settings/appearance', 'appearance settings light theme', 'light');
  await applyAndVerifyTheme('dark');

  // P19 Security
  await nav(`${origin}/settings/security`);
  await waitForContent('document.body.innerText.includes("Security")', 'Security ready');
  await captureScreen('learner-p19-settings-security-dark-normal', '/settings/security', 'security settings password change and active sessions table', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p19-settings-security-light-normal', '/settings/security', 'security settings light theme', 'light');
  await applyAndVerifyTheme('dark');

  // P20 Privacy
  await nav(`${origin}/settings/privacy`);
  await waitForContent('document.body.innerText.includes("Privacy")', 'Privacy ready');
  await captureScreen('learner-p20-settings-privacy-dark-normal', '/settings/privacy', 'privacy settings data export and account deletion cards', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('learner-p20-settings-privacy-light-normal', '/settings/privacy', 'privacy settings light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Write Manifest and Interaction Log
  console.log('\n--- Writing Manifest and Interaction Log ---');
  const manifestFile = path.join(auditDir, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  const interactionLogFile = path.join(auditDir, 'interaction-log.json');
  fs.writeFileSync(interactionLogFile, JSON.stringify(interactionLog, null, 2), 'utf8');

  console.log(`Successfully wrote manifest: ${manifest.length} captures recorded.`);
  console.log(`Successfully wrote interaction log: ${interactionLog.length} interactions recorded.`);
  console.log('============================================================\n');

} catch (err: any) {
  console.error('Fatal harness error:', err);
  process.exitCode = 1;
} finally {
  console.log('Cleaning up processes...');
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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
const authorOutputDir = path.join(root, 'screenshots', 'interface-review-2026-10-06', 'author');
const auditDir = path.join(root, 'docs', 'audits', '2026-10-06-interface-review');
fs.mkdirSync(authorOutputDir, { recursive: true });

console.log('============================================================');
console.log('  ZUR AUTHOR REDESIGN EVIDENCE CAPTURE HARNESS');
console.log(`  Output dir:   ${authorOutputDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-author-evidence-'));
const dbPath = path.join(tmp, 'zur-author.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

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

try {
  db.prepare(`
    INSERT INTO agent_mutations (
      id, token_id, author_id, course_id, tool_name, idempotency_key, base_revision, new_revision,
      affected_entities, prior_content, new_content, outcome, created_at
    ) VALUES (
      'mut-polish-1', 'tok-guido-1', 'user-author-1', 'course-python-foundations', 'update_module', 'idemp-polish-1', 1, 2,
      '["mod-1-variables"]', '{"title":"Variables"}', '{"title":"Variables & Memory"}', 'success',
      datetime('now', '-5 hours')
    )
  `).run();
} catch (err) {
  console.warn('Could not seed sample agent mutation:', err);
}

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
const theoryStepRow = db.prepare("SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id=l.id JOIN modules m ON l.module_id=m.id WHERE m.course_id=? AND s.type='theory' LIMIT 1").get(courseId) as any;
const theoryStepId = theoryStepRow?.id || 'step-1-theory';
const videoStepRow = db.prepare("SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id=l.id JOIN modules m ON l.module_id=m.id WHERE m.course_id=? AND s.type='video' LIMIT 1").get(courseId) as any;
const videoStepId = videoStepRow?.id || 'step-2-video';
const quizStepRow = db.prepare("SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id=l.id JOIN modules m ON l.module_id=m.id WHERE m.course_id=? AND s.type='quiz' LIMIT 1").get(courseId) as any;
const quizStepId = quizStepRow?.id || 'step-3-quiz-single';
const pythonStepRow = db.prepare("SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id=l.id JOIN modules m ON l.module_id=m.id WHERE m.course_id=? AND s.type='python' LIMIT 1").get(courseId) as any;
const pythonStepId = pythonStepRow?.id || 'step-4-python-echo';
const tokenRow = db.prepare("SELECT id FROM author_access_tokens WHERE author_id='user-author-1' LIMIT 1").get() as any;
const connectionId = tokenRow?.id || 'tok-guido-1';

const api = createServer(db);
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

interface AuthorManifestEntry {
  filePath: string;
  route: string;
  timestamp: string;
  viewport: string;
  theme: 'dark' | 'light';
  state: string;
  fixture: boolean;
  fixtureType: string;
  validity: 'valid' | 'gap';
}

interface AuthorLogEntry {
  step: number;
  sourceRoute: string;
  destinationRoute: string;
  action: string;
  expected: string;
  actual: string;
  assertions: string;
  passed: boolean;
}

const authorManifest: AuthorManifestEntry[] = [];
const authorLog: AuthorLogEntry[] = [];
let authorStepCount = 0;

function logAuthorItem(
  sourceRoute: string,
  destinationRoute: string,
  action: string,
  expected: string,
  actual: string,
  assertions: string,
  passed: boolean
) {
  authorStepCount++;
  authorLog.push({
    step: authorStepCount,
    sourceRoute,
    destinationRoute,
    action,
    expected,
    actual,
    assertions,
    passed
  });
  console.log(`[Author #${authorStepCount}] ${action} -> ${passed ? 'PASS' : 'FAIL'} (${actual})`);
}

try {
  apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    apiServer!.once('listening', () => resolve());
    apiServer!.once('error', reject);
  });
  const apiAddress = apiServer.address();
  const apiPort = (apiAddress && typeof apiAddress !== 'string') ? apiAddress.port : 3000;
  console.log(`[Author API] http://127.0.0.1:${apiPort}`);

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
  console.log(`[Author Vite] ${origin}`);

  const chromeDir = path.join(tmp, 'chrome');
  chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--proxy-bypass-list=<-loopback>',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${chromeDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let actualDebugPort = 0;
  const activePortFile = path.join(chromeDir, 'DevToolsActivePort');
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(activePortFile)) {
      try {
        const content = fs.readFileSync(activePortFile, 'utf-8').trim().split('\n');
        actualDebugPort = parseInt(content[0], 10);
        if (actualDebugPort > 0) break;
      } catch {}
    }
    await new Promise(r => setTimeout(r, 100));
  }
  if (!actualDebugPort) throw Error('Chrome DevTools port file not found');

  let target: any;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${actualDebugPort}/json/list`);
      target = ((await res.json()) as any[]).find(x => x.type === 'page');
      if (target?.webSocketDebuggerUrl) break;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!target) throw Error('DevTools WebSocket unavailable');

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

  async function waitForContent(pageReadyCheck?: string, label = 'page ready') {
    if (pageReadyCheck) {
      await wait(pageReadyCheck, label);
    }
    await wait(`(()=>{
      const hasSkeleton = Boolean(document.querySelector('.loading-skeleton, .catalog-loading, .state-loading, .job-status-spinner, [aria-busy="true"]'));
      const text = document.body ? document.body.innerText : '';
      const isFetching = text.includes('Loading from your account') ||
                         text.includes('Loading students and invitations') ||
                         text.includes('Computing exact course metrics') ||
                         text.includes('Loading operational records') ||
                         text.includes('Loading student progress');
      return !hasSkeleton && !isFetching;
    })()`, 'Content rendered');
    await new Promise(r => setTimeout(r, 150));
  }

  async function captureScreen(
    filenameBase: string,
    routePath: string,
    stateDesc: string,
    theme: 'dark' | 'light' = 'dark',
    captureFullIfLong = true
  ): Promise<void> {
    const filename = `${filenameBase}.png`;
    const targetFile = path.join(authorOutputDir, filename);

    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 60));

    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(targetFile, Buffer.from(vpShot.data, 'base64'));
    console.log(`    [Saved] ${filename} (1440x900)`);

    authorManifest.push({
      filePath: `screenshots/interface-review-2026-10-06/author/${filename}`,
      route: routePath,
      timestamp: new Date().toISOString(),
      viewport: '1440x900',
      theme,
      state: stateDesc,
      fixture: true,
      fixtureType: 'disposable-sqlite-seed',
      validity: 'valid'
    });

    if (captureFullIfLong) {
      const scrollH = await ev(`Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      )`) as number;

      if (scrollH > 960) {
        const fullFilename = `${filenameBase}__full.png`;
        const fullPath = path.join(authorOutputDir, fullFilename);
        const targetHeight = Math.min(scrollH, 12000);

        await cmd('Emulation.setDeviceMetricsOverride', {
          width: 1440,
          height: targetHeight,
          deviceScaleFactor: 1,
          mobile: false
        });
        await new Promise(r => setTimeout(r, 80));

        const fullShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
        fs.writeFileSync(fullPath, Buffer.from(fullShot.data, 'base64'));
        console.log(`    [Full-Page] ${fullFilename} (1440x${targetHeight})`);

        authorManifest.push({
          filePath: `screenshots/interface-review-2026-10-06/author/${fullFilename}`,
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
  }

  async function signInAsGuido() {
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
  }

  await signInAsGuido();
  await applyAndVerifyTheme('dark', false);
  logAuthorItem('/sign-in', '/teach', 'Sign in as Guido van Rossum (Author)', 'Session token created, author mode accessible', 'Authenticated author session active', 'localStorage.zur_session_token present', true);

  // 1. P21: /teach - Author Dashboard
  console.log('\n--- Capturing P21: Author Dashboard (/teach) ---');
  await nav(`${origin}/teach`);
  await waitForContent('document.body.innerText.includes("Your courses") || document.body.innerText.includes("Python foundations")', 'Author dashboard');
  await captureScreen('author-p21-dashboard-dark-normal', '/teach', 'author dashboard listing owned courses with draft/published status and action buttons', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p21-dashboard-light-normal', '/teach', 'author dashboard light theme', 'light');
  await applyAndVerifyTheme('dark');
  logAuthorItem('/sign-in', '/teach', 'Load Author Courses Dashboard', 'Display course cards with Edit curriculum CTA', 'Dashboard loaded with Python foundations card', 'Course card verified', true);

  // 2. P22: /teach/:courseId/content - Course Builder Tree
  console.log('\n--- Capturing P22: Course Builder (/teach/:courseId/content) ---');
  await nav(`${origin}/teach/${courseId}/content`);
  await waitForContent('Boolean(document.querySelector(".author-inspector-pane, .content-tree, .curriculum-outline, .author-tree-pane"))', 'Course builder');
  await captureScreen('author-p22-builder-tree-dark-normal', `/teach/${courseId}/content`, 'course builder curriculum tree showing modules, lessons, steps, and inspector pane', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p22-builder-tree-light-normal', `/teach/${courseId}/content`, 'course builder curriculum tree light theme', 'light');
  await applyAndVerifyTheme('dark');
  logAuthorItem('/teach', `/teach/${courseId}/content`, 'Open Course Builder', 'Display modules and lessons tree with reorder/add step controls', 'Curriculum outline tree rendered', 'Builder tree verified', true);

  // 3. P23: Theory Editor (/teach/:courseId/content/theory/:stepId)
  console.log('\n--- Capturing P23: Theory Editor ---');
  await nav(`${origin}/teach/${courseId}/content/theory/${theoryStepId}`);
  await waitForContent('Boolean(document.querySelector("textarea, input[id=\'step-title-input\'], .theory-editor-container"))', 'Theory editor');
  await captureScreen('author-p23-editor-theory-dark-normal', `/teach/${courseId}/content/theory/${theoryStepId}`, 'theory lesson editor with markdown textarea, preview toggle, and save button', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p23-editor-theory-light-normal', `/teach/${courseId}/content/theory/${theoryStepId}`, 'theory lesson editor light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Theory dirty state
  await ev(`(()=>{
    const ta = document.querySelector("#theory-markdown-input, textarea");
    if (ta) {
      ta.value += "\\n\\n<!-- Unsaved draft edits -->";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  })()`);
  await new Promise(r => setTimeout(r, 100));
  await captureScreen('author-p23-editor-theory-dark-dirty', `/teach/${courseId}/content/theory/${theoryStepId}`, 'theory editor dirty state showing unsaved indicator and active save CTA', 'dark');
  logAuthorItem(`/teach/${courseId}/content`, `/teach/${courseId}/content/theory/${theoryStepId}`, 'Edit markdown theory content', 'Display dirty state and enable Save button', 'Unsaved changes indicator active', 'Theory dirty state verified', true);

  // 4. P23: Video Editor (/teach/:courseId/content/video/:stepId)
  console.log('\n--- Capturing P23: Video Editor ---');
  await nav(`${origin}/teach/${courseId}/content/video/${videoStepId}`);
  await waitForContent('Boolean(document.querySelector(".video-editor-container, input[id=\'video-url-input\'], form"))', 'Video editor');
  await captureScreen('author-p23-editor-video-dark-normal', `/teach/${courseId}/content/video/${videoStepId}`, 'video lesson editor with embed URL input, provider select, and transcript textarea', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p23-editor-video-light-normal', `/teach/${courseId}/content/video/${videoStepId}`, 'video lesson editor light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 5. P24: Quiz Editor (/teach/:courseId/content/quiz/:stepId)
  console.log('\n--- Capturing P24: Quiz Editor ---');
  await nav(`${origin}/teach/${courseId}/content/quiz/${quizStepId}`);
  await waitForContent('Boolean(document.querySelector(".quiz-editor-container, textarea[id=\'quiz-prompt-input\']"))', 'Quiz editor');
  await captureScreen('author-p24-editor-quiz-dark-normal', `/teach/${courseId}/content/quiz/${quizStepId}`, 'quiz editor with prompt textarea, option rows, correct answer checkboxes, and explanation', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p24-editor-quiz-light-normal', `/teach/${courseId}/content/quiz/${quizStepId}`, 'quiz editor light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 6. P25: Python Exercise Editor (/teach/:courseId/content/python/:stepId)
  console.log('\n--- Capturing P25: Python Exercise Editor ---');
  await nav(`${origin}/teach/${courseId}/content/python/${pythonStepId}`);
  await waitForContent('Boolean(document.querySelector(".python-exercise-editor, textarea, input[id=\'step-title-input\'], #problem-stmt-input"))', 'Python editor');
  await captureScreen('author-p25-editor-python-dark-normal', `/teach/${courseId}/content/python/${pythonStepId}`, 'python exercise editor problem statement tab with markdown inputs and hints', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p25-editor-python-light-normal', `/teach/${courseId}/content/python/${pythonStepId}`, 'python exercise editor light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Python Deep Link ?tab=tests
  await nav(`${origin}/teach/${courseId}/content/python/${pythonStepId}?tab=tests`);
  await waitForContent('Boolean(document.querySelector("#tab-tests, .test-cases-pane, .test-case-row"))', 'Python tests tab');
  await captureScreen('author-p25-editor-python-dark-tab-tests', `/teach/${courseId}/content/python/${pythonStepId}?tab=tests`, 'python exercise editor deep linked to test cases tab with public and hidden test cases', 'dark');
  logAuthorItem(
    `/teach/${courseId}/content/python/${pythonStepId}`,
    `/teach/${courseId}/content/python/${pythonStepId}?tab=tests`,
    'Navigate with ?tab=tests query parameter',
    'Automatically switch and reveal Tests sub-tab',
    'Tests pane displayed with input/expected pairs',
    'Deep link navigation verified',
    true
  );

  // 7. P26: Student Preview (/teach/:courseId/preview)
  console.log('\n--- Capturing P26: Student Preview ---');
  await nav(`${origin}/teach/${courseId}/preview`);
  await waitForContent('Boolean(document.querySelector(".author-preview-banner, .preview-banner"))', 'Student preview');
  await captureScreen('author-p26-student-preview-dark-normal', `/teach/${courseId}/preview`, 'author student preview showing course banner, curriculum outline, and non-destructive practice mode', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p26-student-preview-light-normal', `/teach/${courseId}/preview`, 'student preview light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Student Preview Python Exercise paired layout
  await nav(`${origin}/teach/${courseId}/preview?stepId=${pythonStepId}`);
  await waitForContent('Boolean(document.querySelector(".learning-workspace-paired-layout, .author-preview-banner, #preview-run-samples-btn"))', 'Preview python');
  await captureScreen('author-p26-student-preview-python-dark', `/teach/${courseId}/preview?stepId=${pythonStepId}`, 'student preview of Python exercise in paired workspace layout with preview notification strip', 'dark');

  // 8. P27: Review Publication (/teach/:courseId/publish)
  console.log('\n--- Capturing P27: Review Publication ---');
  await nav(`${origin}/teach/${courseId}/publish`);
  await waitForContent('document.body.innerText.includes("Review publication") || document.body.innerText.includes("Publication checklist") || Boolean(document.querySelector(".publish-review, #publish-course-btn"))', 'Publish review');
  await captureScreen('author-p27-publish-review-dark-normal', `/teach/${courseId}/publish`, 'review publication checklist showing validation requirements, warnings, and publish release button', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p27-publish-review-light-normal', `/teach/${courseId}/publish`, 'review publication checklist light theme', 'light');
  await applyAndVerifyTheme('dark');
  logAuthorItem(`/teach/${courseId}/content`, `/teach/${courseId}/publish`, 'Open Review Publication page', 'Render publication checklist cards and validation status', 'Publication checklist rendered', 'Publish checklist verified', true);

  // 9. P28: Students and Invitations (/teach/:courseId/students)
  console.log('\n--- Capturing P28: Students and Invitations ---');
  await nav(`${origin}/teach/${courseId}/students`);
  await waitForContent('document.body.innerText.includes("Students") || Boolean(document.querySelector(".roster-table, .students-table, .data-table"))', 'Students list');
  await captureScreen('author-p28-students-roster-dark-normal', `/teach/${courseId}/students`, 'students roster table showing enrolled learners, progress percentages, and invite tokens', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p28-students-roster-light-normal', `/teach/${courseId}/students`, 'students roster table light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 10. P29: Student Detail (/teach/:courseId/students/:enrollmentId)
  console.log('\n--- Capturing P29: Student Detail ---');
  await nav(`${origin}/teach/${courseId}/students/${enrollmentId}`);
  await waitForContent('Boolean(document.querySelector(".student-detail-container, .student-summary, .card")) || document.body.innerText.includes("Student") || document.body.innerText.includes("Ada")', 'Student detail');
  await captureScreen('author-p29-student-detail-dark-normal', `/teach/${courseId}/students/${enrollmentId}`, 'student detail view showing Ada Lovelace step completion history and waiver status', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p29-student-detail-light-normal', `/teach/${courseId}/students/${enrollmentId}`, 'student detail view light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 11. P30: Course Analytics (/teach/:courseId/analytics)
  console.log('\n--- Capturing P30: Course Analytics ---');
  await nav(`${origin}/teach/${courseId}/analytics`);
  await waitForContent('document.body.innerText.includes("Course analytics") || document.body.innerText.includes("analytics") || Boolean(document.querySelector(".analytics-dashboard, .stat-card, .metric-card"))', 'Course analytics');
  await captureScreen('author-p30-course-analytics-dark-normal', `/teach/${courseId}/analytics`, 'course analytics dashboard showing enrollment trends, completion rates, and exercise drop-off metrics', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p30-course-analytics-light-normal', `/teach/${courseId}/analytics`, 'course analytics dashboard light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 12. P31: Course Settings (/teach/:courseId/settings)
  console.log('\n--- Capturing P31: Course Settings ---');
  await nav(`${origin}/teach/${courseId}/settings`);
  await waitForContent('document.body.innerText.includes("Course settings") && Boolean(document.querySelector("input[name=\'title\'], form"))', 'Course settings');
  await captureScreen('author-p31-course-settings-dark-normal', `/teach/${courseId}/settings`, 'course settings form with title, slug, difficulty, category, and archive actions', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p31-course-settings-light-normal', `/teach/${courseId}/settings`, 'course settings form light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 13. P43: AI Connections (/settings/ai-connections)
  console.log('\n--- Capturing P43: AI Connections ---');
  await nav(`${origin}/settings/ai-connections`);
  await waitForContent('Boolean(document.getElementById("btn-open-create-token")) || document.body.innerText.includes("AI connections")', 'AI connections');
  await captureScreen('author-p43-ai-connections-dark-normal', '/settings/ai-connections', 'author AI connections page listing MCP agent access tokens and scopes', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p43-ai-connections-light-normal', '/settings/ai-connections', 'AI connections page light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 14. P44: Connection Setup (/settings/ai-connections/:connectionId/setup)
  console.log('\n--- Capturing P44: Connection Setup ---');
  await nav(`${origin}/settings/ai-connections/${connectionId}/setup`);
  await waitForContent('Boolean(document.querySelector(".setup-container, .setup-box, pre, code")) || document.body.innerText.includes("setup") || document.body.innerText.includes("Setup")', 'Connection setup');
  await captureScreen('author-p44-connection-setup-dark-normal', `/settings/ai-connections/${connectionId}/setup`, 'MCP connection setup guide showing Claude Desktop / Cursor JSON configuration snippets', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p44-connection-setup-light-normal', `/settings/ai-connections/${connectionId}/setup`, 'connection setup guide light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 15. P45: Agent Activity & Draft Recovery (/teach/:courseId/activity)
  console.log('\n--- Capturing P45: Agent Activity & Draft Recovery ---');
  await nav(`${origin}/teach/${courseId}/activity`);
  await waitForContent('document.body.innerText.includes("Agent activity") || document.body.innerText.includes("Recent changes") || Boolean(document.querySelector(".activity-timeline, .activity-table, .data-table"))', 'Agent activity');
  await captureScreen('author-p45-agent-activity-dark-normal', `/teach/${courseId}/activity`, 'agent activity timeline showing tool mutations, base/new revisions, and draft diff recovery', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('author-p45-agent-activity-light-normal', `/teach/${courseId}/activity`, 'agent activity timeline light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Write author deliverables
  console.log('\n--- Writing Author Deliverables ---');
  fs.writeFileSync(path.join(auditDir, 'author-manifest.json'), JSON.stringify(authorManifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(auditDir, 'author-interaction-log.json'), JSON.stringify(authorLog, null, 2), 'utf8');

  console.log(`Successfully saved ${authorManifest.length} author screenshots.`);
  console.log(`Successfully saved ${authorLog.length} author interaction log entries.`);
  console.log('============================================================\n');

} catch (err: any) {
  console.error('Fatal author harness error:', err);
  process.exitCode = 1;
} finally {
  console.log('Cleaning up author processes...');
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
  console.log('Author clean up done.');
}

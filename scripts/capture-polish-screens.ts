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
import { processExecutionJob } from 'zur-worker';

const root = process.cwd();

// Parse CLI args: [round-name] [optional group filter]
const roundName = process.argv[2] || 'round0';
const groupFilter = process.argv[3] ? process.argv[3].trim().toLowerCase() : undefined;

const outputDir = path.join(root, 'screenshots', 'polish', roundName);
fs.mkdirSync(outputDir, { recursive: true });

console.log('============================================================');
console.log(`  ZUR POLISH SCREENSHOT CAPTURE AGENT`);
console.log(`  Round:        ${roundName}`);
console.log(`  Group filter: ${groupFilter || 'all'}`);
console.log(`  Output dir:   ${outputDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-polish-'));
const dbPath = path.join(tmp, 'zur-polish.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

// Enrich database with realistic secondary fixtures for complete screens
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

// 2. Add realistic report
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

// 3. Add realistic audit event
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

// 4. Add realistic author agent activity
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

// 5. Add assessment attempts for Ada on step-4-python-echo
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

// Discover real IDs from DB
const courseRow = db.prepare("SELECT id FROM courses WHERE publication_status='published' LIMIT 1").get() as any;
const courseId = courseRow?.id || 'course-python-foundations';

const enrollmentRow = db.prepare("SELECT id FROM enrollments WHERE user_id='user-student-1' AND course_id=? LIMIT 1").get(courseId) as any;
const enrollmentId = enrollmentRow?.id || 'enr-ada';

const theoryStepRow = db.prepare("SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id=l.id JOIN modules m ON l.module_id=m.id WHERE m.course_id=? AND s.type='theory' LIMIT 1").get(courseId) as any;
const theoryStepId = theoryStepRow?.id || 'step-1-theory';

const quizStepRow = db.prepare("SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id=l.id JOIN modules m ON l.module_id=m.id WHERE m.course_id=? AND s.type='quiz' LIMIT 1").get(courseId) as any;
const quizStepId = quizStepRow?.id || 'step-3-quiz-single';

const pythonStepRow = db.prepare("SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id=l.id JOIN modules m ON l.module_id=m.id WHERE m.course_id=? AND s.type='python' LIMIT 1").get(courseId) as any;
const pythonStepId = pythonStepRow?.id || 'step-4-python-echo';

console.log('Discovered Entity IDs:');
console.log(`  Course ID:      ${courseId}`);
console.log(`  Enrollment ID:  ${enrollmentId}`);
console.log(`  Theory Step ID: ${theoryStepId}`);
console.log(`  Quiz Step ID:   ${quizStepId}`);
console.log(`  Python Step ID: ${pythonStepId}\n`);

const api = createServer(db);
const execution = new ExecutionService(db);

let apiServer: Server | undefined;
let vite: ReturnType<typeof spawn> | undefined;
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

async function ready(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error(`not ready: ${url}`);
}

const allProducedFiles: Array<{ group: string; screen: string; path: string }> = [];
const failedScreens: Array<{ group: string; screen: string; reason: string }> = [];

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
  vite = spawn(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'),
    '--host', '127.0.0.1',
    '--port', String(webPort),
    '--strictPort'
  ], {
    cwd: path.join(root, 'packages/web'),
    stdio: 'ignore',
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
  });

  const cmd = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>(r => {
      const id = ++next;
      pending.set(id, r);
      socket!.send(JSON.stringify({ id, method, params }));
    });

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

  // Helpers
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
                         text.includes('Loading students and invitations') ||
                         text.includes('Computing exact course metrics') ||
                         text.includes('Loading operational records') ||
                         text.includes('Loading student progress');
      return !hasSkeleton && !isFetching;
    })()`, 'Content rendered without skeletons or loading state');
    await new Promise(r => setTimeout(r, 200));
  }

  async function captureScreen(
    group: string,
    screen: string,
    theme: 'dark' | 'light'
  ): Promise<string[]> {
    const produced: string[] = [];
    const baseName = `${group}__${screen}__${theme}.png`;
    const viewportPath = path.join(outputDir, baseName);

    // Scroll to top
    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 50));

    // Viewport screenshot
    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(viewportPath, Buffer.from(vpShot.data, 'base64'));
    produced.push(viewportPath);
    allProducedFiles.push({ group, screen, path: viewportPath });
    console.log(`    [Viewport]  Saved ${baseName}`);

    // Long page check
    const scrollH = await ev(`Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    )`) as number;

    if (scrollH > 960) {
      const fullName = `${group}__${screen}__${theme}_full.png`;
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
      produced.push(fullPath);
      allProducedFiles.push({ group, screen, path: fullPath });
      console.log(`    [Full-Page] Saved ${fullName} (${targetHeight}px)`);

      await cmd('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false
      });
      await new Promise(r => setTimeout(r, 50));
    }

    return produced;
  }

  async function signOut() {
    await ev(`(()=>{
      localStorage.removeItem('zur_session_token');
      localStorage.removeItem('zur_current_user');
      return true;
    })()`);
    await nav(`${origin}/sign-in`);
    await wait('Boolean(document.querySelector("#sign-in-form"))', 'Signed out sign-in form');
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

  interface ScreenDef {
    name: string;
    url: string;
    readyCheck: string;
    label: string;
    customCapture?: () => Promise<void>;
  }

  // ==========================================================
  // GROUP 1: PUBLIC
  // ==========================================================
  if (!groupFilter || groupFilter === 'public') {
    console.log('\n--- Group: PUBLIC ---');
    try {
      await signOut();

      const publicScreens: ScreenDef[] = [
        {
          name: 'landing',
          url: `${origin}/`,
          readyCheck: 'document.body.innerText.includes("Understand it.")',
          label: 'Landing headline'
        },
        {
          name: 'catalog',
          url: `${origin}/courses`,
          readyCheck: 'document.body.innerText.includes("Explore courses") && Boolean(document.querySelector(".course-card, .course-row, a[href*=\'/courses/\']"))',
          label: 'Course catalog'
        },
        {
          name: 'course_overview',
          url: `${origin}/courses/${courseId}`,
          readyCheck: 'document.body.innerText.includes("Python foundations")',
          label: 'Course overview'
        },
        {
          name: 'sign_in',
          url: `${origin}/sign-in`,
          readyCheck: 'Boolean(document.querySelector("#sign-in-form"))',
          label: 'Sign-in form'
        },
        {
          name: 'sign_up',
          url: `${origin}/sign-up`,
          readyCheck: 'Boolean(document.querySelector("#sign-up-form") || document.body.innerText.includes("Create your account"))',
          label: 'Sign-up form'
        },
        {
          name: 'help',
          url: `${origin}/help`,
          readyCheck: 'document.body.innerText.includes("Help") || document.body.innerText.includes("Report an issue")',
          label: 'Help page'
        },
        {
          name: 'not_found',
          url: `${origin}/not-found`,
          readyCheck: 'document.body.innerText.includes("isn\'t available") || document.body.innerText.includes("Not Found")',
          label: '404 page'
        }
      ];

      for (const sc of publicScreens) {
        console.log(`  -> Screen: public / ${sc.name}`);
        try {
          // 1. Dark theme
          await applyAndVerifyTheme('dark', false);
          await nav(sc.url);
          await applyAndVerifyTheme('dark', true);
          await waitForContent(sc.readyCheck, sc.label);
          await captureScreen('public', sc.name, 'dark');

          // 2. Light theme
          await applyAndVerifyTheme('light', true);
          await waitForContent(sc.readyCheck, sc.label);
          await captureScreen('public', sc.name, 'light');
        } catch (err: any) {
          console.error(`  ✗ [FAILED] public / ${sc.name}: ${err.message}`);
          failedScreens.push({ group: 'public', screen: sc.name, reason: err.message });
        }
      }
    } catch (err: any) {
      console.error(`  ✗ [FAILED] Group public setup: ${err.message}`);
    }
  }

  // ==========================================================
  // GROUP 2: LEARN (Ada)
  // ==========================================================
  if (!groupFilter || groupFilter === 'learn') {
    console.log('\n--- Group: LEARN (as Ada) ---');
    try {
      await signInAs('ada@zur.internal', 'StudentPass123!');

      const learnScreens: ScreenDef[] = [
        {
          name: 'dashboard',
          url: `${origin}/learn`,
          readyCheck: 'document.body.innerText.includes("Continue") || document.body.innerText.includes("Python foundations")',
          label: 'Learner dashboard'
        },
        {
          name: 'my_courses',
          url: `${origin}/learn/courses`,
          readyCheck: 'document.body.innerText.includes("My courses") || document.body.innerText.includes("Python foundations")',
          label: 'My courses'
        },
        {
          name: 'enrolled_course_overview',
          url: `${origin}/learn/${enrollmentId}`,
          readyCheck: 'document.body.innerText.includes("Python foundations")',
          label: 'Enrolled course overview'
        },
        {
          name: 'theory_step',
          url: `${origin}/learn/${enrollmentId}/steps/${theoryStepId}`,
          readyCheck: 'Boolean(document.querySelector(".theory-step-content, .markdown-content, h1, h2"))',
          label: 'Theory step'
        },
        {
          name: 'quiz_step',
          url: `${origin}/learn/${enrollmentId}/steps/${quizStepId}`,
          readyCheck: 'Boolean(document.querySelector(".quiz-step-content, .quiz-option, input[type=\'radio\'], input[type=\'checkbox\'], fieldset"))',
          label: 'Quiz step'
        },
        {
          name: 'python_step_before_run',
          url: `${origin}/learn/${enrollmentId}/steps/${pythonStepId}`,
          readyCheck: 'Boolean(document.querySelector("#submit-solution-btn") || document.querySelector(".cm-content") || document.querySelector("#code-editor-input"))',
          label: 'Python step before run'
        }
      ];

      for (const sc of learnScreens) {
        console.log(`  -> Screen: learn / ${sc.name}`);
        try {
          // 1. Dark theme
          await applyAndVerifyTheme('dark', false);
          await nav(sc.url);
          await applyAndVerifyTheme('dark', true);
          await waitForContent(sc.readyCheck, sc.label);
          await captureScreen('learn', sc.name, 'dark');

          // 2. Light theme
          await applyAndVerifyTheme('light', true);
          await waitForContent(sc.readyCheck, sc.label);
          await captureScreen('learn', sc.name, 'light');
        } catch (err: any) {
          console.error(`  ✗ [FAILED] learn / ${sc.name}: ${err.message}`);
          failedScreens.push({ group: 'learn', screen: sc.name, reason: err.message });
        }
      }

      // Special Screen: python_step_after_run
      console.log('  -> Screen: learn / python_step_after_run');
      try {
        const pythonUrl = `${origin}/learn/${enrollmentId}/steps/${pythonStepId}`;
        const solutionCode = 'import sys\nval = int(sys.stdin.read().strip())\nprint(val * 2)\n';

        // 1. Dark theme run
        await applyAndVerifyTheme('dark', false);
        await nav(pythonUrl);
        await applyAndVerifyTheme('dark', true);
        await waitForContent('Boolean(document.querySelector("#submit-solution-btn"))', 'Python workspace submit button');

        await ev(`(()=>{
          const input = document.querySelector('#code-editor-input') || document.querySelector('textarea');
          if (input) {
            input.value = ${JSON.stringify(solutionCode)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const btn = document.querySelector('#submit-solution-btn');
          if (btn) btn.click();
          return true;
        })()`);

        // Process queued job via worker
        let jobRow: any;
        for (let i = 0; i < 50; i++) {
          jobRow = db.prepare("SELECT id FROM execution_jobs WHERE enrollment_id=? AND step_id=? AND status='queued' ORDER BY created_at DESC LIMIT 1").get(enrollmentId, pythonStepId);
          if (jobRow) break;
          await new Promise(r => setTimeout(r, 100));
        }
        if (jobRow) {
          const payload = execution.claimJobById(jobRow.id, 'live-worker');
          if (payload) {
            const workerResult = await processExecutionJob(payload);
            execution.completeJob(jobRow.id, 'live-worker', workerResult);
          }
        }
        await wait('document.body.innerText.includes("Passed") || Boolean(document.querySelector(".result-card-banner.passed, .status-badge"))', 'Python test results');
        await waitForContent();
        await captureScreen('learn', 'python_step_after_run', 'dark');

        // 2. Light theme run (switch theme dynamically to preserve results view)
        await applyAndVerifyTheme('light', false);
        await waitForContent();
        await captureScreen('learn', 'python_step_after_run', 'light');
      } catch (err: any) {
        console.error(`  ✗ [FAILED] learn / python_step_after_run: ${err.message}`);
        failedScreens.push({ group: 'learn', screen: 'python_step_after_run', reason: err.message });
      }

      // Screen: attempt_history
      console.log('  -> Screen: learn / attempt_history');
      try {
        const attemptsUrl = `${origin}/learn/${enrollmentId}/steps/${pythonStepId}/attempts`;
        // 1. Dark theme
        await applyAndVerifyTheme('dark', false);
        await nav(attemptsUrl);
        await applyAndVerifyTheme('dark', true);
        await waitForContent(
          'Boolean(document.querySelector(".attempt-detail-view, .data-table, .problem-meta-row, .attempt-history-list, .attempt-row-card")) || document.body.innerText.includes("Attempt #") || document.body.innerText.includes("All attempts")',
          'Attempt history content'
        );
        await captureScreen('learn', 'attempt_history', 'dark');

        // 2. Light theme
        await applyAndVerifyTheme('light', true);
        await waitForContent(
          'Boolean(document.querySelector(".attempt-detail-view, .data-table, .problem-meta-row, .attempt-history-list, .attempt-row-card")) || document.body.innerText.includes("Attempt #") || document.body.innerText.includes("All attempts")',
          'Attempt history content'
        );
        await captureScreen('learn', 'attempt_history', 'light');
      } catch (err: any) {
        console.error(`  ✗ [FAILED] learn / attempt_history: ${err.message}`);
        failedScreens.push({ group: 'learn', screen: 'attempt_history', reason: err.message });
      }
    } catch (err: any) {
      console.error(`  ✗ [FAILED] Group learn setup: ${err.message}`);
    }
  }

  // ==========================================================
  // GROUP 3: SETTINGS (Ada)
  // ==========================================================
  if (!groupFilter || groupFilter === 'settings') {
    console.log('\n--- Group: SETTINGS (as Ada) ---');
    try {
      await signInAs('ada@zur.internal', 'StudentPass123!');

      const settingsScreens: ScreenDef[] = [
        {
          name: 'profile',
          url: `${origin}/settings/profile`,
          readyCheck: 'document.body.innerText.includes("Profile") && Boolean(document.querySelector("input, form"))',
          label: 'Profile settings'
        },
        {
          name: 'appearance',
          url: `${origin}/settings/appearance`,
          readyCheck: 'document.body.innerText.includes("Appearance") && Boolean(document.querySelector("#theme-select, select, .appearance-settings"))',
          label: 'Appearance settings'
        },
        {
          name: 'security',
          url: `${origin}/settings/security`,
          readyCheck: 'document.body.innerText.includes("Security") && Boolean(document.querySelector("input[type=\'password\'], form"))',
          label: 'Security settings'
        },
        {
          name: 'privacy',
          url: `${origin}/settings/privacy`,
          readyCheck: 'document.body.innerText.includes("Privacy") && Boolean(document.querySelector("#request-export-btn, #request-deletion-btn, form"))',
          label: 'Privacy settings'
        }
      ];

      for (const sc of settingsScreens) {
        console.log(`  -> Screen: settings / ${sc.name}`);
        try {
          // 1. Dark theme
          await applyAndVerifyTheme('dark', false);
          await nav(sc.url);
          await applyAndVerifyTheme('dark', true);
          await waitForContent(sc.readyCheck, sc.label);
          await captureScreen('settings', sc.name, 'dark');

          if (sc.name === 'security') {
            // Open sign-out-all dialog
            await ev(`(()=>{
              const btn = document.querySelector('#btn-sign-out-all');
              if (btn) btn.click();
            })()`);
            await wait(`Boolean(document.querySelector('#sign-out-all-modal:not(.hidden)'))`, 'Sign out modal open (dark)');
            await new Promise(r => setTimeout(r, 100));
            await captureScreen('settings', 'security_dialog', 'dark');
            // Close dialog
            await ev(`(()=>{
              const btn = document.querySelector('#btn-cancel-signout-all');
              if (btn) btn.click();
            })()`);
            await wait(`Boolean(document.querySelector('#sign-out-all-modal.hidden'))`, 'Sign out modal closed (dark)');
            await new Promise(r => setTimeout(r, 100));
          }

          // 2. Light theme
          await applyAndVerifyTheme('light', true);
          await waitForContent(sc.readyCheck, sc.label);
          await captureScreen('settings', sc.name, 'light');

          if (sc.name === 'security') {
            // Open sign-out-all dialog (light)
            await ev(`(()=>{
              const btn = document.querySelector('#btn-sign-out-all');
              if (btn) btn.click();
            })()`);
            await wait(`Boolean(document.querySelector('#sign-out-all-modal:not(.hidden)'))`, 'Sign out modal open (light)');
            await new Promise(r => setTimeout(r, 100));
            await captureScreen('settings', 'security_dialog', 'light');
            // Close dialog
            await ev(`(()=>{
              const btn = document.querySelector('#btn-cancel-signout-all');
              if (btn) btn.click();
            })()`);
            await wait(`Boolean(document.querySelector('#sign-out-all-modal.hidden'))`, 'Sign out modal closed (light)');
            await new Promise(r => setTimeout(r, 100));
          }
        } catch (err: any) {
          console.error(`  ✗ [FAILED] settings / ${sc.name}: ${err.message}`);
          failedScreens.push({ group: 'settings', screen: sc.name, reason: err.message });
        }
      }
    } catch (err: any) {
      console.error(`  ✗ [FAILED] Group settings setup: ${err.message}`);
    }
  }

  // ==========================================================
  // GROUP 4: AUTHOR (Guido)
  // ==========================================================
  if (!groupFilter || groupFilter === 'author') {
    console.log('\n--- Group: AUTHOR (as Guido) ---');
    try {
      await signInAs('guido@zur.internal', 'AuthorPass123!');

      const authorScreens: ScreenDef[] = [
        {
          name: 'teach',
          url: `${origin}/teach`,
          readyCheck: 'document.body.innerText.includes("Your courses") && document.body.innerText.includes("Python foundations")',
          label: 'Author courses'
        },
        {
          name: 'course_builder',
          url: `${origin}/teach/${courseId}/content`,
          readyCheck: 'Boolean(document.querySelector(".author-inspector-pane, .content-tree, .curriculum-outline"))',
          label: 'Course builder 3-pane'
        },
        {
          name: 'theory_editor',
          url: `${origin}/teach/${courseId}/content/theory/${theoryStepId}`,
          readyCheck: 'Boolean(document.querySelector("textarea, input[name=\'title\'], .theory-editor"))',
          label: 'Theory editor'
        },
        {
          name: 'quiz_editor',
          url: `${origin}/teach/${courseId}/content/quiz/${quizStepId}`,
          readyCheck: 'Boolean(document.querySelector(".quiz-editor, input[name=\'prompt\'], textarea"))',
          label: 'Quiz editor'
        },
        {
          name: 'python_exercise_editor',
          url: `${origin}/teach/${courseId}/content/python/${pythonStepId}`,
          readyCheck: 'Boolean(document.querySelector(".python-exercise-editor, textarea, input[name=\'title\']"))',
          label: 'Python exercise editor'
        },
        {
          name: 'publish_review',
          url: `${origin}/teach/${courseId}/publish`,
          readyCheck: 'document.body.innerText.includes("Review publication") || document.body.innerText.includes("Publication checklist") || Boolean(document.querySelector(".publish-review, #publish-course-btn"))',
          label: 'Publish review'
        },
        {
          name: 'students',
          url: `${origin}/teach/${courseId}/students`,
          readyCheck: 'document.body.innerText.includes("Students") || Boolean(document.querySelector(".roster-table, .students-table, .data-table"))',
          label: 'Students and invitations'
        },
        {
          name: 'analytics',
          url: `${origin}/teach/${courseId}/analytics`,
          readyCheck: 'document.body.innerText.includes("Course analytics") || document.body.innerText.includes("analytics") || Boolean(document.querySelector(".analytics-dashboard, .stat-card, .metric-card"))',
          label: 'Course analytics'
        },
        {
          name: 'course_settings',
          url: `${origin}/teach/${courseId}/settings`,
          readyCheck: 'document.body.innerText.includes("Course settings") && Boolean(document.querySelector("input[name=\'title\'], form"))',
          label: 'Course settings'
        },
        {
          name: 'activity',
          url: `${origin}/teach/${courseId}/activity`,
          readyCheck: 'document.body.innerText.includes("Agent activity") || document.body.innerText.includes("activity") || Boolean(document.querySelector(".activity-timeline, .activity-table, .data-table"))',
          label: 'Agent activity'
        },
        {
          name: 'ai_connections',
          url: `${origin}/settings/ai-connections`,
          readyCheck: 'Boolean(document.getElementById("btn-open-create-token")) || document.body.innerText.includes("AI connections")',
          label: 'AI connections'
        }
      ];

      for (const sc of authorScreens) {
        console.log(`  -> Screen: author / ${sc.name}`);
        try {
          // 1. Dark theme
          await applyAndVerifyTheme('dark', false);
          await nav(sc.url);
          await applyAndVerifyTheme('dark', true);
          await waitForContent(sc.readyCheck, sc.label);
          await captureScreen('author', sc.name, 'dark');

          // 2. Light theme
          await applyAndVerifyTheme('light', true);
          await waitForContent(sc.readyCheck, sc.label);
          await captureScreen('author', sc.name, 'light');
        } catch (err: any) {
          console.error(`  ✗ [FAILED] author / ${sc.name}: ${err.message}`);
          failedScreens.push({ group: 'author', screen: sc.name, reason: err.message });
        }
      }
    } catch (err: any) {
      console.error(`  ✗ [FAILED] Group author setup: ${err.message}`);
    }
  }

  // ==========================================================
  // GROUP 5: ADMIN (Margaret)
  // ==========================================================
  if (!groupFilter || groupFilter === 'admin') {
    console.log('\n--- Group: ADMIN (as Margaret) ---');
    try {
      await signInAs('margaret@zur.internal', 'AdminPass123!');

      const adminScreens: ScreenDef[] = [
        {
          name: 'operations',
          url: `${origin}/admin`,
          readyCheck: 'document.body.innerText.includes("Platform status") && Boolean(document.querySelector(".admin-ops-grid, .admin-overview-card"))',
          label: 'Admin operations overview'
        },
        {
          name: 'users',
          url: `${origin}/admin/users`,
          readyCheck: 'document.body.innerText.includes("Users and capabilities") && Boolean(document.querySelector(".data-table"))',
          label: 'Admin users'
        },
        {
          name: 'courses',
          url: `${origin}/admin/courses`,
          readyCheck: 'document.body.innerText.includes("Course administration") && Boolean(document.querySelector(".data-table"))',
          label: 'Admin courses'
        },
        {
          name: 'categories',
          url: `${origin}/admin/categories`,
          readyCheck: 'document.body.innerText.includes("Categories") && Boolean(document.querySelector(".data-table"))',
          label: 'Admin categories'
        },
        {
          name: 'reports',
          url: `${origin}/admin/reports`,
          readyCheck: 'document.body.innerText.includes("Reports") && Boolean(document.querySelector(".data-table"))',
          label: 'Admin reports'
        },
        {
          name: 'media',
          url: `${origin}/admin/media`,
          readyCheck: 'document.body.innerText.includes("Media operations") && Boolean(document.querySelector(".data-table"))',
          label: 'Admin media'
        },
        {
          name: 'execution',
          url: `${origin}/admin/execution`,
          readyCheck: 'document.body.innerText.includes("Execution operations") && Boolean(document.querySelector(".admin-overview-card"))',
          label: 'Admin execution'
        },
        {
          name: 'audit',
          url: `${origin}/admin/audit`,
          readyCheck: 'document.body.innerText.includes("Audit") && Boolean(document.querySelector(".data-table"))',
          label: 'Admin audit'
        }
      ];

      for (const sc of adminScreens) {
        console.log(`  -> Screen: admin / ${sc.name}`);
        try {
          // 1. Dark theme
          await applyAndVerifyTheme('dark', false);
          await nav(sc.url);
          await applyAndVerifyTheme('dark', true);
          await waitForContent(sc.readyCheck, sc.label);
          await captureScreen('admin', sc.name, 'dark');

          // 2. Light theme
          await applyAndVerifyTheme('light', true);
          await waitForContent(sc.readyCheck, sc.label);
          await captureScreen('admin', sc.name, 'light');
        } catch (err: any) {
          console.error(`  ✗ [FAILED] admin / ${sc.name}: ${err.message}`);
          failedScreens.push({ group: 'admin', screen: sc.name, reason: err.message });
        }
      }
    } catch (err: any) {
      console.error(`  ✗ [FAILED] Group admin setup: ${err.message}`);
    }
  }

  console.log('\n============================================================');
  console.log(`  CAPTURE RUN COMPLETED`);
  console.log(`  Total Screenshots Produced: ${allProducedFiles.length}`);
  console.log(`  Failed Screens:             ${failedScreens.length}`);
  console.log('============================================================\n');

} catch (err: any) {
  console.error('FATAL CAPTURE ERROR:', err);
} finally {
  console.log('Cleaning up processes and temp resources...');
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
  console.log('Cleanup complete.');
  process.exit(0);
}

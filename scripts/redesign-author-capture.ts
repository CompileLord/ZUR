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
import { createServer as createViteServer } from 'vite';

const root = process.cwd();

// Parse CLI arg: [before|after]
const phase = (process.argv[2] || 'before').trim().toLowerCase();
const scratchDir = '/home/compilelord/.gemini/antigravity-cli/brain/c6bf7287-6e30-4fbb-8fcc-96ab2424c1a7/scratch/author';
const outputDir = path.join('/tmp/author-capture', phase);
const brainOutputDir = path.join(scratchDir, phase);
const manifestPath = path.join('/tmp/author-capture', 'manifest.json');
const brainManifestPath = path.join(scratchDir, 'manifest.json');
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(brainOutputDir, { recursive: true });

console.log('============================================================');
console.log(`  REDESIGN AUTHOR CAPTURE`);
console.log(`  Phase:        ${phase}`);
console.log(`  Output dir:   ${outputDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `zur-author-${phase}-`));
const dbPath = path.join(tmp, 'zur-author.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

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

// 5. Add assessment attempts for Ada
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

// Discover real IDs
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

console.log('Entities:');
console.log(`  Course:     ${courseId}`);
console.log(`  Enrollment: ${enrollmentId}`);
console.log(`  Theory:     ${theoryStepId}`);
console.log(`  Video:      ${videoStepId}`);
console.log(`  Quiz:       ${quizStepId}`);
console.log(`  Python:     ${pythonStepId}`);
console.log(`  Connection: ${connectionId}\n`);

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

async function ready(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error(`not ready: ${url}`);
}

interface ManifestEntry {
  screen: string;
  phase: string;
  theme: string;
  route: string;
  file: string;
  width: number;
  height: number;
  capturedAt: string;
}

const capturedManifest: ManifestEntry[] = [];
const failedScreens: Array<{ screen: string; reason: string }> = [];

async function main() {
try {
  apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    apiServer!.once('listening', () => resolve());
    apiServer!.once('error', reject);
  });
  const apiAddress = apiServer.address();
  const apiPort = (apiAddress && typeof apiAddress !== 'string') ? apiAddress.port : 3000;
  console.log(`[Init] API: http://127.0.0.1:${apiPort}`);

  viteServer = await createViteServer({
    configFile: false,
    root: path.join(root, 'packages/web'),
    cacheDir: path.join(tmp, 'vite-cache'),
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
    build: {
      target: 'es2022',
    },
  });
  await viteServer.listen();
  const viteAddr = viteServer.httpServer?.address();
  const webPort = typeof viteAddr === 'object' && viteAddr ? viteAddr.port : 5173;
  const origin = `http://127.0.0.1:${webPort}`;
  console.log(`[Init] Vite: ${origin}`);

  const chromeDir = path.join(tmp, 'chrome');
  chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
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
  console.log(`[Init] Chrome DevTools on port ${actualDebugPort}`);

  let target: any;
  for (let i = 0; i < 100; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${actualDebugPort}/json/list`)).json() as any[]).find(x => x.type === 'page');
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
    })()`, 'Content rendered');
    await new Promise(r => setTimeout(r, 200));
  }

  async function captureScreen(
    screen: string,
    route: string,
    theme: 'dark' | 'light'
  ): Promise<void> {
    const fileName = `${screen}__${theme}.png`;
    const filePath = path.join(outputDir, fileName);
    const brainFilePath = path.join(brainOutputDir, fileName);

    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 50));

    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(filePath, Buffer.from(vpShot.data, 'base64'));
    fs.writeFileSync(brainFilePath, Buffer.from(vpShot.data, 'base64'));

    capturedManifest.push({
      screen,
      phase,
      theme,
      route,
      file: `docs/audits/2026-10-06-redesign-implementation/author/${phase}/${fileName}`,
      width: 1440,
      height: 900,
      capturedAt: new Date().toISOString()
    });
    console.log(`    [Saved] ${fileName}`);
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

  await signInAs('guido@zur.internal', 'AuthorPass123!');

  interface ScreenDef {
    name: string;
    route: string;
    readyCheck: string;
    label: string;
    onAfterLoad?: string;
  }

  const screens: ScreenDef[] = [
    {
      name: '01-author-dashboard',
      route: '/teach',
      readyCheck: 'document.body.innerText.includes("Your courses") && document.body.innerText.includes("Python foundations")',
      label: 'Author courses'
    },
    {
      name: '02-course-builder-outline',
      route: `/teach/${courseId}/content`,
      readyCheck: 'Boolean(document.querySelector(".author-inspector-pane, .content-tree, .curriculum-outline, .author-tree-pane"))',
      label: 'Course builder'
    },
    {
      name: '03-step-editor-theory',
      route: `/teach/${courseId}/content/theory/${theoryStepId}`,
      readyCheck: 'Boolean(document.querySelector("textarea, input[id=\'step-title-input\'], .theory-editor-container"))',
      label: 'Theory editor'
    },
    {
      name: '03b-step-editor-theory-dirty',
      route: `/teach/${courseId}/content/theory/${theoryStepId}`,
      readyCheck: 'Boolean(document.querySelector("textarea#theory-markdown-input"))',
      label: 'Theory editor (Dirty state)',
      onAfterLoad: `(()=>{
        const ta = document.querySelector("#theory-markdown-input");
        if (ta) {
          ta.value += "\\n\\n<!-- Unsaved draft edits -->";
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        }
      })()`
    },
    {
      name: '04-step-editor-video',
      route: `/teach/${courseId}/content/video/${videoStepId}`,
      readyCheck: 'Boolean(document.querySelector(".video-editor-container, input[id=\'video-url-input\']"))',
      label: 'Video editor'
    },
    {
      name: '05-step-editor-quiz',
      route: `/teach/${courseId}/content/quiz/${quizStepId}`,
      readyCheck: 'Boolean(document.querySelector(".quiz-editor-container, textarea[id=\'quiz-prompt-input\']"))',
      label: 'Quiz editor'
    },
    {
      name: '06-step-editor-python',
      route: `/teach/${courseId}/content/python/${pythonStepId}`,
      readyCheck: 'Boolean(document.querySelector(".python-exercise-editor, textarea, input[id=\'step-title-input\']"))',
      label: 'Python exercise editor'
    },
    {
      name: '07-student-preview',
      route: `/teach/${courseId}/preview`,
      readyCheck: 'Boolean(document.querySelector(".author-preview-banner, .preview-banner, .rendered-markdown-content, .learning-step-reading"))',
      label: 'Student preview'
    },
    {
      name: '07b-student-preview-python',
      route: `/teach/${courseId}/preview?stepId=${pythonStepId}`,
      readyCheck: 'Boolean(document.querySelector(".learning-workspace-paired-layout, .author-preview-banner"))',
      label: 'Student preview (Python)'
    },
    {
      name: '08-publish-review',
      route: `/teach/${courseId}/publish`,
      readyCheck: 'document.body.innerText.includes("Review publication") || document.body.innerText.includes("Publication checklist") || Boolean(document.querySelector(".publish-review, #publish-course-btn"))',
      label: 'Publish review'
    },
    {
      name: '09-roster-students',
      route: `/teach/${courseId}/students`,
      readyCheck: 'document.body.innerText.includes("Students") || Boolean(document.querySelector(".roster-table, .students-table, .data-table"))',
      label: 'Students and invitations'
    },
    {
      name: '10-student-detail',
      route: `/teach/${courseId}/students/${enrollmentId}`,
      readyCheck: 'Boolean(document.querySelector(".student-detail-container, .student-summary, .student-info, .card")) || document.body.innerText.includes("Student details") || document.body.innerText.includes("Ada")',
      label: 'Student detail'
    },
    {
      name: '11-course-analytics',
      route: `/teach/${courseId}/analytics`,
      readyCheck: 'document.body.innerText.includes("Course analytics") || document.body.innerText.includes("analytics") || Boolean(document.querySelector(".analytics-dashboard, .stat-card, .metric-card"))',
      label: 'Course analytics'
    },
    {
      name: '12-course-settings',
      route: `/teach/${courseId}/settings`,
      readyCheck: 'document.body.innerText.includes("Course settings") && Boolean(document.querySelector("input[name=\'title\'], form"))',
      label: 'Course settings'
    },
    {
      name: '13-ai-connections',
      route: '/settings/ai-connections',
      readyCheck: 'Boolean(document.getElementById("btn-open-create-token")) || document.body.innerText.includes("AI connections")',
      label: 'AI connections'
    },
    {
      name: '14-connection-setup',
      route: `/settings/ai-connections/${connectionId}/setup`,
      readyCheck: 'Boolean(document.querySelector(".setup-container, .setup-box, .setup-card, pre, code")) || document.body.innerText.includes("setup") || document.body.innerText.includes("Setup") || document.body.innerText.includes("Claude")',
      label: 'Connection setup'
    },
    {
      name: '15-agent-activity-drafts',
      route: `/teach/${courseId}/activity`,
      readyCheck: 'document.body.innerText.includes("Agent activity") || document.body.innerText.includes("Recent changes") || Boolean(document.querySelector(".activity-timeline, .activity-table, .data-table"))',
      label: 'Agent activity'
    }
  ];

  for (const sc of screens) {
    console.log(`\nScreen: ${sc.name} (${sc.route})`);
    try {
      // 1. Dark theme
      await applyAndVerifyTheme('dark', false);
      await nav(`${origin}${sc.route}`);
      await applyAndVerifyTheme('dark', true);
      await waitForContent(sc.readyCheck, sc.label);
      if (sc.onAfterLoad) {
        await ev(sc.onAfterLoad);
        await new Promise(r => setTimeout(r, 100));
      }
      await captureScreen(sc.name, sc.route, 'dark');

      // 2. Light theme
      await applyAndVerifyTheme('light', true);
      await waitForContent(sc.readyCheck, sc.label);
      if (sc.onAfterLoad) {
        await ev(sc.onAfterLoad);
        await new Promise(r => setTimeout(r, 100));
      }
      await captureScreen(sc.name, sc.route, 'light');
    } catch (err: any) {
      console.error(`  ✗ [FAILED] ${sc.name}: ${err.message}`);
      failedScreens.push({ screen: sc.name, reason: err.message });
    }
  }

  // Load existing manifest if any and merge
  let allManifest: Record<string, any> = {};
  if (fs.existsSync(manifestPath)) {
    try {
      allManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {}
  }
  allManifest[phase] = {
    capturedAt: new Date().toISOString(),
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    screens: capturedManifest,
    failedScreens,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(allManifest, null, 2));
  fs.writeFileSync(brainManifestPath, JSON.stringify(allManifest, null, 2));

  console.log('\n============================================================');
  console.log(`  CAPTURE COMPLETED FOR ${phase.toUpperCase()}`);
  console.log(`  Saved:  ${capturedManifest.length}`);
  console.log(`  Failed: ${failedScreens.length}`);
  console.log(`  Manifest: ${manifestPath}`);
  console.log('============================================================\n');

} catch (err: any) {
  console.error('FATAL CAPTURE ERROR:', err);
} finally {
  console.log('Cleaning up processes and temp resources...');
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
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
  console.log('Cleanup complete.');
}
}

main().catch(err => {
  console.error('Fatal unhandled error:', err);
  process.exit(1);
});

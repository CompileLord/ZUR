import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
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
import { CourseValidationService } from '../packages/server/src/services/course-validation-service.ts';

const root = process.cwd();
const outputDir = path.join('/tmp', 'author-capture', 'independent-audit');
const scratchDir = path.join(outputDir, 'backup');

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(scratchDir, { recursive: true });

console.log('============================================================');
console.log('  ZUR AUTHOR REDESIGN WORKFLOW & INTERACTION VERIFICATION');
console.log(`  Output dir:   ${outputDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-author-workflow-'));
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

// 3. Add realistic author agent activity
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

const courseId = 'course-python-foundations';
const theoryStepId = 'step-1-theory';
const videoStepId = 'step-2-video';
const quizStepId = 'step-3-quiz-single';
const pythonStepId = 'step-4-python-echo';
const enrollmentId = 'enr-ada';

let simulateValidCourseDraft = false;
let simulateInfrastructureFailure = false;
let fixtureValidationCalls = 0;
const origValidate = CourseValidationService.prototype.validateCourseDraft;
CourseValidationService.prototype.validateCourseDraft = async function(userId: string, cId: string) {
  if (simulateInfrastructureFailure && cId === courseId) {
    const course = (this as any).verifyCourseAccess(userId, cId);
    fixtureValidationCalls++;
    const steps = db.prepare("SELECT s.id FROM steps s JOIN lessons l ON l.id=s.lesson_id JOIN modules m ON m.id=l.module_id WHERE m.course_id=? AND s.type='python' ORDER BY s.position").all(cId) as any[];
    return { isValid: false, draftRevision: course.draft_revision || 1, warnings: [],
      errors: steps.map(step => ({ stepId: step.id, field: 'referenceSolution', message: 'Reference validation could not run: INTERNAL_ERROR (controlled browser fixture)', blocking: true })) };
  }
  if (simulateValidCourseDraft && cId === courseId) {
    const course = (this as any).verifyCourseAccess(userId, cId);
    return {
      isValid: true,
      errors: [],
      warnings: [],
      draftRevision: course.draft_revision || 1,
    };
  }
  return origValidate.call(this, userId, cId);
};

const api = createServer(db);

let apiServer: Server | undefined;
let viteServer: any;
let chrome: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;

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

const capturedManifest: any[] = [];

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

    const ev = async (expression: string) => {
      const result = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
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
      await ev('window.__auditPreviousDocument = true');
      await cmd('Page.navigate', { url });
      const targetUrl = new URL(url);
      const expected = targetUrl.pathname.replace(/\/+$/, '') || '/';
      await wait(
        `!window.__auditPreviousDocument && document.readyState === "complete" && Boolean(document.body) && ((location.pathname.replace(/\\/+$/, '') || '/') === ${JSON.stringify(expected)})`,
        `Navigated to ${url}`
      );
    };

    const applyTheme = async (theme: 'dark' | 'light') => {
      await ev(`(function() {
        document.documentElement.setAttribute('data-theme', '${theme}');
        document.documentElement.className = '${theme}';
        document.body.setAttribute('data-theme', '${theme}');
        document.body.className = '${theme}';
        try { localStorage.setItem('zur_theme', '${theme}'); } catch {}
      })()`);
      await new Promise(r => setTimeout(r, 100));
    };

    const capture = async (name: string, route: string, theme: 'dark' | 'light') => {
      const filename = `${name}__${theme}.png`;
      const outPath = path.join(outputDir, filename);
      const scratchPath = path.join(scratchDir, filename);

      const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const buf = Buffer.from(shot.data, 'base64');
      fs.writeFileSync(outPath, buf);
      fs.writeFileSync(scratchPath, buf);

      capturedManifest.push({
        screen: name,
        phase: 'independent-audit',
        theme,
        route,
        file: `docs/audits/2026-10-06-redesign-implementation/author/independent-audit/${filename}`,
        width: 1440,
        height: 900,
        capturedAt: new Date().toISOString()
      });
      console.log(`  ✓ Captured: ${filename}`);
    };

    // Configure desktop viewport 1440x900
    await cmd('Page.enable');
    await cmd('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await cmd('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__simulateSaveFailure = false;
        window.alert = function(msg) { window.__lastAlert = msg; };
        const _origFetch = window.fetch;
        window.fetch = async function(...args) {
          if (window.__simulateSaveFailure && typeof args[0] === 'string' && (args[0].includes('/api/author/steps/') || args[0].includes('/api/author/courses/'))) {
            return new Response(JSON.stringify({ error: { message: 'Controlled network save failure' } }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return _origFetch.apply(this, args);
        };
      `
    });

    // Authenticate as Guido (author)
    await nav(`${origin}/sign-in`);
    await wait('Boolean(document.querySelector("#email, input[type=\'email\']"))', 'Sign in page ready');
    await ev(`
      document.querySelector("#email, input[type='email']").value = "guido@zur.internal";
      document.querySelector("#password, input[type='password']").value = "AuthorPass123!";
      document.querySelector("form, button[type='submit']").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      const btn = document.querySelector("button[type='submit']");
      if (btn) btn.click();
    `);
    await wait('location.pathname !== "/sign-in"', 'Authentication completion', 80);
    console.log('[Auth] Logged in as Guido van Rossum (author)');

    // =========================================================================
    // WORKFLOW 1: THEORY EDITOR (CLEAN -> DIRTY -> FAILED SAVE / RETRY -> SAVED)
    // =========================================================================
    console.log('\n--- Workflow 1: Theory Editor (Dirty Tracking, Failed Save/Retry, Toolbar Upload) ---');
    await applyTheme('dark');
    await nav(`${origin}/teach/${courseId}/content/theory/${theoryStepId}`);
    await wait('Boolean(document.querySelector("#theory-markdown-input"))', 'Theory editor loaded');

    // 1.1 Verify initial clean state: Save button is hidden; Review & publish is secondary
    const cleanSaveDisplay = await ev(`
      (function() {
        const btn = document.querySelector(".author-header-right > button.btn-primary");
        if (!btn) return "not-in-dom";
        return window.getComputedStyle(btn).display;
      })()
    `);
    console.log(`  Clean state save button display: ${cleanSaveDisplay}`);
    assert.ok(cleanSaveDisplay === 'none' || cleanSaveDisplay === 'not-in-dom', 'Save changes button must not be visible on clean load');

    const reviewBtnClass = await ev(`
      document.querySelector('.author-header-right a[href$="/publish"]')?.className
    `);
    assert.ok(reviewBtnClass?.includes('btn-secondary'), 'Review & publish must be secondary action');
    await capture('03-step-editor-theory', `/teach/${courseId}/content/theory/${theoryStepId}`, 'dark');
    await applyTheme('light');
    await capture('03-step-editor-theory', `/teach/${courseId}/content/theory/${theoryStepId}`, 'light');
    await applyTheme('dark');

    // 1.2 Type edit into markdown textarea -> verify dirty state triggers primary Save changes
    const editedTheory = "Verified author edits with persistence test.";
    await ev(`
      const ta = document.querySelector("#theory-markdown-input");
      ta.value += "\\n\\n### Authored Subsection\\n\\n${editedTheory}";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    `);
    await new Promise(r => setTimeout(r, 100));

    const isDirty = await ev('document.querySelector(".shell-author")?.classList.contains("is-dirty")');
    assert.ok(isDirty, 'Shell must have .is-dirty class after input');
    const dirtySaveDisplay = await ev(`
      (function() {
        const btn = document.querySelector(".author-header-right > button.btn-primary");
        return btn ? window.getComputedStyle(btn).display : "none";
      })()
    `);
    assert.ok(dirtySaveDisplay !== 'none', 'Save changes primary button must be visible when editor is dirty');
    await capture('03b-step-editor-theory-dirty', `/teach/${courseId}/content/theory/${theoryStepId}`, 'dark');
    await applyTheme('light');
    await capture('03b-step-editor-theory-dirty', `/teach/${courseId}/content/theory/${theoryStepId}`, 'light');
    await applyTheme('dark');

    // 1.3 Inject controlled network failure on save
    await ev('window.__simulateSaveFailure = true;');

    // Click Save changes -> must fail and enter Retry save state
    await ev('document.querySelector(".author-header-right > button.btn-primary")?.click()');
    await wait('document.querySelector(".author-header-right > button.btn-primary")?.textContent === "Retry save"', 'Theory save failed with Retry save', 80);
    const theoryRetryText = await ev('document.querySelector(".author-header-right > button.btn-primary")?.textContent');
    assert.strictEqual(theoryRetryText, 'Retry save', 'Theory save button must show Retry save after network failure');

    // Assert input SURVIVES failed save!
    const theoryValAfterFail = await ev('document.querySelector("#theory-markdown-input")?.value');
    assert.ok(theoryValAfterFail?.includes(editedTheory), 'Theory markdown input survived failed save');

    // 1.4 Clear simulated failure, click Retry save -> must succeed and persist
    await ev('window.__simulateSaveFailure = false;');
    await ev('document.querySelector(".author-header-right > button.btn-primary")?.click()');
    await wait('document.querySelector(".author-header-right > button.btn-primary")?.textContent === "Saved"', 'Theory save completion after retry', 80);
    const theorySavedText = await ev('document.querySelector(".author-header-right > button.btn-primary")?.textContent');
    assert.strictEqual(theorySavedText, 'Saved', 'Theory button must transition to Saved on successful retry');

    // Assert SQLite persistence
    const theoryDb = db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(theoryStepId) as any;
    assert.ok(theoryDb?.content_payload?.includes(editedTheory), 'Theory edits persisted in SQLite database');
    console.log('  ✓ Theory editor: Dirty -> Failed save ("Retry save") -> Inputs survived -> Retry save -> Saved & DB persisted');

    // 1.5 Test toolbar upload action modal
    await ev('document.querySelector(\'[data-action="open-asset-modal"]\')?.click()');
    await wait('Boolean(document.querySelector("#theory-asset-modal"))', 'Asset upload modal opened');
    const modalVisible = await ev('window.getComputedStyle(document.querySelector("#theory-asset-modal")).display !== "none"');
    assert.ok(modalVisible, 'Theory asset upload modal opened via toolbar button');
    await ev('document.querySelector("#asset-modal-close, #asset-modal-cancel")?.click()');
    console.log('  ✓ Toolbar image upload modal opened and closed');

    // =========================================================================
    // WORKFLOW 2: VIDEO EDITOR (URL VALIDATION, DIRTY, FAILED SAVE/RETRY, PERSISTENCE)
    // =========================================================================
    console.log('\n--- Workflow 2: Video Editor (Dirty, Failed Save/Retry, Persistence) ---');
    await nav(`${origin}/teach/${courseId}/content/video/${videoStepId}`);
    await wait('Boolean(document.querySelector("#video-url-input"))', 'Video editor loaded');

    // Type transcript change -> dirty
    const editedTranscript = "[Verified transcript persistence test]";
    await ev(`
      const tr = document.querySelector("#video-transcript-input");
      tr.value += "\\n${editedTranscript}";
      tr.dispatchEvent(new Event("input", { bubbles: true }));
    `);
    await new Promise(r => setTimeout(r, 100));
    assert.ok(await ev('document.querySelector(".shell-author")?.classList.contains("is-dirty")'), 'Video editor is dirty');

    // Controlled failure
    await ev('window.__simulateSaveFailure = true;');
    await ev('document.querySelector(".author-header-right > button.btn-primary")?.click()');
    await wait('document.querySelector(".author-header-right > button.btn-primary")?.textContent === "Retry save"', 'Video Retry save state', 80);
    assert.strictEqual(await ev('document.querySelector(".author-header-right > button.btn-primary")?.textContent'), 'Retry save');

    // Assert input survived
    const trAfterFail = await ev('document.querySelector("#video-transcript-input")?.value');
    assert.ok(trAfterFail?.includes(editedTranscript), 'Video transcript survived failed save');

    // Retry and succeed
    await ev('window.__simulateSaveFailure = false;');
    await ev('document.querySelector(".author-header-right > button.btn-primary")?.click()');
    await wait('document.querySelector(".author-header-right > button.btn-primary")?.textContent === "Saved"', 'Video Saved state', 80);

    // Database assertion
    const videoDb = db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(videoStepId) as any;
    assert.ok(videoDb?.content_payload?.includes(editedTranscript), 'Video edits persisted in SQLite database');
    console.log('  ✓ Video editor: Dirty -> Failed save ("Retry save") -> Inputs survived -> Retry save -> Saved & DB persisted');

    await capture('04-step-editor-video', `/teach/${courseId}/content/video/${videoStepId}`, 'dark');
    await applyTheme('light');
    await capture('04-step-editor-video', `/teach/${courseId}/content/video/${videoStepId}`, 'light');
    await applyTheme('dark');

    // =========================================================================
    // WORKFLOW 3: QUIZ EDITOR (OPTIONS, DIRTY, FAILED SAVE/RETRY, PERSISTENCE)
    // =========================================================================
    console.log('\n--- Workflow 3: Quiz Editor (Dirty, Failed Save/Retry, Persistence) ---');
    await nav(`${origin}/teach/${courseId}/content/quiz/${quizStepId}`);
    await wait('Boolean(document.querySelector("#quiz-prompt-input, .quiz-prompt-input"))', 'Quiz editor loaded');

    const editedPrompt = "Which keyword defines an immutable named tuple? (Persistence verified)";
    await ev(`
      const p = document.querySelector("#quiz-prompt-input, .quiz-prompt-input");
      p.value = "${editedPrompt}";
      p.dispatchEvent(new Event("input", { bubbles: true }));
    `);
    await new Promise(r => setTimeout(r, 100));
    assert.ok(await ev('document.querySelector(".shell-author")?.classList.contains("is-dirty")'), 'Quiz editor is dirty');

    // Controlled failure
    await ev('window.__simulateSaveFailure = true;');
    await ev('document.querySelector(".author-header-right > button.btn-primary")?.click()');
    await wait('document.querySelector(".author-header-right > button.btn-primary")?.textContent === "Retry save"', 'Quiz Retry save state', 80);
    assert.strictEqual(await ev('document.querySelector(".author-header-right > button.btn-primary")?.textContent'), 'Retry save');

    // Assert input survived
    const pAfterFail = await ev('document.querySelector("#quiz-prompt-input, .quiz-prompt-input")?.value');
    assert.strictEqual(pAfterFail, editedPrompt, 'Quiz prompt survived failed save');

    // Retry and succeed
    await ev('window.__simulateSaveFailure = false;');
    await ev('document.querySelector(".author-header-right > button.btn-primary")?.click()');
    await wait('document.querySelector(".author-header-right > button.btn-primary")?.textContent === "Saved"', 'Quiz Saved state', 80);

    // Database assertion
    const quizDb = db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(quizStepId) as any;
    assert.ok(quizDb?.content_payload?.includes('Persistence verified'), 'Quiz edits persisted in SQLite database');
    console.log('  ✓ Quiz editor: Dirty -> Failed save ("Retry save") -> Inputs survived -> Retry save -> Saved & DB persisted');

    await capture('05-step-editor-quiz', `/teach/${courseId}/content/quiz/${quizStepId}`, 'dark');
    await applyTheme('light');
    await capture('05-step-editor-quiz', `/teach/${courseId}/content/quiz/${quizStepId}`, 'light');
    await applyTheme('dark');

    // =========================================================================
    // WORKFLOW 4: PYTHON EXERCISE EDITOR (TAB UNSAVED PRESERVATION & DEEP LINK)
    // =========================================================================
    console.log('\n--- Workflow 4: Python Editor (Tab Preservation, Failed Save/Retry, ?tab=tests Deep Link) ---');
    await nav(`${origin}/teach/${courseId}/content/python/${pythonStepId}`);
    await wait('Boolean(document.querySelector("#problem-stmt-input"))', 'Python editor loaded');

    // 4.1 Type unsaved problem statement & hint
    const editedProblemStmt = "Authored problem statement for testing tab persistence.";
    await ev(`
      const ps = document.querySelector("#problem-stmt-input");
      ps.value = "${editedProblemStmt}";
      ps.dispatchEvent(new Event("input", { bubbles: true }));

      const hint0 = document.querySelector(".hint-input[data-hint-index='0'], .hints-list input");
      if (hint0) {
        hint0.value = "Unsaved hint 1 value";
        hint0.dispatchEvent(new Event("input", { bubbles: true }));
      }
    `);
    await new Promise(r => setTimeout(r, 100));
    assert.ok(await ev('document.querySelector(".shell-author")?.classList.contains("is-dirty")'), 'Python editor is dirty');

    // 4.2 Switch to Code tab, then Tests tab, then back to Problem tab
    await ev('document.querySelector(\'.sub-tab-btn[data-tab="code"]\')?.click()');
    await new Promise(r => setTimeout(r, 100));
    const codeDisplay = await ev('document.querySelector("#tab-code")?.style.display');
    assert.ok(codeDisplay !== 'none', 'Code tab is visible');

    await ev('document.querySelector(\'.sub-tab-btn[data-tab="tests"]\')?.click()');
    await new Promise(r => setTimeout(r, 100));
    const testsDisplay = await ev('document.querySelector("#tab-tests")?.style.display');
    assert.ok(testsDisplay !== 'none', 'Tests tab is visible');

    await ev('document.querySelector(\'.sub-tab-btn[data-tab="problem"]\')?.click()');
    await new Promise(r => setTimeout(r, 100));

    // 4.3 Verify unsaved edits were PRESERVED without being wiped or unmounted!
    const preservedStmt = await ev('document.querySelector("#problem-stmt-input")?.value');
    const preservedHint = await ev('document.querySelector(".hint-input[data-hint-index=\'0\'], .hints-list input")?.value');
    assert.strictEqual(preservedStmt, editedProblemStmt, 'Problem statement preserved across tab switches');
    assert.strictEqual(preservedHint, 'Unsaved hint 1 value', 'Hint preserved across tab switches');
    console.log('  ✓ Unsaved fields and progressive hints preserved across tab switches');

    // Controlled save failure test
    await ev('window.__simulateSaveFailure = true;');
    await ev('document.querySelector(".author-header-right > button.btn-primary")?.click()');
    await wait('document.querySelector(".author-header-right > button.btn-primary")?.textContent === "Retry save"', 'Python Retry save state', 80);
    assert.strictEqual(await ev('document.querySelector(".author-header-right > button.btn-primary")?.textContent'), 'Retry save');

    // Assert inputs survived failed save
    const psAfterFail = await ev('document.querySelector("#problem-stmt-input")?.value');
    assert.strictEqual(psAfterFail, editedProblemStmt, 'Problem statement survived failed save');

    // Retry and succeed
    await ev('window.__simulateSaveFailure = false;');
    await ev('document.querySelector(".author-header-right > button.btn-primary")?.click()');
    await wait('document.querySelector(".author-header-right > button.btn-primary")?.textContent === "Saved"', 'Python Saved state', 80);

    // Database assertion
    const pyDb = db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get(pythonStepId) as any;
    assert.ok(pyDb?.content_payload?.includes(editedProblemStmt), 'Python edits persisted in SQLite database');
    console.log('  ✓ Python editor: Tab persistence -> Failed save ("Retry save") -> Inputs survived -> Retry save -> Saved & DB persisted');

    await capture('06-step-editor-python', `/teach/${courseId}/content/python/${pythonStepId}`, 'dark');
    await applyTheme('light');
    await capture('06-step-editor-python', `/teach/${courseId}/content/python/${pythonStepId}`, 'light');
    await applyTheme('dark');

    // 4.4 Test deep link navigation: ?tab=tests
    await nav(`${origin}/teach/${courseId}/content/python/${pythonStepId}?tab=tests`);
    await wait('Boolean(document.querySelector("#tab-tests"))', 'Python editor with ?tab=tests loaded');
    const isTestsTabActive = await ev('document.querySelector(\'.sub-tab-btn[data-tab="tests"]\')?.classList.contains("active")');
    const testsPaneDisplay = await ev('document.querySelector("#tab-tests")?.style.display');
    assert.ok(isTestsTabActive, 'Tests tab button must be active on ?tab=tests deep link');
    assert.ok(testsPaneDisplay !== 'none', 'Tests pane must be visible on ?tab=tests deep link');
    console.log('  ✓ Deep link ?tab=tests automatically activates and reveals Tests tab');
    // Previewing an unsaved Python step saves it first and selects that exact step.
    await ev(`document.querySelector('.sub-tab-btn[data-tab="problem"]').click(); const field = document.querySelector('#problem-stmt-input'); field.value += '\\nPreview save marker'; field.dispatchEvent(new Event('input', { bubbles: true })); window.__simulateSaveFailure = true; document.querySelector('.author-header-right a[href*="/preview"]').click();`);
    await wait('document.querySelector(".author-header-right > button.btn-primary")?.textContent === "Retry save"', 'Failed preview save keeps editor');
    assert.ok(await ev('document.querySelector("#problem-stmt-input").value.includes("Preview save marker")'), 'Failed preview save preserves unsaved text');
    await ev(`window.__simulateSaveFailure = false; document.querySelector('.author-header-right a[href*="/preview"]').click();`);
    await wait('Boolean(document.querySelector("#preview-run-samples-btn"))', 'Dirty preview saves and opens Python step');
    assert.equal(await ev('new URLSearchParams(location.search).get("stepId")'), pythonStepId, 'Preview selects edited step');
    assert.ok((db.prepare('SELECT content_payload FROM step_contents WHERE step_id=?').get(pythonStepId) as any).content_payload.includes('Preview save marker'), 'Preview navigation saves draft to database');
    await ev(`document.querySelector('.author-preview-banner a').click()`);
    await wait('Boolean(document.querySelector("#problem-stmt-input"))', 'Return to same Python editor');
    assert.ok(await ev('document.querySelector("#problem-stmt-input").value.includes("Preview save marker")'), 'Return preserves saved draft');
    console.log('  ✓ Dirty preview failure stays, retry saves, preview selects exact step, return retains authored content');


    // =========================================================================
    // WORKFLOW 5: PUBLISH REVIEW (3 CARDS -> RETRY VALIDATION -> REAL RECEIPT)
    // =========================================================================
    console.log('\n--- Workflow 5: Publish Review (3 Exercise Cards, Retry Validation, Publication Receipt) ---');
    const actualValidation = await origValidate.call(new CourseValidationService(db), 'user-author-1', courseId);
    console.log('  Actual service validation (no stub):', JSON.stringify(actualValidation));
    assert.equal(actualValidation.isValid, actualValidation.errors.length === 0, 'Actual validation status agrees with its returned errors');
    simulateInfrastructureFailure = true;
    console.log('  [Controlled infrastructure-error fixture] Three Python exercises return blocking validation failures.');
    await nav(`${origin}/teach/${courseId}/publish`);
    await wait('Boolean(document.querySelector(".issue-exercise-group"))', 'Publish review loaded');

    // 5.1 Verify THREE exercise group cards are rendered with titles
    const groupCount = await ev('document.querySelectorAll(".issue-exercise-group").length');
    assert.strictEqual(groupCount, 3, 'Must render exactly 3 distinct exercise group cards');
    const groupTitles = await ev(`
      Array.from(document.querySelectorAll(".exercise-group-title")).map(el => el.textContent.trim())
    `);
    console.log(`  Rendered exercise group cards: ${JSON.stringify(groupTitles)}`);
    assert.ok(groupTitles.includes('Echoing Numbers'), 'Contains Echoing Numbers card');
    assert.ok(groupTitles.includes('Check Even or Odd'), 'Contains Check Even or Odd card');
    assert.ok(groupTitles.includes('Sum of Numbers'), 'Contains Sum of Numbers card');

    // 5.2 Verify diagnostic details disclosure and Edit tests links
    const hasDiagnostics = await ev('Boolean(document.querySelector(".issue-diagnostics, details summary"))');
    assert.ok(hasDiagnostics, 'Diagnostics disclosure details rendered');
    const editTestsLinks = await ev(`
      Array.from(document.querySelectorAll('a[href*="?tab=tests"]')).map(a => a.getAttribute('href'))
    `);
    console.log(`  Edit tests links: ${JSON.stringify(editTestsLinks)}`);
    for (const href of editTestsLinks) {
      await nav(origin + href);
      await wait('Boolean(document.querySelector("#tab-tests"))', 'Validation link opens Python Tests editor');
      assert.ok(await ev(`document.querySelector('.sub-tab-btn[data-tab="tests"]').classList.contains("active")`), 'Validation link selects Tests tab');
      assert.ok(await ev('document.querySelector(".author-tree-pane").dataset.stepId') === href.split('/').pop().split('?')[0], 'Validation link selects named exercise');
    }
    await nav(`${origin}/teach/${courseId}/publish`);
    await wait('document.querySelectorAll(".issue-exercise-group").length === 3', 'Return to validation groups');
    assert.ok(editTestsLinks.length >= 3, 'Edit tests links target ?tab=tests');

    // 5.3 Verify Retry validation button
    const retryBtn = await ev('Boolean(document.querySelector("#retry-validation-btn"))');
    assert.ok(retryBtn, 'Retry validation button present');
    const callsBeforeRetry = fixtureValidationCalls;
    await ev('document.querySelector("#retry-validation-btn").click()');
    for (let i = 0; i < 120 && fixtureValidationCalls <= callsBeforeRetry; i++) await new Promise(r => setTimeout(r, 100));
    assert.ok(fixtureValidationCalls > callsBeforeRetry, 'Retry calls validation service again');
    await wait('document.querySelectorAll(".issue-exercise-group").length === 3', 'Retry retains three error groups');
    await capture('08-publish-review', `/teach/${courseId}/publish`, 'dark');
    await applyTheme('light');
    await capture('08-publish-review', `/teach/${courseId}/publish`, 'light');
    await applyTheme('dark');

    // 5.4 Test actual publication receipt when fixture validates:
    console.log('  [Controlled validation-stub publish integration] Simulating passing draft validation without live reference runner...');
    simulateInfrastructureFailure = false;
    simulateValidCourseDraft = true;

    // Reload publish page with valid state
    await nav(`${origin}/teach/${courseId}/publish`);
    await wait('Boolean(document.querySelector("#publish-open-confirm"))', 'Publish review reloaded with passing checklist');

    const checklistPassed = await ev('Boolean(document.querySelector(".status-strip, #publish-open-confirm:not(:disabled)"))');
    assert.ok(checklistPassed, 'Checklist passed and publish button enabled');

    // Click Publish Version 2 button to open modal
    await ev('document.querySelector("#publish-open-confirm")?.click()');
    await wait('Boolean(document.querySelector("#publish-confirm-submit"))', 'Publish confirmation modal opened');

    const previousVersion = (db.prepare('SELECT MAX(version_number) as max_v FROM course_versions WHERE course_id=?').get(courseId) as any).max_v;
    // Submit publication in ephemeral test DB only.
    await ev('document.querySelector("#publish-confirm-submit")?.click()');
    await wait('Boolean(document.querySelector(".receipt-card"))', 'Publication receipt rendered', 100);

    const receiptTitle = await ev('document.querySelector(".page-title")?.textContent');
    assert.ok(receiptTitle?.includes('Publication Receipt'), 'Publication receipt displayed');
    const receiptVersion = await ev('document.querySelector(".receipt-header")?.textContent');
    assert.ok(receiptVersion?.includes('Released Version'), 'Receipt includes Released Version label');

    // Assert real database release creation!
    const latestVersion = (db.prepare('SELECT MAX(version_number) as max_v FROM course_versions WHERE course_id = ?').get(courseId) as any)?.max_v;
    assert.equal(latestVersion, previousVersion + 1, 'Publication creates the next version in SQLite');
    assert.ok(receiptVersion.includes(`Released Version ${latestVersion}`), 'Receipt shows actual new database version');
    console.log(`  ✓ Actual publication receipt generated & verified in SQLite: Released Version ${latestVersion}`);

    await capture('08b-publication-receipt', `/teach/${courseId}/publish`, 'dark');
    await applyTheme('light');
    await capture('08b-publication-receipt', `/teach/${courseId}/publish`, 'light');
    await applyTheme('dark');

    // =========================================================================
    // WORKFLOW 6: STUDENT PREVIEW (COPY, VIDEO, QUIZ, PYTHON & ZERO PROGRESS MUTATIONS)
    // =========================================================================
    console.log('\n--- Workflow 6: Student Preview (Parity & Zero Student Mutations) ---');
    const progressRowsBefore = db.prepare('SELECT * FROM step_progress ORDER BY rowid').all();
    const attemptRowsBefore = db.prepare('SELECT * FROM assessment_attempts ORDER BY rowid').all();
    const progressCountBefore = (db.prepare('SELECT COUNT(*) as count FROM step_progress').get() as any).count;
    const attemptsCountBefore = (db.prepare('SELECT COUNT(*) as count FROM assessment_attempts').get() as any).count;

    // 6.1 Theory preview & Copy code button
    await nav(`${origin}/teach/${courseId}/preview`);
    await wait('Boolean(document.querySelector(".author-preview-banner"))', 'Student preview loaded');

    const bannerTag = await ev('document.querySelector(".preview-tag")?.textContent');
    assert.strictEqual(bannerTag, 'STUDENT PREVIEW', 'Student preview banner tag rendered');

    // Test functional code copy button
    const copyBtn = await ev('Boolean(document.querySelector(".code-block-copy"))');
    assert.ok(copyBtn, 'Learner code block copy button rendered');
    await ev(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copiedAuthorCode = text; } } })`);
    await ev('document.querySelector(".code-block-copy")?.click()');
    await new Promise(r => setTimeout(r, 100));
    const copyText = await ev('document.querySelector(".code-block-copy")?.textContent');
    assert.strictEqual(copyText, 'Copied!', 'Copy button gave instant visual feedback');
    assert.equal(await ev('window.__copiedAuthorCode'), await ev('document.querySelector(".code-block code").innerText'), 'Clipboard receives exact authored code');
    await ev(`navigator.clipboard.writeText = async () => { throw new Error('Controlled clipboard failure'); }; document.querySelector('.code-block-copy').click();`);
    await wait('document.querySelector(".code-block-copy").textContent === "Copy failed"', 'Clipboard failure has truthful feedback');
    console.log('  ✓ Theory preview code block copy button verified');
    await ev('document.querySelector(".outline-toggle-btn").click()');
    assert.ok(await ev('document.querySelector(".learning-course-sidebar").classList.contains("collapsed")'), 'Preview sidebar collapses');
    await ev('document.querySelector(".outline-toggle-btn").click()');
    assert.ok(await ev('!document.querySelector(".learning-course-sidebar").classList.contains("collapsed")'), 'Preview sidebar expands');

    await capture('07-student-preview', `/teach/${courseId}/preview`, 'dark');
    await applyTheme('light');
    await capture('07-student-preview', `/teach/${courseId}/preview`, 'light');
    await applyTheme('dark');

    await ev('document.querySelector(".task-nav-arrow.next-task").click()');
    await wait('Boolean(document.querySelector(".learning-step-video"))', 'Preview next arrow selects video');
    await ev('document.querySelector(".task-nav-arrow.prev-task").click()');
    await wait('Boolean(document.querySelector(".theory-step-content"))', 'Preview previous arrow returns to theory');

    // 6.2 Quiz preview: truthful interaction preview only
    await nav(`${origin}/teach/${courseId}/preview?stepId=${quizStepId}`);
    await wait('Boolean(document.querySelector(".learning-step-quiz"))', 'Quiz preview loaded');
    await ev(`
      const opt = document.querySelector("input[name='quiz_choice']");
      if (opt) opt.click();
      document.querySelector('[data-action="submit-preview-quiz"]')?.click();
    `);
    await new Promise(r => setTimeout(r, 100));
    const quizFeedback = await ev('document.querySelector("#preview-quiz-feedback")?.textContent');
    assert.ok(quizFeedback?.includes('Interaction preview'), 'Quiz gives interaction preview feedback');
    assert.ok(!quizFeedback?.includes('Solution preview validated'), 'Quiz does NOT claim validation');
    assert.ok(!quizFeedback?.includes('Correct'), 'Quiz does NOT claim correctness grading');
    console.log('  ✓ Quiz preview interaction feedback verified (no fake pass)');

    // 6.3 Video preview
    await nav(`${origin}/teach/${courseId}/preview?stepId=${videoStepId}`);
    await wait('Boolean(document.querySelector(".learning-step-video"))', 'Video preview loaded');
    const hasVideoPlayer = await ev('Boolean(document.querySelector("iframe, .video-container"))');
    assert.ok(hasVideoPlayer, 'Video preview player rendered');
    console.log('  ✓ Video preview player verified');

    // 6.4 Python preview with truthful disabled execution notice
    await nav(`${origin}/teach/${courseId}/preview?stepId=${pythonStepId}`);
    await wait('Boolean(document.querySelector(".learning-workspace-paired-layout"))', 'Python preview loaded');

    const hasProblemPane = await ev('Boolean(document.querySelector(".problem-pane"))');
    const hasEditorPane = await ev('Boolean(document.querySelector(".editor-pane"))');
    const hasLineNumbers = await ev('Boolean(document.querySelector(".code-editor-line-numbers"))');
    const hasRuntimeBadge = await ev('document.querySelector(".editor-toolbar")?.textContent.includes("Python 3")');

    assert.ok(hasProblemPane, 'Python preview includes learner problem pane');
    assert.ok(hasEditorPane, 'Python preview includes learner editor pane');
    assert.ok(hasLineNumbers, 'Python preview includes line numbers');
    assert.ok(hasRuntimeBadge, 'Python preview includes Python runtime badge');
    const geometry = await ev(`(() => {
      const viewport = document.querySelector('.workspace-viewport').getBoundingClientRect();
      const problem = document.querySelector('.problem-pane').getBoundingClientRect();
      const editor = document.querySelector('.editor-pane').getBoundingClientRect();
      return { viewport: viewport.width, problem: problem.width, editor: editor.width, editorRight: editor.right, viewportRight: viewport.right, scrollWidth: document.documentElement.scrollWidth, width: innerWidth };
    })()`);
    assert.ok(geometry.editor > 600, `Editor has usable desktop width: ${JSON.stringify(geometry)}`);
    assert.ok(Math.abs(geometry.editorRight - geometry.viewportRight) < 2, 'Editor fills right side of workspace');
    assert.ok(geometry.scrollWidth <= geometry.width, 'Preview does not overflow document horizontally');

    // Verify buttons are disabled and truthful notice is rendered
    const runBtnDisabled = await ev('document.querySelector("#preview-run-samples-btn")?.hasAttribute("disabled")');
    const submitBtnDisabled = await ev('document.querySelector("#preview-submit-btn")?.hasAttribute("disabled")');
    assert.ok(runBtnDisabled, 'Run samples button disabled in preview');
    assert.ok(submitBtnDisabled, 'Submit button disabled in preview');

    const noticeText = await ev('document.querySelector(".preview-execution-notice, #preview-run-results")?.textContent');
    assert.ok(noticeText?.includes('Execution unavailable in preview'), 'Truthful execution notice displayed');
    assert.ok(!noticeText?.includes('Input: 42'), 'No hardcoded fixed sample input 42');
    assert.ok(!noticeText?.includes('Output: 42'), 'No hardcoded fixed sample output 42');
    assert.ok(!noticeText?.includes('Solution preview validated'), 'No fake validation claim');
    console.log('  ✓ Python preview workspace parity and truthful execution notice verified (no fake pass)');

    await capture('07b-student-preview-python', `/teach/${courseId}/preview?stepId=${pythonStepId}`, 'dark');
    await applyTheme('light');
    await capture('07b-student-preview-python', `/teach/${courseId}/preview?stepId=${pythonStepId}`, 'light');
    await applyTheme('dark');

    // 6.5 ZERO student progress mutations assertion!
    const progressCountAfter = (db.prepare('SELECT COUNT(*) as count FROM step_progress').get() as any).count;
    const attemptsCountAfter = (db.prepare('SELECT COUNT(*) as count FROM assessment_attempts').get() as any).count;
    assert.strictEqual(progressCountAfter, progressCountBefore, 'ZERO student progress records must be created during author preview');
    assert.strictEqual(attemptsCountAfter, attemptsCountBefore, 'ZERO student assessment attempts must be created during author preview');
    assert.deepEqual(db.prepare('SELECT * FROM step_progress ORDER BY rowid').all(), progressRowsBefore, 'Preview neither inserts nor updates existing progress');
    assert.deepEqual(db.prepare('SELECT * FROM assessment_attempts ORDER BY rowid').all(), attemptRowsBefore, 'Preview neither inserts nor updates existing attempts');
    console.log('  ✓ ZERO student progress mutations verified (database records strictly unchanged)');

    // =========================================================================
    // WORKFLOW 7: STUDENTS ROSTER, REVOKE/REINSTATE & STUDENT DETAIL
    // =========================================================================
    console.log('\n--- Workflow 7: Students Roster, Revoke/Reinstate & Detail ---');
    await nav(`${origin}/teach/${courseId}/students`);
    await wait('Boolean(document.querySelector(".students-page-container"))', 'Students roster loaded');

    // Real revoke/reinstate mutations are confined to this ephemeral fixture DB.
    const enrollmentBefore = db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollmentId) as any;
    await ev(`document.querySelector('[data-action="open-revoke"][data-enrollment-id="${enrollmentId}"]').click()`);
    await wait('Boolean(document.querySelector("#revoke-student-modal:not(.hidden)"))', 'Revoke modal opened');
    await ev('document.querySelector("#btn-confirm-revoke").click()');
    for (let i = 0; i < 120; i++) {
      if ((db.prepare('SELECT status FROM enrollments WHERE id=?').get(enrollmentId) as any).status === 'revoked') break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert.equal((db.prepare('SELECT status FROM enrollments WHERE id=?').get(enrollmentId) as any).status, 'revoked', 'Revoke persists in database');
    await wait(`Boolean(document.querySelector('[data-action="open-reinstate"][data-enrollment-id="${enrollmentId}"]'))`, 'Revoked roster row offers reinstate');
    await ev(`document.querySelector('[data-action="open-reinstate"][data-enrollment-id="${enrollmentId}"]').click()`);
    await wait('Boolean(document.querySelector("#reinstate-student-modal:not(.hidden)"))', 'Reinstate modal opened');
    await ev('document.querySelector("#btn-confirm-reinstate").click()');
    for (let i = 0; i < 120; i++) {
      if ((db.prepare('SELECT status FROM enrollments WHERE id=?').get(enrollmentId) as any).status === 'active') break;
      await new Promise(r => setTimeout(r, 100));
    }
    const enrollmentAfter = db.prepare('SELECT * FROM enrollments WHERE id=?').get(enrollmentId) as any;
    assert.equal(enrollmentAfter.status, 'active', 'Reinstate persists in database');
    assert.equal(enrollmentAfter.course_version_id, enrollmentBefore.course_version_id, 'Pinned version survives access changes');
    await wait(`Boolean(document.querySelector('[data-action="open-revoke"][data-enrollment-id="${enrollmentId}"]'))`, 'Active roster row restored');
    console.log('  ✓ Real revoke and reinstate persistence verified, pinned version preserved');

    await capture('09-roster-students', `/teach/${courseId}/students`, 'dark');
    await applyTheme('light');
    await capture('09-roster-students', `/teach/${courseId}/students`, 'light');
    await applyTheme('dark');

    // Student detail
    await nav(`${origin}/teach/${courseId}/students/${enrollmentId}`);
    await wait('Boolean(document.querySelector(".student-detail-container, .student-summary, .student-hero-card"))', 'Student detail loaded');
    console.log('  ✓ Student detail page loaded');
    await capture('10-student-detail', `/teach/${courseId}/students/${enrollmentId}`, 'dark');
    await applyTheme('light');
    await capture('10-student-detail', `/teach/${courseId}/students/${enrollmentId}`, 'light');
    await applyTheme('dark');

    // =========================================================================
    // WORKFLOW 8: OTHER AUTHOR PAGES (ANALYTICS, SETTINGS, RECENT CHANGES)
    // =========================================================================
    console.log('\n--- Workflow 8: Remaining Author Screens ---');
    // Course Builder
    await nav(`${origin}/teach/${courseId}/content`);
    await wait('Boolean(document.querySelector(".author-tree-pane"))', 'Course builder loaded');
    await capture('02-course-builder-outline', `/teach/${courseId}/content`, 'dark');
    await applyTheme('light');
    await capture('02-course-builder-outline', `/teach/${courseId}/content`, 'light');
    await applyTheme('dark');

    // Dashboard
    await nav(`${origin}/teach`);
    await wait('Boolean(document.querySelector(".author-dashboard, .course-card"))', 'Author dashboard loaded');
    await capture('01-author-dashboard', '/teach', 'dark');
    await applyTheme('light');
    await capture('01-author-dashboard', '/teach', 'light');
    await applyTheme('dark');

    // Analytics
    await nav(`${origin}/teach/${courseId}/analytics`);
    await wait('document.body.innerText.includes("Analytics") || document.body.innerText.includes("analytics")', 'Analytics loaded');
    await capture('11-course-analytics', `/teach/${courseId}/analytics`, 'dark');
    await applyTheme('light');
    await capture('11-course-analytics', `/teach/${courseId}/analytics`, 'light');
    await applyTheme('dark');

    // Settings
    await nav(`${origin}/teach/${courseId}/settings`);
    await wait('Boolean(document.querySelector("input[name=\'title\'], form"))', 'Settings loaded');
    await capture('12-course-settings', `/teach/${courseId}/settings`, 'dark');
    await applyTheme('light');
    await capture('12-course-settings', `/teach/${courseId}/settings`, 'light');
    await applyTheme('dark');

    // Recent changes
    await nav(`${origin}/teach/${courseId}/activity`);
    await wait('document.body.innerText.includes("Recent changes") || document.body.innerText.includes("Changes made")', 'Activity loaded');
    assert.ok(!await ev('Boolean(document.querySelector(".author-tree-pane"))'), 'Recent changes has no empty course-tree placeholder');
    await capture('15-agent-activity-drafts', `/teach/${courseId}/activity`, 'dark');
    await applyTheme('light');
    await capture('15-agent-activity-drafts', `/teach/${courseId}/activity`, 'light');
    await applyTheme('dark');

    // AI Connections (Note: under settings scope)
    await nav(`${origin}/settings/ai-connections`);
    await wait('document.body.innerText.includes("AI connections") || Boolean(document.getElementById("btn-open-create-token"))', 'AI connections loaded');
    await capture('13-ai-connections', '/settings/ai-connections', 'dark');
    await applyTheme('light');
    await capture('13-ai-connections', '/settings/ai-connections', 'light');
    await applyTheme('dark');

    // Connection setup
    await nav(`${origin}/settings/ai-connections/tok-guido-1/setup`);
    await wait('document.body.innerText.includes("setup") || document.body.innerText.includes("Setup") || Boolean(document.querySelector("pre, code"))', 'Setup loaded');
    await capture('14-connection-setup', '/settings/ai-connections/tok-guido-1/setup', 'dark');
    await applyTheme('light');
    await capture('14-connection-setup', '/settings/ai-connections/tok-guido-1/setup', 'light');
    await applyTheme('dark');

    // Write check-again manifest
    const manifestPath = path.join('/tmp', 'author-capture', 'manifest.json');
    let allManifest: Record<string, any> = {};
    if (fs.existsSync(manifestPath)) {
      try { allManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch {}
    }
    allManifest['independent-audit'] = {
      capturedAt: new Date().toISOString(),
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      screens: capturedManifest,
      failedScreens: []
    };

    fs.writeFileSync(manifestPath, JSON.stringify(allManifest, null, 2));

    console.log('\n============================================================');
    console.log('  ALL REAL BROWSER VERIFICATION WORKFLOWS PASSED!');
    console.log(`  Total captures in check-again: ${capturedManifest.length}`);
    console.log(`  Manifest: ${manifestPath}`);
    console.log('============================================================\n');

  } catch (err: any) {
    console.error('FATAL VERIFICATION ERROR:', err);
    throw err;
  } finally {
    console.log('Cleaning up verification processes...');
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
  console.error('Workflow check script failed:', err);
  process.exit(1);
});

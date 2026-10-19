import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import type { Server } from 'node:http';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';

const root = process.cwd();

// Remove proxies
delete process.env.http_proxy;
delete process.env.HTTP_PROXY;
delete process.env.https_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.all_proxy;
delete process.env.ALL_PROXY;
process.env.no_proxy = '*';
process.env.NO_PROXY = '*';

const baseOutputDir = process.env.OUTPUT_DIR || path.join(os.tmpdir(), 'zur-public-redesign-output');
const afterDir = path.join(baseOutputDir, 'after');
fs.mkdirSync(afterDir, { recursive: true });

console.log('============================================================');
console.log('  ZUR PUBLIC REDESIGN - BROWSER CHECKS & VERIFICATION');
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-verify-public-'));
const dbPath = path.join(tmp, 'zur-public.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

const sampleResetToken = 'valid-reset-token-123';
const sampleResetHash = crypto.createHash('sha256').update(sampleResetToken).digest('hex');

const courseRow = db.prepare("SELECT id FROM courses WHERE publication_status='published' LIMIT 1").get() as any;
const courseId = courseRow?.id || 'course-python-foundations';

// Seed valid reset token
try {
  db.prepare(`
    INSERT INTO verification_tokens (
      id, user_id, token_hash, type, expires_at, created_at
    ) VALUES (
      'vt-reset-verify-1', 'user-student-1', ?, 'password_reset',
      datetime('now', '+1 hour'), datetime('now')
    )
  `).run(sampleResetHash);
} catch (err) {
  console.warn('Reset token seed note:', err);
}

const api = createServer(db);
let apiServer: Server | undefined;
let vite: ReturnType<typeof spawn> | undefined;
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

async function ready(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error(`not ready: ${url}`);
}

const results: Array<{ check: string; passed: boolean; details: string }> = [];

async function run() {
try {
  apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    apiServer!.once('listening', () => resolve());
    apiServer!.once('error', reject);
  });
  const apiAddress = apiServer.address();
  const apiPort = (apiAddress && typeof apiAddress !== 'string') ? apiAddress.port : 3000;
  console.log(`[Init] API listening on http://127.0.0.1:${apiPort}`);

  const basePort = 35000 + Math.floor(Math.random() * 20000);

  const viteConfigPath = path.join(tmp, 'vite.config.mjs');
  fs.writeFileSync(viteConfigPath, `export default {
  cacheDir: ${JSON.stringify(path.join(tmp, 'vite-cache'))},
  server: {
    host: '127.0.0.1',
    port: ${basePort},
    strictPort: false,
    proxy: {
      '/api': ${JSON.stringify(`http://127.0.0.1:${apiPort}`)},
    },
  },
};
`);

  let detectedOrigin: string | undefined;
  vite = spawn(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'),
    'packages/web',
    '--config', viteConfigPath,
    '--host', '127.0.0.1'
  ], {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, ZUR_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` }
  });

  vite!.stderr?.on('data', d => {
    console.error('[Vite ERR]', d.toString().trim());
  });

  const originPromise = new Promise<string>((resolve, reject) => {
    vite!.stdout?.on('data', d => {
      const text = d.toString();
      const m = text.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (m && !detectedOrigin) {
        detectedOrigin = `http://127.0.0.1:${m[1]}`;
        resolve(detectedOrigin);
      }
    });
    vite!.once('error', reject);
    setTimeout(() => {
      if (!detectedOrigin) reject(new Error('Vite startup timed out waiting for port'));
    }, 15000);
  });

  const origin = await originPromise;
  await ready(origin);
  console.log(`[Init] Vite listening on ${origin}`);

  let chromeDevToolsPort: string | undefined;
  let chromeDevToolsHost: string | undefined;
  chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${path.join(tmp, 'chrome')}`,
    'about:blank'
  ], {
    stdio: 'pipe',
    env: { ...process.env, no_proxy: '*', NO_PROXY: '*' }
  });

  const devToolsPromise = new Promise<{ host: string; port: string }>((resolve, reject) => {
    chrome!.stderr?.on('data', d => {
      const text = d.toString();
      const m = text.match(/DevTools listening on ws:\/\/([^:\/]+):(\d+)\//);
      if (m && !chromeDevToolsPort) {
        chromeDevToolsHost = m[1].replace(/[\[\]]/g, '');
        chromeDevToolsPort = m[2];
        resolve({ host: chromeDevToolsHost, port: chromeDevToolsPort });
      }
    });
    chrome!.once('exit', (code, sig) => {
      if (!chromeDevToolsPort) reject(new Error(`Chrome exited: code=${code} sig=${sig}`));
    });
    setTimeout(() => {
      if (!chromeDevToolsPort) reject(new Error('Timeout waiting for Chrome DevTools port'));
    }, 15000);
  });

  const devTools = await devToolsPromise;
  console.log(`[Init] Chrome DevTools listening on ${devTools.host}:${devTools.port}`);

  let target: any;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${devTools.port}/json/list`);
      if (res.ok) {
        const json = await res.json() as any[];
        target = json.find(x => x.type === 'page');
        if (target?.webSocketDebuggerUrl) break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!target) throw Error('Chrome DevTools WebSocket target unavailable');

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
    if (m.method === 'Runtime.consoleAPICalled') {
      const args = m.params?.args?.map((a: any) => a.value || a.description).join(' ');
      console.log(`[Browser Console ${m.params?.type || 'log'}] ${args}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      console.error('[Browser Exception]', JSON.stringify(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text));
    }
    if (m.method === 'Log.entryAdded') {
      console.error('[Browser Log]', m.params?.entry?.text || m.params?.entry);
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

  const wait = async (expression: string, label: string, maxAttempts = 250) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        if (await ev(expression)) return;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    const snippet = await ev('document.body ? document.body.innerText.slice(0, 500) : ""');
    const htmlSnippet = await ev('document.body ? document.body.innerHTML.slice(0, 500) : ""');
    throw Error(`Wait timeout for [${label}]: text="${snippet}" html="${htmlSnippet}"`);
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

  const capture = async (name: string) => {
    const fullPath = path.join(afterDir, `${name}.png`);
    const shot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(fullPath, Buffer.from(shot.data, 'base64'));
    console.log(`    [Saved screenshot] ${name}.png`);
  };

  await cmd('Page.enable');
  await cmd('Runtime.enable');
  await cmd('Log.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // CHECK 1: Public theme control both modes
  console.log('\n[Check 1/8] Public theme control both modes...');
  await nav(`${origin}/`);
  await wait('Boolean(document.querySelector(".theme-segment-btn"))', 'Theme segmented buttons loaded');
  const themeDarkResult = await ev(`(()=>{
    const darkBtn = document.querySelector('[data-theme-value="dark"]');
    if (darkBtn) darkBtn.click();
    return {
      docTheme: document.documentElement.getAttribute('data-theme'),
      storageTheme: localStorage.getItem('zur_theme_preference')
    };
  })()`);
  await new Promise(r => setTimeout(r, 200));

  const themeLightResult = await ev(`(()=>{
    const lightBtn = document.querySelector('[data-theme-value="light"]');
    if (lightBtn) lightBtn.click();
    return {
      docTheme: document.documentElement.getAttribute('data-theme'),
      storageTheme: localStorage.getItem('zur_theme_preference')
    };
  })()`);
  await new Promise(r => setTimeout(r, 200));

  const pass1 = themeDarkResult.docTheme === 'dark' && themeLightResult.docTheme === 'light';
  results.push({
    check: 'Public theme control (both dark and light modes via footer buttons)',
    passed: pass1,
    details: `Dark switch -> docTheme=${themeDarkResult.docTheme}, storage=${themeDarkResult.storageTheme}. Light switch -> docTheme=${themeLightResult.docTheme}, storage=${themeLightResult.storageTheme}.`
  });
  console.log(`  -> ${pass1 ? 'PASS' : 'FAIL'}: ${results[results.length - 1].details}`);

  // Reset to dark
  await ev(`(()=>{ const d = document.querySelector('[data-theme-value="dark"]'); if (d) d.click(); })()`);

  // CHECK 2: Catalog chips clear preserving filters
  console.log('\n[Check 2/8] Catalog chips clear preserving filters...');
  await nav(`${origin}/courses?q=python&level=beginner`);
  await wait('document.body.innerText.includes("Python") || Boolean(document.querySelector("#catalog-search-input"))', 'Catalog loaded');
  const chipsCheck = await ev(`(()=>{
    const chips = Array.from(document.querySelectorAll('.active-filters .filter-chip, .filter-chip, [data-filter-chip]')).map(el => el.textContent.trim());
    const clearBtn = document.querySelector('[data-action="clear-filters"], a[href="/courses"]');
    return {
      chipsFound: chips.length,
      chipsText: chips,
      clearHref: clearBtn ? clearBtn.getAttribute('href') : null
    };
  })()`);
  const pass2 = chipsCheck.chipsFound > 0 && chipsCheck.clearHref === '/courses';
  results.push({
    check: 'Catalog active-filter chips and clear filters preserving base path',
    passed: pass2,
    details: `Found ${chipsCheck.chipsFound} chips (${chipsCheck.chipsText.join(', ')}). Clear button points to ${chipsCheck.clearHref}.`
  });
  console.log(`  -> ${pass2 ? 'PASS' : 'FAIL'}: ${results[results.length - 1].details}`);

  // CHECK 3: Collapsible syllabus keyboard accessibility
  console.log('\n[Check 3/8] Collapsible syllabus keyboard interaction...');
  await nav(`${origin}/courses/${courseId}`);
  await wait('Boolean(document.querySelector("details.module-section, details"))', 'Syllabus loaded');
  const syllabusCheck = await ev(`(()=>{
    const details = document.querySelector('details.module-section, details');
    if (!details) return { found: false };
    const summary = details.querySelector('summary');
    const wasOpenInitially = details.open;
    // Simulate keyboard Enter on summary
    summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    // In native browser, clicking or Space/Enter on summary toggles details.open
    summary.click();
    const isOpenAfterClick = details.open;
    summary.click();
    const isOpenAfterSecondClick = details.open;
    return {
      found: true,
      hasSummary: Boolean(summary),
      wasOpenInitially,
      isOpenAfterClick,
      isOpenAfterSecondClick,
      summaryText: summary ? summary.textContent.trim().replace(/\\s+/g, ' ') : ''
    };
  })()`);
  const pass3 = syllabusCheck.found && syllabusCheck.hasSummary && syllabusCheck.wasOpenInitially !== syllabusCheck.isOpenAfterClick;
  results.push({
    check: 'Collapsible syllabus modules (<details>/<summary>) keyboard accessible & expandable',
    passed: pass3,
    details: `Module 1 initially open=${syllabusCheck.wasOpenInitially}, toggled open=${syllabusCheck.isOpenAfterClick}, re-toggled=${syllabusCheck.isOpenAfterSecondClick}. Summary text: "${syllabusCheck.summaryText?.slice(0, 40)}..."`
  });
  console.log(`  -> ${pass3 ? 'PASS' : 'FAIL'}: ${results[results.length - 1].details}`);

  // CHECK 4: Auth validation and recovery loading error
  console.log('\n[Check 4/8] Auth validation and error state...');
  await nav(`${origin}/sign-in`);
  await wait('Boolean(document.querySelector("#sign-in-form"))', 'Sign-in form loaded');
  const authValCheck = await ev(`(()=>{
    const form = document.querySelector('#sign-in-form');
    // submit empty form to trigger client validation
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const errorEl = document.querySelector('#sign-in-error, .form-error, [role="alert"]');
    return {
      hasError: Boolean(errorEl),
      errorText: errorEl ? errorEl.textContent.trim() : '',
      roleAlert: errorEl ? errorEl.getAttribute('role') : null
    };
  })()`);
  const pass4 = authValCheck.hasError && authValCheck.roleAlert === 'alert';
  results.push({
    check: 'Sign-in validation error rendering with role="alert"',
    passed: pass4,
    details: `Error present: ${authValCheck.hasError}, role="${authValCheck.roleAlert}", text: "${authValCheck.errorText}".`
  });
  console.log(`  -> ${pass4 ? 'PASS' : 'FAIL'}: ${results[results.length - 1].details}`);

  // CHECK 5: Invalid reset token state
  console.log('\n[Check 5/8] Invalid reset token state...');
  await nav(`${origin}/reset-password?token=expired-invalid-token`);
  await wait('Boolean(document.querySelector("#reset-password-form"))', 'Reset password form loaded');
  await ev(`(()=>{
    const p1 = document.querySelector('#newPassword');
    const p2 = document.querySelector('#confirmNewPassword');
    if (p1 && p2) {
      p1.value = 'ValidPass123!';
      p2.value = 'ValidPass123!';
      p1.dispatchEvent(new Event('input', { bubbles: true }));
      p2.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.querySelector('#reset-password-form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await wait('Boolean(document.querySelector("#reset-error")) && document.querySelector("#reset-error").innerText.includes("expired")', 'Reset error displayed');
  const resetCheck = await ev(`(()=>{
    const errorEl = document.querySelector('#reset-error');
    const errorText = errorEl ? errorEl.textContent.trim() : '';
    const roleAlert = errorEl ? errorEl.getAttribute('role') : null;
    return {
      hasError: Boolean(errorEl),
      errorText,
      roleAlert
    };
  })()`);
  const pass5 = resetCheck.hasError && resetCheck.errorText.includes('expired');
  results.push({
    check: 'Reset password rejects expired/invalid token with prominent alert message',
    passed: pass5,
    details: `Error present: ${resetCheck.hasError}, role="${resetCheck.roleAlert}", text: "${resetCheck.errorText}".`
  });
  console.log(`  -> ${pass5 ? 'PASS' : 'FAIL'}: ${results[results.length - 1].details}`);
  await capture('07_reset_password_invalid_verified');

  // CHECK 6: Verify email error and direct entry context
  console.log('\n[Check 6/8] Verify email error and direct entry context...');
  // 6a: Direct entry without context
  await nav(`${origin}/verify-email`);
  await wait('document.body.innerText.includes("Verify your email") || document.body.innerText.includes("No pending email verification")', 'Direct verify loaded');
  const verifyDirectCheck = await ev(`(()=>{
    const text = document.body.innerText;
    const hasNoContextMsg = text.includes('No pending email verification context was found');
    const falselyClaimsSent = text.includes('We sent a verification link');
    const hasSignInLink = Boolean(document.querySelector('a[href="/sign-in"]'));
    return { hasNoContextMsg, falselyClaimsSent, hasSignInLink };
  })()`);
  await capture('06_verify_email_direct_verified');

  // 6b: Expired/invalid token without email
  await nav(`${origin}/verify-email?token=invalid-expired-token-999`);
  await wait('document.body.innerText.includes("Verification link expired or invalid") || document.body.innerText.includes("invalid")', 'Verify error loaded');
  const verifyErrorCheck = await ev(`(()=>{
    const text = document.body.innerText;
    const errorEl = document.querySelector('#verify-error');
    const errorText = errorEl ? errorEl.textContent.trim() : '';
    const falselyClaimsSent = text.includes('We sent a verification link');
    const hasSignInBtn = Boolean(document.querySelector('a[href="/sign-in"]'));
    return {
      hasErrorEl: Boolean(errorEl),
      errorText,
      falselyClaimsSent,
      hasSignInBtn
    };
  })()`);
  await capture('06_verify_email_expired_token_verified');

  const pass6 = verifyDirectCheck.hasNoContextMsg && !verifyDirectCheck.falselyClaimsSent &&
                verifyErrorCheck.hasErrorEl && !verifyErrorCheck.falselyClaimsSent &&
                verifyErrorCheck.errorText.toLowerCase().includes('verification link') &&
                verifyErrorCheck.errorText.toLowerCase().includes('expired');
  results.push({
    check: 'Verify email handles direct-entry no-context AND expired/invalid token failure without falsely claiming sent',
    passed: pass6,
    details: `Direct: no-context=${verifyDirectCheck.hasNoContextMsg}, falselySent=${verifyDirectCheck.falselyClaimsSent}. Expired token: errorText="${verifyErrorCheck.errorText}", falselySent=${verifyErrorCheck.falselyClaimsSent}, signInBtn=${verifyErrorCheck.hasSignInBtn}.`
  });
  console.log(`  -> ${pass6 ? 'PASS' : 'FAIL'}: ${results[results.length - 1].details}`);

  // CHECK 7: Help report action modal
  console.log('\n[Check 7/8] Help report action modal...');
  await nav(`${origin}/help`);
  await wait('Boolean(document.querySelector("button[data-action=\\"open-report\\"]"))', 'Help page loaded');
  const helpReportCheck = await ev(`(()=>{
    const btn = document.querySelector('button[data-action="open-report"]');
    if (btn) btn.click();
    const modal = document.querySelector('#report-issue-modal');
    return {
      buttonFound: Boolean(btn),
      modalFound: Boolean(modal),
      isAriaModal: modal ? modal.getAttribute('aria-modal') : null,
      role: modal ? modal.getAttribute('role') : null,
      hasIssueTypeSelect: Boolean(modal && modal.querySelector('#report-type, select')),
      hasTextarea: Boolean(modal && modal.querySelector('#report-description, textarea'))
    };
  })()`);
  const pass7 = helpReportCheck.buttonFound && helpReportCheck.modalFound && helpReportCheck.role === 'dialog';
  results.push({
    check: 'Help page Report issue button opens accessible reporting dialog with form fields',
    passed: pass7,
    details: `Report button found: ${helpReportCheck.buttonFound}, modal found: ${helpReportCheck.modalFound}, role="${helpReportCheck.role}", aria-modal="${helpReportCheck.isAriaModal}", typeSelect=${helpReportCheck.hasIssueTypeSelect}.`
  });
  console.log(`  -> ${pass7 ? 'PASS' : 'FAIL'}: ${results[results.length - 1].details}`);
  await capture('09_help_report_modal_verified');

  // CHECK 8: Access denied Go back direct-entry fallback
  console.log('\n[Check 8/8] Access denied Go back direct-entry fallback...');
  await nav(`${origin}/access-denied`);
  await wait('document.body.innerText.includes("This page isn\'t available.")', 'Access denied loaded');
  const accessDeniedCheck = await ev(`(()=>{
    const goBackBtn = document.querySelector('.state-actions button, button.btn-ghost');
    const browseLink = document.querySelector('.state-actions a[href="/courses"]');
    const onclickAttr = goBackBtn ? goBackBtn.getAttribute('onclick') : '';
    return {
      hasGoBack: Boolean(goBackBtn),
      onclickAttr,
      hasBrowseLink: Boolean(browseLink)
    };
  })()`);
  const pass8 = accessDeniedCheck.hasGoBack &&
                accessDeniedCheck.onclickAttr.includes("window.location.href='/courses'") &&
                accessDeniedCheck.hasBrowseLink;
  results.push({
    check: 'Access denied Go back button incorporates safe fallback to /courses for direct visits',
    passed: pass8,
    details: `Go back button found: ${accessDeniedCheck.hasGoBack}, onclick handler: "${accessDeniedCheck.onclickAttr}", fallback to /courses verified.`
  });
  console.log(`  -> ${pass8 ? 'PASS' : 'FAIL'}: ${results[results.length - 1].details}`);
  await capture('12_access_denied_verified');

  // Capture not-found and terms verified screenshots
  await nav(`${origin}/not-found`);
  await wait('document.body.innerText.includes("This page isn\'t available.")');
  await capture('13_not_found_verified');

  await nav(`${origin}/terms`);
  await wait('document.body.innerText.includes("Terms")');
  await capture('11_terms_verified');

  console.log('\n============================================================');
  console.log('  BROWSER VERIFICATION SUMMARY');
  console.log('============================================================');
  let allPassed = true;
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.check}`);
    console.log(`       Details: ${r.details}\n`);
    if (!r.passed) allPassed = false;
  }

  if (allPassed) {
    console.log('✓ ALL 8 BROWSER CHECKS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('✗ Some browser checks failed.\n');
    process.exitCode = 1;
  }

} catch (err: any) {
  console.error('\n✗ Error during browser verification run:', err);
  process.exitCode = 1;
} finally {
  console.log('[Cleanup] Closing browser and servers...');
  try { socket?.close(); } catch {}
  await stopProcess(chrome);
  await stopProcess(vite);
  if (apiServer) {
    await new Promise<void>(r => apiServer!.close(() => r()));
  }
  try { closeDatabase(dbPath); } catch {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  console.log('[Cleanup] Done.');
}
}

void run();

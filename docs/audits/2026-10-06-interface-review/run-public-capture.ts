import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import type { Server } from 'node:http';
import { closeDatabase, getDatabase } from '../../../packages/server/src/db/database.ts';
import { runMigrations } from '../../../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../../../packages/server/src/db/seed.ts';
import { createServer } from '../../../packages/server/src/server.ts';
import { MediaService } from '../../../packages/server/src/services/media-service.ts';

delete process.env.http_proxy;
delete process.env.HTTP_PROXY;
delete process.env.https_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.all_proxy;
delete process.env.ALL_PROXY;
process.env.no_proxy = '*';
process.env.NO_PROXY = '*';

const root = process.cwd();
const publicOutputDir = path.join(root, 'screenshots', 'interface-review-2026-10-06', 'public');
const auditDir = path.join(root, 'docs', 'audits', '2026-10-06-interface-review');
fs.mkdirSync(publicOutputDir, { recursive: true });

console.log('============================================================');
console.log('  ZUR PUBLIC/ACCOUNT REDESIGN EVIDENCE CAPTURE HARNESS');
console.log(`  Output dir:   ${publicOutputDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-public-evidence-'));
const dbPath = path.join(tmp, 'zur-public.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

const uploadsDir = path.join(tmp, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const mediaService = new MediaService(db, uploadsDir);

const sampleResetToken = 'valid-reset-token-123';
const sampleResetHash = crypto.createHash('sha256').update(sampleResetToken).digest('hex');

const sampleInviteToken = 'valid-invite-token-123';
const sampleInviteHash = crypto.createHash('sha256').update(sampleInviteToken).digest('hex');

const courseRow = db.prepare("SELECT id FROM courses WHERE publication_status='published' LIMIT 1").get() as any;
const courseId = courseRow?.id || 'course-python-foundations';

// Seed password reset token for user-student-1 (valid 1 hour)
try {
  db.prepare(`
    INSERT INTO verification_tokens (
      id, user_id, token_hash, type, expires_at, created_at
    ) VALUES (
      'vt-reset-polish-1', 'user-student-1', ?, 'password_reset',
      datetime('now', '+1 hour'), datetime('now')
    )
  `).run(sampleResetHash);
} catch (err) {
  console.warn('Could not seed password reset token:', err);
}

// Seed shareable invitation token for course
try {
  db.prepare(`
    INSERT INTO invitations (
      id, course_id, inviter_id, token_hash, recipient_email, type, max_uses, uses_count, expires_at, is_revoked, created_at
    ) VALUES (
      'inv-polish-1', ?, 'user-author-1', ?, 'ada@zur.internal', 'shareable_link', 10, 0,
      datetime('now', '+7 days'), 0, datetime('now')
    )
  `).run(courseId, sampleInviteHash);
} catch (err) {
  console.warn('Could not seed invitation:', err);
}

const api = createServer(db);
let apiServer: Server | undefined;
let vite: ReturnType<typeof spawn> | undefined;
let chrome: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;

async function port(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as any).port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
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
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error(`not ready: ${url}`);
}

interface ManifestItem {
  filePath: string;
  route: string;
  timestamp: string;
  viewport: string;
  theme: 'dark' | 'light';
  state: string;
  fixture: boolean;
  fixtureType: string;
  validity: string;
}

interface LogItem {
  step: number;
  sourceRoute: string;
  destinationRoute: string;
  action: string;
  expected: string;
  actual: string;
  assertions: string;
  passed: boolean;
}

const publicManifest: ManifestItem[] = [];
const publicLog: LogItem[] = [];

function logPublicItem(source: string, dest: string, action: string, expected: string, actual: string, assertions: string, passed: boolean) {
  publicLog.push({
    step: publicLog.length + 1,
    sourceRoute: source,
    destinationRoute: dest,
    action,
    expected,
    actual,
    assertions,
    passed
  });
  console.log(`[Public #${publicLog.length}] ${action} -> ${passed ? 'PASS' : 'FAIL'} (${actual})`);
}

try {
  const apiPort = await port();
  apiServer = api.listen(apiPort, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    apiServer!.once('listening', () => resolve());
    apiServer!.once('error', reject);
  });
  console.log(`[Public API] http://127.0.0.1:${apiPort}`);

  const webPort = await port();
  const origin = `http://127.0.0.1:${webPort}`;

  const viteConfigPath = path.join(tmp, 'vite.config.mjs');
  fs.writeFileSync(viteConfigPath, `export default {
    cacheDir: ${JSON.stringify(path.join(tmp, 'vite-cache'))},
    server: {
      host: '127.0.0.1',
      strictPort: true,
      hmr: false,
      watch: null,
      proxy: {
        '/api': 'http://127.0.0.1:${apiPort}',
      },
    },
  };\n`);

  vite = spawn(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'),
    'packages/web',
    '--config', viteConfigPath,
    '--host', '127.0.0.1',
    '--port', String(webPort)
  ], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, ZUR_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` }
  });
  await ready(origin);
  console.log(`[Public Vite] ${origin}`);

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
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  async function applyAndVerifyTheme(theme: 'dark' | 'light') {
    await ev(`(()=>{
      try {
        localStorage.setItem('zur_theme_preference', '${theme}');
      } catch {}
      if (document.documentElement) {
        document.documentElement.dataset.theme = '${theme}';
        document.documentElement.setAttribute('data-theme', '${theme}');
        document.documentElement.style.colorScheme = '${theme}';
      }
      return true;
    })()`);
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
                         text.includes('Loading course overview');
      return !hasSkeleton && !isFetching;
    })()`, 'Content rendered without skeletons');
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
    const targetFile = path.join(publicOutputDir, filename);

    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 60));

    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(targetFile, Buffer.from(vpShot.data, 'base64'));
    console.log(`    [Saved] ${filename} (1440x900)`);

    publicManifest.push({
      filePath: `screenshots/interface-review-2026-10-06/public/${filename}`,
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
        const fullPath = path.join(publicOutputDir, fullFilename);
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

        publicManifest.push({
          filePath: `screenshots/interface-review-2026-10-06/public/${fullFilename}`,
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

  // Ensure public visitor state
  await ev(`(()=>{
    localStorage.clear();
    sessionStorage.clear();
    return true;
  })()`);

  // 1. P01 Landing Page (/)
  console.log('\n--- Capturing P01: Landing Page (/) ---');
  await nav(`${origin}/`);
  await applyAndVerifyTheme('dark');
  await wait('Boolean(document.querySelector("[data-hero-typewriter]"))', 'Landing hero');
  await captureScreen('public-p01-landing-dark-normal', '/', 'public landing page with typewriter headline, feature cards, and CTA buttons', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p01-landing-light-normal', '/', 'public landing page light theme', 'light');
  await applyAndVerifyTheme('dark');
  logPublicItem('/', '/', 'Visit Public Landing Page', 'Render hero section with CTA buttons', 'Landing page rendered with start learning CTA', 'Landing hero verified', true);

  // 2. P02 Explore Courses (/courses)
  console.log('\n--- Capturing P02: Explore Catalog (/courses) ---');
  await nav(`${origin}/courses`);
  await applyAndVerifyTheme('dark');
  await waitForContent('document.body.innerText.includes("Python foundations") || document.body.innerText.includes("Explore courses")', 'Public catalog');
  await captureScreen('public-p02-catalog-dark-normal', '/courses', 'public course catalog with search input, level filters, and course cards', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p02-catalog-light-normal', '/courses', 'public course catalog light theme', 'light');
  await applyAndVerifyTheme('dark');

  // P02 Filtered & Empty
  await nav(`${origin}/courses?q=python&level=beginner`);
  await waitForContent(undefined, 'Catalog filtered');
  await captureScreen('public-p02-catalog-dark-filtered', '/courses?q=python&level=beginner', 'public catalog with active search query and beginner level filter', 'dark');

  await nav(`${origin}/courses?q=nonexistentcourse12345`);
  await waitForContent(undefined, 'Catalog empty');
  await captureScreen('public-p02-catalog-dark-empty', '/courses?q=nonexistentcourse12345', 'public catalog zero search results empty state', 'dark');

  // 3. P03 Course Overview (/courses/:courseId)
  console.log('\n--- Capturing P03: Course Overview ---');
  await nav(`${origin}/courses/${courseId}`);
  await applyAndVerifyTheme('dark');
  await waitForContent('document.body.innerText.includes("Python foundations")', 'Course overview');
  await captureScreen('public-p03-course-overview-dark-normal', `/courses/${courseId}`, 'public course overview showing syllabus, modules, and enrollment CTA', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p03-course-overview-light-normal', `/courses/${courseId}`, 'public course overview light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 4. P04 Sign-in (/sign-in)
  console.log('\n--- Capturing P04: Sign-in ---');
  await nav(`${origin}/sign-in`);
  await applyAndVerifyTheme('dark');
  await waitForContent('Boolean(document.querySelector("#sign-in-form"))', 'Sign-in form');
  await captureScreen('public-p04-sign-in-dark-normal', '/sign-in', 'public sign-in form with email and password inputs and forgot password link', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p04-sign-in-light-normal', '/sign-in', 'public sign-in form light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Sign-in error state
  await ev(`(()=>{
    const form = document.querySelector('#sign-in-form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await new Promise(r => setTimeout(r, 200));
  await captureScreen('public-p04-sign-in-dark-error', '/sign-in', 'sign-in form client validation error on empty fields', 'dark', false);

  // 5. P05 Sign-up (/sign-up)
  console.log('\n--- Capturing P05: Sign-up ---');
  await nav(`${origin}/sign-up`);
  await applyAndVerifyTheme('dark');
  await waitForContent('Boolean(document.querySelector("#sign-up-form"))', 'Sign-up form');
  await captureScreen('public-p05-sign-up-dark-normal', '/sign-up', 'public registration form with name, email, and password fields', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p05-sign-up-light-normal', '/sign-up', 'public registration form light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Sign-up error state
  await ev(`(()=>{
    const form = document.querySelector('#sign-up-form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await new Promise(r => setTimeout(r, 200));
  await captureScreen('public-p05-sign-up-dark-error', '/sign-up', 'sign-up form client validation error on empty fields', 'dark', false);

  // 6. P06 Verify Email (/verify-email)
  console.log('\n--- Capturing P06: Verify Email ---');
  await nav(`${origin}/verify-email`);
  await applyAndVerifyTheme('dark');
  await waitForContent(undefined, 'Verify email direct visit');
  await captureScreen('public-p06-verify-email-dark-direct', '/verify-email', 'verify email instruction page visited directly without pending token', 'dark');

  await nav(`${origin}/verify-email?email=ada@zur.internal`);
  await waitForContent(undefined, 'Verify email with address');
  await captureScreen('public-p06-verify-email-dark-context', '/verify-email?email=ada@zur.internal', 'verify email confirmation notice displaying recipient email', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p06-verify-email-light-context', '/verify-email?email=ada@zur.internal', 'verify email confirmation notice light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 7. P07 Forgot Password (/forgot-password)
  console.log('\n--- Capturing P07: Forgot Password ---');
  await nav(`${origin}/forgot-password`);
  await applyAndVerifyTheme('dark');
  await waitForContent('Boolean(document.querySelector("#forgot-password-form"))', 'Forgot password form');
  await captureScreen('public-p07-forgot-password-dark-normal', '/forgot-password', 'forgot password request form with email input and submit CTA', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p07-forgot-password-light-normal', '/forgot-password', 'forgot password request form light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Forgot password submitted state
  await ev(`(()=>{
    const emailInput = document.querySelector('#email');
    if (emailInput) {
      emailInput.value = 'ada@zur.internal';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.querySelector('#forgot-password-form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await new Promise(r => setTimeout(r, 300));
  await captureScreen('public-p07-forgot-password-dark-submitted', '/forgot-password', 'forgot password check email confirmation notice', 'dark', false);

  // 8. P07 Reset Password (/reset-password)
  console.log('\n--- Capturing P07: Reset Password ---');
  await nav(`${origin}/reset-password?token=${sampleResetToken}`);
  await applyAndVerifyTheme('dark');
  await waitForContent(undefined, 'Reset password form with token');
  await captureScreen('public-p07-reset-password-dark-valid', `/reset-password?token=${sampleResetToken}`, 'reset password form with valid token, new password, and confirmation inputs', 'dark');

  await nav(`${origin}/reset-password?token=expired-invalid-token`);
  await waitForContent(undefined, 'Reset password expired token');
  await captureScreen('public-p07-reset-password-dark-invalid', '/reset-password?token=expired-invalid-token', 'reset password invalid or expired token error banner with request new link CTA', 'dark');

  // 9. P08 Join Course / Invitation (/join/:token)
  console.log('\n--- Capturing P08: Join Course Invitation ---');
  await nav(`${origin}/join/${sampleInviteToken}`);
  await applyAndVerifyTheme('dark');
  await waitForContent(undefined, 'Join course with invitation');
  await captureScreen('public-p08-join-invitation-dark-valid', `/join/${sampleInviteToken}`, 'course invitation landing page with course summary, inviter details, and accept CTA', 'dark');

  await nav(`${origin}/join/invalid-or-revoked-token`);
  await waitForContent(undefined, 'Invalid invitation');
  await captureScreen('public-p08-join-invitation-dark-invalid', '/join/invalid-or-revoked-token', 'invalid or expired invitation notice with browse catalog CTA', 'dark');

  // 10. P40 Help (/help)
  console.log('\n--- Capturing P40: Help Page ---');
  await nav(`${origin}/help`);
  await applyAndVerifyTheme('dark');
  await waitForContent('document.body.innerText.includes("Help")', 'Help page');
  await captureScreen('public-p40-help-dark-normal', '/help', 'platform help and documentation page with FAQs and contact guides', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p40-help-light-normal', '/help', 'platform help page light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 11. P41 Privacy & Terms (/privacy, /terms)
  console.log('\n--- Capturing P41: Privacy Policy ---');
  await nav(`${origin}/privacy`);
  await applyAndVerifyTheme('dark');
  await waitForContent('document.body.innerText.includes("Privacy")', 'Privacy notice');
  await captureScreen('public-p41-privacy-dark-normal', '/privacy', 'privacy policy disclosure page outlining data handling and rights', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p41-privacy-light-normal', '/privacy', 'privacy policy disclosure page light theme', 'light');
  await applyAndVerifyTheme('dark');

  console.log('\n--- Capturing P41: Terms of Service ---');
  await nav(`${origin}/terms`);
  await applyAndVerifyTheme('dark');
  await waitForContent('document.body.innerText.includes("Terms")', 'Terms notice');
  await captureScreen('public-p41-terms-dark-normal', '/terms', 'terms of service legal notice and usage requirements', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p41-terms-light-normal', '/terms', 'terms of service notice light theme', 'light');
  await applyAndVerifyTheme('dark');

  // 12. P42 Access Denied & Not Found (/access-denied, /not-found)
  console.log('\n--- Capturing P42: Access Denied ---');
  await nav(`${origin}/access-denied`);
  await applyAndVerifyTheme('dark');
  await waitForContent(undefined, 'Access denied page');
  await captureScreen('public-p42-access-denied-dark-normal', '/access-denied', 'access denied 403 error page with safe explanation and home CTA', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p42-access-denied-light-normal', '/access-denied', 'access denied error page light theme', 'light');
  await applyAndVerifyTheme('dark');

  console.log('\n--- Capturing P42: Not Found ---');
  await nav(`${origin}/not-found`);
  await applyAndVerifyTheme('dark');
  await waitForContent(undefined, 'Not found page');
  await captureScreen('public-p42-not-found-dark-normal', '/not-found', 'not found 404 error page with safe explanation and home CTA', 'dark');
  await applyAndVerifyTheme('light');
  await captureScreen('public-p42-not-found-light-normal', '/not-found', 'not found 404 error page light theme', 'light');
  await applyAndVerifyTheme('dark');

  // Write public deliverables
  console.log('\n--- Writing Public Deliverables ---');
  fs.writeFileSync(path.join(auditDir, 'public-manifest.json'), JSON.stringify(publicManifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(auditDir, 'public-interaction-log.json'), JSON.stringify(publicLog, null, 2), 'utf8');

  console.log(`Successfully saved ${publicManifest.length} public screenshots.`);
  console.log(`Successfully saved ${publicLog.length} public interaction log entries.`);
  console.log('============================================================\n');

} catch (err: any) {
  console.error('Fatal public harness error:', err);
  process.exitCode = 1;
} finally {
  console.log('Cleaning up public processes...');
  if (socket) {
    try { socket.close(); } catch {}
  }
  await stopProcess(chrome);
  await stopProcess(vite);
  if (apiServer) {
    await new Promise<void>(r => apiServer!.close(() => r()));
  }
  closeDatabase(db);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  console.log('Public clean up done.');
}

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
import { MediaService } from '../packages/server/src/services/media-service.ts';

const root = process.cwd();

// Ensure Node fetch and child processes do not route localhost through outbound proxy
delete process.env.http_proxy;
delete process.env.HTTP_PROXY;
delete process.env.https_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.all_proxy;
delete process.env.ALL_PROXY;
process.env.no_proxy = '*';
process.env.NO_PROXY = '*';

// Phase: "before" or "after"
const phase = (process.argv[2] || 'before').trim().toLowerCase();
if (phase !== 'before' && phase !== 'after') {
  console.error(`Invalid phase "${phase}". Expected "before" or "after".`);
  process.exit(1);
}

// Output dir in /tmp or custom location
const baseOutputDir = process.env.OUTPUT_DIR || path.join(os.tmpdir(), 'zur-public-redesign-output');
const outputDir = path.join(baseOutputDir, phase);
fs.mkdirSync(outputDir, { recursive: true });

console.log('============================================================');
console.log(`  ZUR PUBLIC REDESIGN SCREENSHOT CAPTURE`);
console.log(`  Phase:        ${phase.toUpperCase()}`);
console.log(`  Output dir:   ${outputDir}`);
console.log('============================================================\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `zur-public-redesign-${phase}-`));
const dbPath = path.join(tmp, 'zur-public.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

// Seed extra fixtures for complete public screens
const uploadsDir = path.join(tmp, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const mediaService = new MediaService(db, uploadsDir);

const sampleResetToken = 'valid-reset-token-123';
const sampleResetHash = crypto.createHash('sha256').update(sampleResetToken).digest('hex');

const sampleInviteToken = 'valid-invite-token-123';
const sampleInviteHash = crypto.createHash('sha256').update(sampleInviteToken).digest('hex');

// Discover course
const courseRow = db.prepare("SELECT id FROM courses WHERE publication_status='published' LIMIT 1").get() as any;
const courseId = courseRow?.id || 'course-python-foundations';

// 1. Seed password reset token for user-student-1 (valid 1 hour)
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

// 2. Seed shareable invitation token for course
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

interface CapturedItem {
  id: string;
  phase: string;
  name: string;
  route: string;
  theme: 'dark' | 'light';
  isFullPage: boolean;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  state: string;
  captureTime: string;
  filePath: string;
  relativeReportPath: string;
}

const capturedManifest: CapturedItem[] = [];

try {
  apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    apiServer!.once('listening', () => resolve());
    apiServer!.once('error', reject);
  });
  const apiAddress = apiServer.address();
  const apiPort = (apiAddress && typeof apiAddress !== 'string') ? apiAddress.port : 3000;
  console.log(`[Init 1/3] Backend API listening on http://127.0.0.1:${apiPort}`);

  const viteConfigPath = path.join(tmp, 'vite.config.mjs');
  fs.writeFileSync(viteConfigPath, `export default {
  cacheDir: ${JSON.stringify(path.join(tmp, 'vite-cache'))},
  server: {
    host: '127.0.0.1',
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
    '--host', '127.0.0.1',
    '--port', '0'
  ], {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, ZUR_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` }
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
    vite!.stderr?.on('data', d => {
      console.error('[Vite ERR]', d.toString().trim());
    });
    vite!.once('error', reject);
    setTimeout(() => {
      if (!detectedOrigin) reject(new Error('Vite startup timed out waiting for port'));
    }, 15000);
  });

  const origin = await originPromise;
  await ready(origin);
  console.log(`[Init 2/3] Frontend Vite listening on ${origin}`);

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
      if (!chromeDevToolsPort) reject(new Error(`Chrome exited early: code=${code} sig=${sig}`));
    });
    setTimeout(() => {
      if (!chromeDevToolsPort) reject(new Error('Timeout waiting for Chrome DevTools port'));
    }, 15000);
  });

  const devTools = await devToolsPromise;
  console.log(`[Init 3/3] Chrome DevTools listening on ${devTools.host}:${devTools.port}`);

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
                         text.includes('Loading students and invitations') ||
                         text.includes('Computing exact course metrics') ||
                         text.includes('Loading operational records') ||
                         text.includes('Loading student progress');
      return !hasSkeleton && !isFetching;
    })()`, 'Content rendered without skeletons or loading state');
    await new Promise(r => setTimeout(r, 200));
  }

  async function captureScreen(
    name: string,
    route: string,
    theme: 'dark' | 'light',
    stateDesc: string,
    captureFullPage = false
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const baseName = `${name}__${theme}.png`;
    const viewportPath = path.join(outputDir, baseName);

    // Scroll to top
    await ev('window.scrollTo(0, 0)');
    await new Promise(r => setTimeout(r, 100));

    // Viewport screenshot (1440x900)
    await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const vpShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(viewportPath, Buffer.from(vpShot.data, 'base64'));

    capturedManifest.push({
      id: `${name}__${theme}`,
      phase,
      name,
      route,
      theme,
      isFullPage: false,
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
      state: stateDesc,
      captureTime: timestamp,
      filePath: viewportPath,
      relativeReportPath: `${phase}/${baseName}`
    });
    console.log(`    [1440x900]  Saved ${baseName}`);

    if (captureFullPage) {
      const scrollH = await ev(`Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      )`) as number;

      if (scrollH > 920) {
        const fullBaseName = `${name}__full__${theme}.png`;
        const fullPath = path.join(outputDir, fullBaseName);
        await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: Math.min(scrollH, 4000), deviceScaleFactor: 1, mobile: false });
        await new Promise(r => setTimeout(r, 100));
        const fullShot = await cmd('Page.captureScreenshot', { format: 'png', fromSurface: true });
        fs.writeFileSync(fullPath, Buffer.from(fullShot.data, 'base64'));
        await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

        capturedManifest.push({
          id: `${name}__full__${theme}`,
          phase,
          name: `${name}__full`,
          route,
          theme,
          isFullPage: true,
          viewport: { width: 1440, height: Math.min(scrollH, 4000), deviceScaleFactor: 1 },
          state: `${stateDesc} (full page)`,
          captureTime: timestamp,
          filePath: fullPath,
          relativeReportPath: `${phase}/${fullBaseName}`
        });
        console.log(`    [Full-page] Saved ${fullBaseName}`);
      }
    }
  }

  // Clear session to ensure public anonymous visitor state
  await ev(`(()=>{
    localStorage.clear();
    sessionStorage.clear();
    return true;
  })()`);

  // 1. P01 Landing Page
  console.log('\n--- Capturing P01: Landing Page ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/`);
    await applyAndVerifyTheme(theme);
    await wait(
      `(()=>{
        const el = document.querySelector('[data-hero-typewriter]');
        return Boolean(el && el.textContent.includes('Then write it.'));
      })()`,
      'Landing typewriter headline completely typed'
    );
    await new Promise(r => setTimeout(r, 200));
    await captureScreen('01_landing', '/', theme, 'Default landing hero and sections', true);
  }

  // 2. P02 Catalog Page
  console.log('\n--- Capturing P02: Catalog Page ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/courses`);
    await applyAndVerifyTheme(theme);
    await waitForContent('document.body.innerText.includes("Python foundations") || document.body.innerText.includes("Explore courses")', 'Catalog list');
    await captureScreen('02_catalog', '/courses', theme, 'Default catalog view');
  }

  // 2b. Catalog filtered & empty
  console.log('\n--- Capturing P02: Catalog Filtered & Empty ---');
  await applyAndVerifyTheme('dark');
  await nav(`${origin}/courses?q=python&level=beginner`);
  await applyAndVerifyTheme('dark', true);
  await waitForContent(undefined, 'Catalog filtered');
  await captureScreen('02_catalog_filtered', '/courses?q=python&level=beginner', 'dark', 'Catalog with search query and level filter active');

  await nav(`${origin}/courses?q=nonexistentcourse12345`);
  await waitForContent(undefined, 'Catalog empty');
  await captureScreen('02_catalog_empty', '/courses?q=nonexistentcourse12345', 'dark', 'Catalog empty search result state');

  // 3. P03 Course Overview
  console.log('\n--- Capturing P03: Course Overview ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/courses/${courseId}`);
    await applyAndVerifyTheme(theme);
    await waitForContent('document.body.innerText.includes("Python foundations")', 'Course overview content');
    await captureScreen('03_course_overview', `/courses/${courseId}`, theme, 'Public course overview and syllabus', true);
  }

  // 4. P04 Sign-in
  console.log('\n--- Capturing P04: Sign-in ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/sign-in`);
    await applyAndVerifyTheme(theme);
    await waitForContent('Boolean(document.querySelector("#sign-in-form"))', 'Sign-in form');
    await captureScreen('04_sign_in', '/sign-in', theme, 'Standard sign-in form');
  }
  // Sign-in error state
  await applyAndVerifyTheme('dark');
  await nav(`${origin}/sign-in`);
  await applyAndVerifyTheme('dark', true);
  await waitForContent('Boolean(document.querySelector("#sign-in-form"))');
  await ev(`(()=>{
    const form = document.querySelector('#sign-in-form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await new Promise(r => setTimeout(r, 300));
  await captureScreen('04_sign_in_error', '/sign-in', 'dark', 'Sign-in validation/error state');

  // 5. P05 Sign-up
  console.log('\n--- Capturing P05: Sign-up ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/sign-up`);
    await applyAndVerifyTheme(theme);
    await waitForContent('Boolean(document.querySelector("#sign-up-form"))', 'Sign-up form');
    await captureScreen('05_sign_up', '/sign-up', theme, 'Sign-up registration form');
  }
  // Sign-up error state
  await applyAndVerifyTheme('dark');
  await nav(`${origin}/sign-up`);
  await applyAndVerifyTheme('dark', true);
  await waitForContent('Boolean(document.querySelector("#sign-up-form"))');
  await ev(`(()=>{
    const form = document.querySelector('#sign-up-form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await new Promise(r => setTimeout(r, 300));
  await captureScreen('05_sign_up_error', '/sign-up', 'dark', 'Sign-up validation/error state');

  // 6. P06 Verify Email
  console.log('\n--- Capturing P06: Verify Email ---');
  await applyAndVerifyTheme('dark');
  await nav(`${origin}/verify-email`);
  await applyAndVerifyTheme('dark', true);
  await waitForContent(undefined, 'Verify email direct visit');
  await captureScreen('06_verify_email_direct', '/verify-email', 'dark', 'Verify email direct visit without pending state');

  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/verify-email?email=ada%40zur.internal`);
    await applyAndVerifyTheme(theme);
    await waitForContent(undefined, 'Verify email with address');
    await captureScreen('06_verify_email_context', '/verify-email?email=ada@zur.internal', theme, 'Verify email with known email address');
  }

  // 7. P07 Forgot Password
  console.log('\n--- Capturing P07: Forgot Password ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/forgot-password`);
    await applyAndVerifyTheme(theme);
    await waitForContent('Boolean(document.querySelector("#forgot-password-form"))', 'Forgot password form');
    await captureScreen('07_forgot_password', '/forgot-password', theme, 'Forgot password request form');
  }
  // Forgot password submitted state
  await applyAndVerifyTheme('dark');
  await nav(`${origin}/forgot-password`);
  await applyAndVerifyTheme('dark', true);
  await waitForContent('Boolean(document.querySelector("#forgot-password-form"))');
  await ev(`(()=>{
    const emailInput = document.querySelector('#email');
    if (emailInput) {
      emailInput.value = 'ada@zur.internal';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.querySelector('#forgot-password-form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await new Promise(r => setTimeout(r, 400));
  await captureScreen('07_forgot_password_submitted', '/forgot-password', 'dark', 'Forgot password confirmation screen');

  // 8. P07 Reset Password
  console.log('\n--- Capturing P07: Reset Password ---');
  await applyAndVerifyTheme('dark');
  await nav(`${origin}/reset-password?token=${sampleResetToken}`);
  await applyAndVerifyTheme('dark', true);
  await waitForContent(undefined, 'Reset password form with token');
  await captureScreen('07_reset_password_valid', `/reset-password?token=${sampleResetToken}`, 'dark', 'Reset password form with valid token');

  await nav(`${origin}/reset-password?token=expired-invalid-token`);
  await waitForContent(undefined, 'Reset password expired token');
  await captureScreen('07_reset_password_invalid', '/reset-password?token=expired-invalid-token', 'dark', 'Reset password invalid/expired token notice');

  // 9. P08 Invitation / Join
  console.log('\n--- Capturing P08: Join Course Invitation ---');
  await applyAndVerifyTheme('dark');
  await nav(`${origin}/join/${sampleInviteToken}`);
  await applyAndVerifyTheme('dark', true);
  await waitForContent(undefined, 'Join course with invitation');
  await captureScreen('08_invitation_valid', `/join/${sampleInviteToken}`, 'dark', 'Valid course invitation preview');

  await nav(`${origin}/join/invalid-or-revoked-token`);
  await waitForContent(undefined, 'Invalid invitation');
  await captureScreen('08_invitation_invalid', '/join/invalid-or-revoked-token', 'dark', 'Invalid invitation notice');

  // 10. P40 Help
  console.log('\n--- Capturing P40: Help Page ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/help`);
    await applyAndVerifyTheme(theme);
    await waitForContent('document.body.innerText.includes("Help")', 'Help page');
    await captureScreen('09_help', '/help', theme, 'Help and documentation topics', true);
  }

  // 11. P41 Privacy & Terms
  console.log('\n--- Capturing P41: Privacy Policy ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/privacy`);
    await applyAndVerifyTheme(theme);
    await waitForContent('document.body.innerText.includes("Privacy")', 'Privacy notice');
    await captureScreen('10_privacy', '/privacy', theme, 'Privacy policy status notice');
  }

  console.log('\n--- Capturing P41: Terms of Service ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/terms`);
    await applyAndVerifyTheme(theme);
    await waitForContent('document.body.innerText.includes("Terms")', 'Terms notice');
    await captureScreen('11_terms', '/terms', theme, 'Terms of service status notice');
  }

  // 12. P42 Access Denied & Not Found
  console.log('\n--- Capturing P42: Access Denied ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/access-denied`);
    await applyAndVerifyTheme(theme);
    await waitForContent(undefined, 'Access denied page');
    await captureScreen('12_access_denied', '/access-denied', theme, 'Access denied safe state page');
  }

  console.log('\n--- Capturing P42: Not Found ---');
  for (const theme of ['dark', 'light'] as const) {
    await nav(`${origin}/not-found`);
    await applyAndVerifyTheme(theme);
    await waitForContent(undefined, 'Not found page');
    await captureScreen('13_not_found', '/not-found', theme, 'Not found 404 safe state page');
  }

  // Save/merge manifest JSON
  const manifestPath = path.join(baseOutputDir, 'manifest.json');
  let fullManifest: Record<string, CapturedItem[]> = {};
  if (fs.existsSync(manifestPath)) {
    try {
      fullManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {}
  }
  fullManifest[phase] = capturedManifest;
  fs.writeFileSync(manifestPath, JSON.stringify(fullManifest, null, 2));

  console.log(`\n✓ Successfully captured ${capturedManifest.length} screens for phase "${phase}".`);
  console.log(`✓ Manifest updated at ${manifestPath}\n`);

} catch (err: any) {
  console.error('\n✗ Error during capture run:', err);
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

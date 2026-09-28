import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';

const root = process.cwd();
const scratchDir = '/home/compilelord/.gemini/antigravity-cli/brain/9d6b60d2-193d-4681-806a-b727dd3349d0/scratch';
const defaultScratchDir = fs.existsSync(scratchDir) ? path.join(scratchDir, 'screenshots') : path.join(os.tmpdir(), 'zur-s4-screenshots');
const screenshotsDir = process.env.SCREENSHOTS_DIR || defaultScratchDir;
fs.mkdirSync(screenshotsDir, { recursive: true });

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-s4-browser-'));
const dbPath = path.join(temp, 's4-journey.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

const now = new Date().toISOString();

// 1. Seed published Spanish course to verify multilingual catalog
db.prepare(`
  INSERT INTO courses (id, owner_id, title, description, category_id, difficulty, language, publication_status, visibility, enrollment_policy, is_suspended, created_at, updated_at)
  VALUES ('course-python-es', 'user-author-1', 'Curso de Fundamentos de Python', 'Aprende programación en Python desde cero con ejercicios interactivos y validación automática.', 'cat-programming', 'beginner', 'es', 'published', 'public', 'open', 0, ?, ?)
`).run(now, now);

const spanishSnapshot = JSON.stringify({
  courseId: 'course-python-es',
  versionNumber: 1,
  title: 'Curso de Fundamentos de Python',
  description: 'Versión inicial en español',
  modules: []
});
db.prepare(`
  INSERT INTO course_versions (id, course_id, version_number, snapshot_data, created_at)
  VALUES ('ver-es-1', 'course-python-es', 1, ?, ?)
`).run(spanishSnapshot, now);
db.prepare("UPDATE courses SET current_version_id = 'ver-es-1' WHERE id = 'course-python-es'").run();

// 2. Seed single passed attempt to generate real 24h telemetry (1 attempt, 0 failures -> 0.00% error rate)
const enrAda = db.prepare("SELECT id, user_id, pinned_version_id FROM enrollments WHERE id='enr-ada'").get() as any;
if (enrAda) {
  db.prepare(`INSERT INTO assessment_attempts (id, enrollment_id, user_id, step_id, course_version_id, attempt_number, type, verdict, is_infrastructure_failure, created_at)
    VALUES ('att-journey-1', ?, ?, 'step-4-python-echo', ?, 1, 'python', 'passed', 0, ?)`).run(enrAda.id, enrAda.user_id, enrAda.pinned_version_id, now);
}

// 3. Seed report with exact historical version 1
const v1Row = db.prepare("SELECT id, version_number FROM course_versions WHERE course_id='course-python-foundations' ORDER BY version_number ASC LIMIT 1").get() as any;
db.prepare(`INSERT INTO reports(id, reporter_id, course_id, course_version_id, step_id, type, description, status, created_at, updated_at)
  VALUES('rep-exact-v1', 'user-student-1', 'course-python-foundations', ?, 'step-4-python-echo', 'broken_exercise', 'Input parsing differs in lesson 4.', 'open', ?, ?)`).run(v1Row.id, now, now);

// 4. Seed report with missing snapshot (no course_version_id) for safe unavailable state
db.prepare(`INSERT INTO reports(id, reporter_id, course_id, course_version_id, step_id, type, description, status, created_at, updated_at)
  VALUES('rep-missing-snap', 'user-student-1', 'course-python-foundations', NULL, NULL, 'inappropriate_content', 'General course feedback without version snapshot.', 'open', ?, ?)`).run(now, now);

const api = createServer(db);
let vite: ReturnType<typeof spawn> | undefined;
let chrome: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port unavailable');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise((r) => setTimeout(r, 50));
  return port;
}

async function stop(child?: ReturnType<typeof spawn>): Promise<void> {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 2500);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
    child.kill('SIGTERM');
  });
}

async function ready(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`not ready: ${url}`);
}

async function main() {
  console.log('--- Starting S4 Real Browser Journey ---');
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', () => resolve()));
  const apiPort = (api.address() as any).port;
  const vitePort = await freePort();
  const viteConfigPath = path.join(temp, 'vite.config.mjs');
  fs.writeFileSync(viteConfigPath, `
export default {
  root: ${JSON.stringify(path.join(root, 'packages/web'))},
  server: {
    host: '127.0.0.1',
    port: ${vitePort},
    strictPort: false,
    proxy: {
      '/api': 'http://127.0.0.1:${apiPort}'
    }
  }
};
  `);

  let viteLogs = '';
  let webOrigin = '';
  vite = spawn(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'),
    '--config', viteConfigPath,
    '--port', String(vitePort)
  ], {
    cwd: path.join(root, 'packages/web'),
    stdio: 'pipe',
    env: { ...process.env, ZUR_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` }
  });

  const webOriginPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Vite did not print origin within 10s. Logs:\n${viteLogs}`)), 10000);
    vite!.stdout?.on('data', (d) => {
      const text = String(d);
      viteLogs += text;
      const match = text.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    vite!.stderr?.on('data', (d) => { viteLogs += String(d); });
  });

  webOrigin = await webOriginPromise;
  await ready(webOrigin);
  console.log(`Vite dev server ready at ${webOrigin} proxying /api to port ${apiPort}`);

  chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${path.join(temp, 'chrome')}`,
    'about:blank'
  ], { stdio: 'pipe' });

  const chromeWsUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome did not print debug port within 10s')), 10000);
    chrome!.stderr?.on('data', async (d) => {
      const match = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        const boundPort = match[1];
        try {
          for (let i = 0; i < 30; i++) {
            const list = await (await fetch(`http://127.0.0.1:${boundPort}/json/list`)).json() as any[];
            const page = list.find((entry) => entry.type === 'page');
            if (page?.webSocketDebuggerUrl) {
              resolve(page.webSocketDebuggerUrl);
              return;
            }
            await new Promise((r) => setTimeout(r, 100));
          }
          reject(new Error('No page target found in Chrome json/list'));
        } catch (err) {
          reject(err);
        }
      }
    });
  });

  socket = new WebSocket(chromeWsUrl);
  await new Promise<void>((resolve, reject) => {
    socket!.addEventListener('open', () => resolve(), { once: true });
    socket!.addEventListener('error', () => reject(new Error('CDP connection failed')), { once: true });
  });

  let nextId = 0;
  const pending = new Map<number, (value: any) => void>();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      pending.get(message.id)?.(message.result);
      pending.delete(message.id);
    }
  });

  const command = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      socket!.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression: string) =>
    (await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;

  const wait = async (expression: string, label: string) => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`${label}: ${await evaluate('document.body.innerText.slice(0, 500)')}`);
  };

  const navigate = async (url: string) => {
    await command('Page.navigate', { url });
    await wait(`location.href.startsWith(${JSON.stringify(url.split('?')[0])})`, `navigation to ${url}`);
  };

  const capture = async (name: string) => {
    const shot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const targetPath = path.join(screenshotsDir, name);
    fs.writeFileSync(targetPath, Buffer.from(shot.data, 'base64'));
    console.log(`[Screenshot] ${targetPath}`);
  };

  await command('Page.enable');
  await command('Runtime.enable');

  // =========================================================================
  // JOURNEY 1: P02 Desktop Catalog & Spanish Language Filter
  // =========================================================================
  console.log('Journey 1: Testing P02 Desktop Language Filter...');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`${webOrigin}/courses`);
  await wait('Boolean(document.querySelector("[data-catalog-loaded=true]") && document.getElementById("filter-language"))', 'catalog loaded with language filter');

  // Assert language dropdown contains Spanish
  await wait(`Array.from(document.getElementById("filter-language")?.options || []).some(o => o.value === "es")`, 'filter-language dropdown populated with Spanish');

  // Select Spanish filter
  await evaluate(`(()=>{
    const sel = document.getElementById("filter-language");
    sel.value = "es";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);

  // Wait for URL and courses to update
  await wait('location.search.includes("language=es")', 'URL updated with ?language=es');
  await wait('Boolean(document.querySelector("[data-catalog-loaded=true]") && document.querySelectorAll(".course-row").length === 1)', 'single course listed');

  const courseTitle = await evaluate('document.querySelector(".course-row-title")?.innerText');
  if (!courseTitle || !courseTitle.includes('Curso de Fundamentos de Python')) {
    throw new Error(`Expected Spanish course, but found: ${courseTitle}`);
  }
  const resultText = await evaluate('document.querySelector(".catalog-results-count")?.innerText');
  if (!resultText || !resultText.includes('1 course')) {
    throw new Error(`Expected 1 course count, but found: ${resultText}`);
  }
  await capture('s4_journey_p02_desktop_spanish.png');
  console.log('✓ Journey 1 (P02 Desktop Spanish filter) verified successfully.');

  // =========================================================================
  // JOURNEY 2: P02 Mobile Catalog & Spanish Language Filter
  // =========================================================================
  console.log('Journey 2: Testing P02 Mobile Language Filter...');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${webOrigin}/courses`);
  await wait('Boolean(document.querySelector("[data-catalog-loaded=true]") && document.querySelector("[data-action=open-sheet]"))', 'mobile catalog loaded');

  // Open mobile filter sheet
  await evaluate(`(()=>{
    const btn = document.querySelector("[data-action=open-sheet]");
    btn?.click();
    return true;
  })()`);
  await wait('Boolean(document.getElementById("mobile-filter-sheet")?.classList.contains("open"))', 'mobile filter sheet open');

  await wait(`Array.from(document.getElementById("mobile-filter-language")?.options || []).some(o => o.value === "es")`, 'mobile-filter-language offers Spanish');

  // Select Spanish on mobile and apply
  await evaluate(`(()=>{
    const sel = document.getElementById("mobile-filter-language");
    sel.value = "es";
    document.querySelector("[data-action=apply-mobile-filters]").click();
    return true;
  })()`);

  await wait('location.search.includes("language=es")', 'mobile URL updated with ?language=es');
  await wait('Boolean(document.querySelector("[data-catalog-loaded=true]") && document.querySelectorAll(".course-row").length === 1)', 'mobile single course listed');
  await capture('s4_journey_p02_mobile_spanish.png');
  console.log('✓ Journey 2 (P02 Mobile Spanish filter) verified successfully.');

  // =========================================================================
  // JOURNEY 3: Admin Sign In & P32 Operations Overview (Internal-Error Rate)
  // =========================================================================
  console.log('Journey 3: Testing Admin Sign In & P32 Internal-Error Rate...');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(`${webOrigin}/sign-in`);
  await wait('Boolean(document.getElementById("sign-in-form"))', 'sign-in form loaded');

  // Fill in admin credentials (Margaret Hamilton)
  await evaluate(`(()=>{
    document.getElementById("email").value = "margaret@zur.internal";
    document.getElementById("password").value = "AdminPass123!";
    document.getElementById("sign-in-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return true;
  })()`);
  await wait('Boolean(localStorage.getItem("zur_session_token"))', 'admin authenticated');

  // Navigate to Operations Overview
  await navigate(`${webOrigin}/admin`);
  await wait('document.body.innerText.includes("Internal-error rate")', 'P32 internal error rate card');

  const overviewText = await evaluate('document.body.innerText');
  if (!overviewText.includes('0.00%') || !overviewText.includes('0 5xx errors') || !overviewText.includes('Last 5 minutes')) {
    throw new Error(`P32 missing 5m platform internal error rate telemetry: ${overviewText.slice(0, 500)}`);
  }

  // Trigger a 404 client error to verify client errors do not pollute the 5xx numerator
  await evaluate('fetch("/api/nonexistent-route-for-client-error-test").then(r => r.status).catch(() => {})');
  await navigate(`${webOrigin}/admin`);
  await wait('document.body.innerText.includes("Internal-error rate")', 'P32 internal error rate refreshed');

  const overviewAfter4xx = await evaluate('document.body.innerText');
  if (!overviewAfter4xx.includes('0.00%') || !overviewAfter4xx.includes('0 5xx errors') || !overviewAfter4xx.includes('Last 5 minutes')) {
    throw new Error(`P32 5xx numerator polluted by 4xx client error: ${overviewAfter4xx.slice(0, 500)}`);
  }

  // Assert P32 internal-error rate card links to recent request metrics anchor and never execution records
  const hasMisleadingExecutionLink = await evaluate(`Boolean(
    Array.from(document.querySelectorAll(".admin-overview-card"))
      .find(c => c.querySelector("h2")?.textContent?.includes("Internal-error rate"))
      ?.querySelector('a[href="/admin/execution"]')
  )`);
  if (hasMisleadingExecutionLink) {
    throw new Error('P32 Internal-error rate card still contains misleading execution records link!');
  }

  const hasRequestMetricsAnchor = await evaluate(`Boolean(
    Array.from(document.querySelectorAll(".admin-overview-card"))
      .find(c => c.querySelector("h2")?.textContent?.includes("Internal-error rate"))
      ?.querySelector('a[href="#recent-request-metrics"]')
  )`);
  if (!hasRequestMetricsAnchor) {
    throw new Error('P32 Internal-error rate card missing anchor link to #recent-request-metrics!');
  }

  await capture('s4_journey_p32_admin_overview.png');
  console.log('✓ Journey 3 (P32 Operations Overview 5m platform error rate, anchor link, and 4xx exclusion) verified successfully.');

  // =========================================================================
  // JOURNEY 4: P36 Report Detail & Exact Link Click to P34 Exact Snapshot
  // =========================================================================
  console.log('Journey 4: Testing P36 Report Detail & Click to P34 Exact Snapshot...');
  await navigate(`${webOrigin}/admin/reports/rep-exact-v1`);
  await wait('Boolean(document.querySelector("[data-report-version-link]"))', 'P36 exact version link');

  const reportVersionText = await evaluate('document.querySelector("[data-report-version-link]")?.innerText');
  if (!reportVersionText || !reportVersionText.includes('Version 1') || !reportVersionText.includes('historical version, not newest')) {
    throw new Error(`P36 version link missing historical distinction: ${reportVersionText}`);
  }
  const reportStepText = await evaluate('document.querySelector("[data-report-step-link]")?.innerText');
  if (!reportStepText || !reportStepText.includes('Echoing Numbers (step-4-python-echo)')) {
    throw new Error(`P36 step link missing exact step: ${reportStepText}`);
  }
  await capture('s4_journey_p36_report_detail.png');

  // Click the exact immutable version link to navigate to P34
  await evaluate('document.querySelector("[data-report-version-link]").click()');
  await wait('location.pathname === "/admin/courses/course-python-foundations"', 'navigated to P34 course admin');
  await wait('location.search.includes("versionId=") && location.search.includes("stepId=step-4-python-echo")', 'P34 query params preserved');
  await wait('Boolean(document.querySelector(".exact-version-inspection-panel"))', 'P34 exact snapshot inspection panel rendered');

  const p34InspectionText = await evaluate('document.querySelector(".exact-version-inspection-panel")?.innerText');
  if (!p34InspectionText.includes('Version 1 · Historical') || !p34InspectionText.includes('Target step snapshot: Echoing Numbers')) {
    throw new Error(`P34 missing exact snapshot inspection: ${p34InspectionText}`);
  }

  const hasTechnicalDetails = await evaluate('Boolean(document.querySelector(".exact-version-inspection-panel details summary"))');
  if (!hasTechnicalDetails) {
    throw new Error('P34 missing collapsible technical snapshot details toggle');
  }

  // Verify waiver dropdown pre-selection matches exact version & step
  const waiverSelectedVal = await evaluate('document.querySelector("[data-waiver-step]")?.value');
  if (!waiverSelectedVal || !waiverSelectedVal.includes('step-4-python-echo')) {
    throw new Error(`P34 waiver dropdown not pre-selected to target step: ${waiverSelectedVal}`);
  }
  await capture('s4_journey_p34_course_inspection.png');
  console.log('✓ Journey 4 (P36 exact link click -> P34 immutable snapshot inspection) verified successfully.');

  // =========================================================================
  // JOURNEY 5: P36 Honest Unavailable State (No Snapshot Recorded)
  // =========================================================================
  console.log('Journey 5: Testing P36 Safe Unavailable State (no snapshot)...');
  await navigate(`${webOrigin}/admin/reports/rep-missing-snap`);
  await wait('Boolean(document.querySelector("[data-report-version-unavailable]"))', 'P36 unavailable indicator');

  const unavailText = await evaluate('document.querySelector("[data-report-version-unavailable]")?.innerText');
  if (!unavailText || !unavailText.includes('Unavailable — no version snapshot recorded')) {
    throw new Error(`Expected safe unavailable text, got: ${unavailText}`);
  }

  // Assert NO misleading clickable link to /admin/courses
  const hasMisleadingLink = await evaluate('Boolean(document.querySelector("[data-report-version-link]") || document.querySelector("a[href*=\\"versionId=\\"]"))');
  if (hasMisleadingLink) {
    throw new Error('Misleading clickable version link was rendered for a report with missing snapshot!');
  }
  await capture('s4_journey_p36_report_unavailable.png');
  console.log('✓ Journey 5 (P36 Safe Unavailable State) verified successfully.');

  // =========================================================================
  // JOURNEY 6: Responsive Mobile Checks for Admin Screens (P32, P36, P34)
  // =========================================================================
  console.log('Journey 6: Testing Admin Mobile Layouts...');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`${webOrigin}/admin`);
  await wait('document.body.innerText.includes("Internal-error rate")', 'P32 mobile loaded');
  await capture('s4_journey_p32_mobile.png');

  await navigate(`${webOrigin}/admin/reports/rep-exact-v1`);
  await wait('Boolean(document.querySelector("[data-report-version-link]"))', 'P36 mobile loaded');
  await capture('s4_journey_p36_mobile.png');

  await navigate(`${webOrigin}/admin/courses/course-python-foundations?versionId=${v1Row.id}&stepId=step-4-python-echo`);
  await wait('Boolean(document.querySelector(".exact-version-inspection-panel"))', 'P34 mobile loaded');
  await capture('s4_journey_p34_mobile.png');
  console.log('✓ Journey 6 (Responsive Mobile Admin Screens) verified successfully.');

  console.log('=== All 6 Real Browser Journeys Completed Successfully ===');
}

async function run() {
  try {
    await main();
  } finally {
    if (socket) {
      try { socket.close(); } catch {}
    }
    await stop(chrome);
    await stop(vite);
    await new Promise<void>((resolve) => api.close(() => resolve()));
    closeDatabase(dbPath);
    try {
      fs.rmSync(temp, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

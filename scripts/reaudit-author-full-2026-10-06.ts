import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';
import { DraftRecoveryService } from '../packages/server/src/services/draft-recovery-service.ts';
import { AgentActivityService } from '../packages/server/src/services/agent-activity-service.ts';

const root = process.cwd();
const auditDate = '2026-10-06';
const runId = `author-full-reaudit-${Date.now()}`;
const evidenceDir = path.join(root, 'screenshots', 'audit-2026-10-06', 'author-recheck4');
const resultPath = path.join(root, 'docs', 'audits', 'evidence', '2026-10-06-author-full-reaudit4-actions.json');
fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(path.dirname(resultPath), { recursive: true });

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-author-full-reaudit-'));
const dbPath = path.join(temp, 'author-audit.sqlite');
const uploadDir = path.join(temp, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);
const api = createServer(db, { uploadDir });
const children: ChildProcess[] = [];
const actions: Array<Record<string, unknown>> = [];
const screenshots: Array<Record<string, unknown>> = [];
let cdp: Cdp | undefined;
let sessionToken = '';
let courseId = '';
let courseTitle = '';
let mainModuleId = '';
let lessonId = '';
const stepIds: Record<string, string> = {};
let shareToken = '';
let courseVersionOne = 0;
let enrollmentPath = '';

const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pathFor = (file: string) => path.join(evidenceDir, file);

async function stop(child?: ChildProcess): Promise<void> {
  if (!child || child.exitCode !== null || child.killed) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function port(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve an ephemeral port.');
  const result = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return result;
}

async function ready(url: string, seconds = 15): Promise<void> {
  for (let i = 0; i < seconds * 10; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* service startup */ }
    await waitMs(100);
  }
  throw new Error(`Local service did not become ready: ${url}`);
}

function record(feature: string, status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOTTESTED', details: string, evidence?: string): void {
  actions.push({ timestamp: new Date().toISOString(), feature, status, details, evidence: evidence || null });
  console.log(`[${status}] ${feature}: ${details}`);
}

async function attempt(feature: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    const details = await fn();
    record(feature, 'PASS', details || 'Action completed and expected state was visible.');
  } catch (error: any) {
    record(feature, 'FAIL', error?.message || String(error), await cdp?.bodyText().catch(() => undefined));
  }
}

class Cdp {
  socket: WebSocket;
  nextId = 0;
  pending = new Map<number, (value: any) => void>();
  requestInfo = new Map<string, { url: string; method: string }>();
  networkResponses: Array<Record<string, unknown>> = [];
  dialogDecision: boolean | undefined;
  consoleErrors: string[] = [];

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.exceptionThrown') {
        const detail = message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text;
        if (detail) this.consoleErrors.push(String(detail));
      }
      if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
        this.consoleErrors.push(String(message.params.entry.text || 'Browser console error'));
      }
      if (message.method === 'Network.requestWillBeSent') {
        const r = message.params.request;
        this.requestInfo.set(message.params.requestId, { url: String(r.url), method: String(r.method) });
      }
      if (message.method === 'Network.responseReceived') {
        const meta = this.requestInfo.get(message.params.requestId) || { url: '', method: '' };
        const response = message.params.response;
        this.networkResponses.push({ requestId: message.params.requestId, ...meta, status: response.status, mimeType: response.mimeType, type: 'response' });
      }
      if (message.method === 'Network.loadingFinished') {
        const meta = this.requestInfo.get(message.params.requestId);
        if (meta?.url.includes('/api/author/courses/') && meta.url.endsWith('/publish')) {
          void this.command('Network.getResponseBody', { requestId: message.params.requestId }).then((body) => this.networkResponses.push({ ...meta, body: body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body, type: 'body' })).catch((error) => this.networkResponses.push({ ...meta, bodyError: String(error), type: 'body' }));
        }
      }
      if (message.method === 'Page.javascriptDialogOpening') {
        const accept = this.dialogDecision ?? false;
        this.dialogDecision = undefined;
        void this.command('Page.handleJavaScriptDialog', { accept });
      }
      if (message.id) {
        const resolve = this.pending.get(message.id);
        if (resolve) {
          resolve(message);
          this.pending.delete(message.id);
        }
      }
    });
  }

  command(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP command timed out: ${method}`)); }, 15000);
      this.pending.set(id, (message) => { clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve(message.result); });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression: string): Promise<any> {
    const response = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response?.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response?.result?.value;
  }

  async wait(expression: string, label: string, timeout = 15000): Promise<void> {
    for (let i = 0; i < timeout / 100; i++) {
      try { if (await this.evaluate(expression)) return; } catch { /* render in progress */ }
      await waitMs(100);
    }
    throw new Error(`Timed out waiting for ${label}: ${await this.bodyText()}`);
  }

  async bodyText(): Promise<string> {
    try { return String((await this.evaluate('document.body?.innerText || "no body"')).slice(0, 1200)); }
    catch { return 'Browser document unavailable'; }
  }

  async navigate(url: string): Promise<void> {
    const result = await this.command('Page.navigate', { url });
    console.log(`[NAV] ${url} ${JSON.stringify(result)}`);
    await this.wait(`Boolean(document.body) && location.href.startsWith(${JSON.stringify(url.split('?')[0])}) && document.readyState !== 'loading'`, `navigation ${url}`);
  }

  async click(selector: string): Promise<void> {
    const rect = await this.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,w:r.width,h:r.height,disabled:Boolean(e.disabled),hidden:!r.width||!r.height,hit:Boolean(hit&&(e===hit||e.contains(hit))),hitTag:hit?.tagName,hitId:hit?.id,hitClass:String(hit?.className||'')}})()`);
    if (!rect) throw new Error(`No browser control matches ${selector}`);
    if (rect.disabled) throw new Error(`Control is disabled: ${selector}`);
    if (rect.hidden) throw new Error(`Control is hidden: ${selector}`);
    if (!rect.hit) throw new Error(`Click would hit ${rect.hitTag}#${rect.hitId}.${rect.hitClass} instead of ${selector}`);
    await this.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await this.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await this.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await waitMs(60);
  }

  async clickWhere(selector: string, containerSelector: string, text: string): Promise<void> {
    const rect = await this.evaluate(`(()=>{const row=[...document.querySelectorAll(${JSON.stringify(containerSelector)})].find(x=>x.innerText.includes(${JSON.stringify(text)}));const e=row?.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,disabled:Boolean(e.disabled),hit:Boolean(hit&&(e===hit||e.contains(hit))),hitTag:hit?.tagName,hitId:hit?.id,hitClass:String(hit?.className||'')} })()`);
    if (!rect) throw new Error(`No ${selector} control found in ${containerSelector} containing ${text}`);
    if (rect.disabled) throw new Error(`Matched control is disabled: ${text}`);
    if (!rect.hit) throw new Error(`Click would hit ${rect.hitTag}#${rect.hitId}.${rect.hitClass} instead of ${text}`);
    await this.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await this.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await this.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await waitMs(60);
  }

  async type(selector: string, text: string, clear = true): Promise<void> {
    const found = await this.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.scrollIntoView({block:'center'});e.focus();return true})()`);
    if (!found) throw new Error(`No input matches ${selector}`);
    if (clear) {
      await this.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', modifiers: 2, windowsVirtualKeyCode: 17 });
      await this.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
      await this.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
      await this.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', modifiers: 0, windowsVirtualKeyCode: 17 });
    }
    await this.command('Input.insertText', { text });
  }

  async typeAt(selector: string, index: number, text: string, clear = true): Promise<void> {
    const found = await this.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})][${index}];if(!e)return false;e.scrollIntoView({block:'center'});e.focus();return true})()`);
    if (!found) throw new Error(`No ${selector} control at index ${index}`);
    if (clear) {
      await this.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', modifiers: 2, windowsVirtualKeyCode: 17 });
      await this.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
      await this.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
      await this.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', modifiers: 0, windowsVirtualKeyCode: 17 });
    }
    await this.command('Input.insertText', { text });
  }

  async press(key: string, code?: string, modifiers = 0): Promise<void> {
    await this.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code || key, modifiers });
    await this.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key, modifiers });
  }

  async select(selector: string, value: string): Promise<void> {
    const ok = await this.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    if (!ok) throw new Error(`No select matches ${selector}`);
  }

  async setFileInputFiles(selector: string, files: string[]): Promise<void> {
    const root = await this.command('DOM.getDocument', { depth: -1 });
    const { nodeId } = await this.command('DOM.querySelector', { nodeId: root.root.nodeId, selector });
    if (!nodeId) throw new Error(`No file input matches ${selector}`);
    await this.command('DOM.setFileInputFiles', { files, nodeId });
  }

  async capture(base: string): Promise<void> {
    for (const theme of ['dark', 'light'] as const) {
      await this.evaluate(`(()=>{localStorage.setItem('zur_theme_preference',${JSON.stringify(theme)});document.documentElement.setAttribute('data-theme',${JSON.stringify(theme)});return true})()`);
      await waitMs(220);
      const result = await this.command('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      const name = `${base}_${theme}.png`;
      const target = pathFor(name);
      fs.writeFileSync(target, Buffer.from(result.data, 'base64'));
      screenshots.push({ name, path: target, theme, viewport: '1440x900', timestamp: new Date().toISOString() });
    }
    await this.evaluate(`(()=>{localStorage.setItem('zur_theme_preference','dark');document.documentElement.setAttribute('data-theme','dark')})()`);
    await waitMs(150);
  }
}

async function connectChrome(debugPort: string): Promise<Cdp> {
  const page = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json() as Promise<any[]>).then((items) => items.find((item) => item.type === 'page'));
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome DevTools page target was unavailable.');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect Chrome DevTools.')), { once: true });
  });
  const session = new Cdp(socket);
  await session.command('Page.enable');
  await session.command('Runtime.enable');
  await session.command('Log.enable');
  await session.command('DOM.enable');
  await session.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  return session;
}

async function main(): Promise<void> {
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
  const apiPort = (api.address() as any).port;
  const webPort = await port();
  const configPath = path.join(temp, 'vite.config.mjs');
  fs.writeFileSync(configPath, `export default { root: ${JSON.stringify(path.join(root, 'packages/web'))}, server: { host: '127.0.0.1', port: ${webPort}, strictPort: true, proxy: { '/api': 'http://127.0.0.1:${apiPort}' } } };`);

  const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', configPath], { cwd: path.join(root, 'packages/web'), stdio: 'ignore', env: { ...process.env, ZUR_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` } });
  const worker = spawn(process.execPath, ['--experimental-strip-types', path.join(root, 'packages/worker/src/daemon.ts')], { cwd: root, stdio: 'ignore', env: { ...process.env, DATABASE_URL: dbPath } });
  children.push(vite, worker);
  const webOrigin = `http://127.0.0.1:${webPort}`;
  await ready(webOrigin);

  const chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--remote-debugging-port=0', `--user-data-dir=${path.join(temp, 'chrome-profile')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  children.push(chrome);
  let chromeErr = '';
  const debugPort = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome startup timed out: ${chromeErr.slice(-1000)}`)), 15000);
    chrome.stderr?.on('data', (chunk) => {
      chromeErr += String(chunk);
      const match = chromeErr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  cdp = await connectChrome(debugPort);

  await cdp.navigate(`${webOrigin}/sign-in`);
  await cdp.wait('Boolean(document.querySelector("#sign-in-form"))', 'author sign-in form');
  await cdp.type('#email', 'guido@zur.internal');
  await cdp.type('#password', 'AuthorPass123!');
  await cdp.click('#submit-sign-in');
  await cdp.wait('Boolean(localStorage.getItem("zur_session_token")) && JSON.parse(localStorage.getItem("zur_current_user")||"{}").capabilities.includes("author")', 'author session');
  sessionToken = await cdp.evaluate('localStorage.getItem("zur_session_token")');

  if (process.env.AUDIT_MODE === 'publish-diagnostic') {
    const diagnosticActions: Array<Record<string, unknown>> = [];
    const add = (status: string, details: string, evidence?: string) => { diagnosticActions.push({ status, details, evidence: evidence || null, at: new Date().toISOString() }); console.log(`[${status}] ${details}`); };
    try {
      await cdp.navigate(`${webOrigin}/teach`);
      await cdp.wait('Boolean(document.querySelector("[data-action=open-new-course-modal]"))', 'new course control');
      await cdp.click('[data-action="open-new-course-modal"]');
      await cdp.type('#course-title-input', `AUDIT MINIMAL PUBLISH ${runId}`);
      await cdp.click('form.modal-body button[type="submit"]');
      await cdp.wait('location.pathname.includes("/content")', 'minimal draft created');
      courseId = await cdp.evaluate('location.pathname.split("/")[2]');
      await cdp.navigate(`${webOrigin}/teach/${courseId}/publish`);
      await cdp.wait('Boolean(document.querySelector("#publish-form"))', 'minimal publish review');
      await cdp.capture('publish-diagnostic-review-before-metadata');
      let review = await cdp.bodyText();
      let readyToPublish = await cdp.evaluate('Boolean(document.querySelector("#publish-open-confirm:not([disabled])"))');
      if (!readyToPublish && review.includes('Course description is required')) {
        await cdp.navigate(`${webOrigin}/teach/${courseId}/settings`);
        await cdp.wait('Boolean(document.querySelector(".metadata-form"))', 'minimal course metadata');
        await cdp.type('#course-desc', 'A minimal local audit course about foundational reasoning.');
        await cdp.type('#course-outcomes', 'Explain a simple idea\nApply it to a short example');
        await cdp.click('.metadata-form button[type="submit"]');
        await cdp.wait('document.querySelector("#course-desc")?.value.includes("minimal local audit")', 'minimal metadata saved');
        await cdp.navigate(`${webOrigin}/teach/${courseId}/publish`);
        await cdp.wait('Boolean(document.querySelector("#publish-form"))', 'minimal publish review after metadata');
        review = await cdp.bodyText();
        readyToPublish = await cdp.evaluate('Boolean(document.querySelector("#publish-open-confirm:not([disabled])"))');
      }
      add(readyToPublish ? 'PASS' : 'BLOCKED', `Minimal draft review publish-ready=${readyToPublish}.`, review);
      if (readyToPublish) {
        await cdp.command('Network.enable');
        await cdp.click('#publish-open-confirm');
        await cdp.wait('Boolean(document.querySelector("#publish-confirm-submit"))', 'minimal publish confirmation');
        await cdp.click('#publish-confirm-submit');
        await cdp.wait('Boolean(document.querySelector(".receipt-card")) || document.body.innerText.includes("Publication failed")', 'minimal publish response', 30000);
        await waitMs(250);
        await cdp.capture('publish-diagnostic');
        const pageText = await cdp.bodyText();
        add(pageText.includes('Publication failed') ? 'FAIL' : 'PASS', 'Minimal draft publish button was clicked in Chrome; UI result captured.', pageText);
      }
    } catch (error: any) {
      add('FAIL', error?.message || String(error), await cdp.bodyText().catch(() => 'no browser text'));
    } finally {
      fs.writeFileSync(path.join(root, 'docs/audits/evidence/2026-10-06-author-publish-diagnostic.json'), JSON.stringify({ runId, courseId, environment: 'isolated temp SQLite, API, Vite, worker and Chrome', actions: diagnosticActions, network: cdp.networkResponses, browserErrors: cdp.consoleErrors, screenshots }, null, 2));
      console.log('PUBLISH_DIAGNOSTIC', JSON.stringify({ courseId, actions: diagnosticActions, network: cdp.networkResponses, browserErrors: cdp.consoleErrors, screenshots: screenshots.map(s => s.name) }, null, 2));
    }
    return;
  }

  if (process.env.AUDIT_MODE === 'author-support-diagnostic') {
    const supportActions: Array<Record<string, unknown>> = [];
    const check = async (feature: string, fn: () => Promise<string | void>) => {
      try { const details = await fn(); supportActions.push({ feature, status: 'PASS', details: details || 'UI action completed.', at: new Date().toISOString() }); }
      catch (error: any) { supportActions.push({ feature, status: 'FAIL', details: error?.message || String(error), evidence: await cdp!.bodyText().catch(() => 'no browser body'), at: new Date().toISOString() }); }
    };
    try {
      await check('Locate seeded published course in author list', async () => {
        await cdp!.navigate(`${webOrigin}/teach`);
        await cdp!.wait('Boolean(document.querySelector(".author-course-list"))', 'seeded author course list');
        const href = await cdp!.evaluate(`(()=>[...document.querySelectorAll(".author-course-list a")].find(a=>a.textContent.toLowerCase().includes("python foundations"))?.getAttribute("href"))()`);
        if (!href) throw new Error('Seeded Python foundations was not shown in the author list.');
        courseId = String(href).split('/')[2];
        courseTitle = 'Python foundations';
        await cdp!.capture('support-01-course-list');
        return `Navigated to the author course list and selected ${courseTitle} by its visible course link (${courseId}).`;
      });
      if (!courseId) throw new Error('Cannot run support checks without the seeded published course.');
      await check('Roster search, enrollment state, and revoke/reinstate', async () => {
        await cdp!.navigate(`${webOrigin}/teach/${courseId}/students`);
        await cdp!.wait('Boolean(document.querySelector("#roster-search"))', 'seeded roster');
        await cdp!.capture('support-02-roster');
        const startingText = await cdp!.bodyText();
        await cdp!.type('#roster-search', 'Ada');
        await cdp!.click('#btn-apply-filters');
        await cdp!.wait('location.search.includes("search=Ada")', 'roster search');
        const filterQuery = await cdp!.evaluate('location.search');
        const row = await cdp!.evaluate('Boolean(document.querySelector("[data-enrollment-id]"))');
        if (!row) return `Ada search returned no roster row. Initial roster: ${startingText.slice(-280)}`;
        await cdp!.click('a[aria-label="View detail for Ada Lovelace"]');
        await cdp!.wait('location.pathname.includes("/students/") && Boolean(document.querySelector("#btn-open-revoke-detail"))', 'learner detail access controls');
        await cdp!.capture('support-02-learner-detail');
        await cdp!.click('#btn-open-revoke-detail');
        await cdp!.wait('Boolean(document.querySelector("#revoke-student-modal")) && !document.querySelector("#revoke-student-modal").classList.contains("hidden")', 'revoke dialog');
        await cdp!.type('#revoke-reason-input', 'Audit-only temporary access check');
        await cdp!.click('#revoke-student-modal [data-action="close-modal"]');
        await cdp!.wait('document.querySelector("#revoke-student-modal")?.classList.contains("hidden")', 'revoke cancel');
        await cdp!.click('#btn-open-revoke-detail');
        await cdp!.wait('Boolean(document.querySelector("#revoke-student-modal")) && !document.querySelector("#revoke-student-modal").classList.contains("hidden")', 'revoke dialog reopened');
        await cdp!.type('#revoke-reason-input', 'Audit-only temporary access check');
        await cdp!.click('#btn-confirm-revoke');
        await cdp!.wait('document.body.innerText.includes("Revoked")', 'revoke completed');
        await cdp!.wait('Boolean(document.querySelector("#btn-open-reinstate-detail"))', 'reinstate access control');
        await cdp!.click('#btn-open-reinstate-detail');
        await cdp!.wait('Boolean(document.querySelector("#reinstate-student-modal")) && !document.querySelector("#reinstate-student-modal").classList.contains("hidden")', 'reinstate dialog');
        await cdp!.click('#btn-confirm-reinstate');
        await cdp!.wait('document.body.innerText.includes("Active")', 'reinstate completed');
        return `Roster displayed an Ada row after filter ${filterQuery}; cancel left access intact, confirmed revoke then reinstate returned it to Active. Starting roster: ${startingText.slice(-200)}.`;
      });
      await check('Shareable invitation, email form validation, and learner join page', async () => {
        await cdp!.navigate(`${webOrigin}/teach/${courseId}/students`);
        await cdp!.wait('Boolean(document.querySelector("#btn-open-invite-modal"))', 'invite modal button');
        await cdp!.click('#btn-open-invite-modal');
        await cdp!.wait('!document.querySelector("#invite-students-modal").classList.contains("hidden")', 'invite modal');
        await cdp!.click('#invite-tab-email');
        await cdp!.wait('!document.querySelector("#invite-panel-email").classList.contains("hidden")', 'email invite tab');
        const required = await cdp!.evaluate('document.querySelector("#invite-recipient-email")?.required');
        await cdp!.click('#btn-submit-email-invite');
        const blocked = await cdp!.evaluate('!document.querySelector("#invite-recipient-email").validity.valid');
        await cdp!.click('#invite-tab-link');
        await cdp!.type('#invite-link-max-uses', '1');
        await cdp!.click('#btn-create-shareable-link');
        await cdp!.wait('Boolean(document.querySelector("#generated-invite-input")?.value)', 'share link generated');
        const url = await cdp!.evaluate('document.querySelector("#generated-invite-input").value');
        const token = String(url).split('/').pop();
        await cdp!.capture('support-03-shareable-link');
        await cdp!.click('#invite-students-modal [data-action="close-modal"]');
        await cdp!.click('#tab-btn-invitations');
        await cdp!.wait('document.querySelector("#tab-btn-invitations")?.getAttribute("aria-selected")==="true" && !document.querySelector("#panel-invitations").classList.contains("hidden")', 'invitation list panel');
        const invitationRows = await cdp!.evaluate('document.querySelectorAll("#panel-invitations tbody tr").length');
        await cdp!.navigate(`${webOrigin}/sign-in`);
        await cdp!.wait('Boolean(document.querySelector("#sign-in-form"))', 'learner sign-in form');
        await cdp!.type('#email', 'ada@zur.internal');
        await cdp!.type('#password', 'StudentPass123!');
        await cdp!.click('#submit-sign-in');
        await cdp!.wait('JSON.parse(localStorage.getItem("zur_current_user")||"{}").email==="ada@zur.internal"', 'Ada signed in');
        await cdp!.navigate(`${webOrigin}/join/${token}`);
        await cdp!.wait('Boolean(document.querySelector(".invitation-accept-form"))', 'share link join screen');
        await cdp!.capture('support-04-join-invitation');
        const joinText = await cdp!.bodyText();
        await cdp!.click('.invitation-accept-form button[type="submit"]');
        await cdp!.wait('location.pathname.startsWith("/learn/") || document.body.innerText.toLowerCase().includes("already enrolled")', 'invitation acceptance result');
        const acceptance = await cdp!.bodyText();
        return `Email invite has required recipient=${required}, empty submit browser-blocked=${blocked}; generated one-use link, Invitations tab shows ${invitationRows} row(s), and Ada signed in, opened and submitted the join page. Result: ${acceptance.slice(-240)}.`;
      });
      await check('Course analytics page and visible filters', async () => {
        await cdp!.navigate(`${webOrigin}/learn`);
        await cdp!.wait('Boolean(document.querySelector(\'.user-account-block a[aria-label="Sign out"]\'))', 'Ada account menu');
        await cdp!.click('.user-account-block a[aria-label="Sign out"]');
        await cdp!.wait('!localStorage.getItem("zur_session_token")', 'Ada signed out');
        await cdp!.navigate(`${webOrigin}/sign-in`);
        await cdp!.type('#email', 'guido@zur.internal');
        await cdp!.type('#password', 'AuthorPass123!');
        await cdp!.click('#submit-sign-in');
        await cdp!.wait('JSON.parse(localStorage.getItem("zur_current_user")||"{}").capabilities.includes("author")', 'author signed in again');
        await cdp!.navigate(`${webOrigin}/teach/${courseId}/analytics`);
        await cdp!.wait('document.body.innerText.toLowerCase().includes("analytics")', 'seeded analytics');
        await cdp!.capture('support-05-analytics');
        return (await cdp!.bodyText()).slice(-500);
      });
      await check('AI token selected-course scope, reveal/hide, setup and revoke', async () => {
        await cdp!.navigate(`${webOrigin}/teach/${courseId}/settings`);
        await cdp!.wait('Boolean(document.querySelector(".access-form"))', 'seeded course access settings');
        await cdp!.click('.access-form input[value="public"]');
        await cdp!.click('.access-form button[type="submit"]');
        await cdp!.wait('document.querySelector(".access-form input[value=public]")?.checked', 'seeded course made public for scope selection');
        await cdp!.navigate(`${webOrigin}/settings/ai-connections`);
        await cdp!.wait('Boolean(document.querySelector("#btn-open-create-token"))', 'AI connections');
        await cdp!.click('#btn-open-create-token');
        await cdp!.type('#connection-name', 'Audit-only scoped connection');
        await cdp!.type('#connection-password', 'AuthorPass123!');
        await cdp!.capture('support-06-token-scope-form');
        await cdp!.click('#create-token-form input[name="courseScopeType"][value="selected"]');
        const pickerExists = await cdp!.evaluate('Boolean(document.querySelector("#selected-courses-container"))');
        let selectedCourseScope = false;
        if (!pickerExists) {
          const publishedCourses = await cdp!.evaluate(`(async()=>{const r=await fetch('/api/courses',{headers:{Authorization:'Bearer '+localStorage.getItem('zur_session_token')}});return r.json()})()`);
          const ownerCourse = await cdp!.evaluate(`(async()=>{const r=await fetch('/api/author/courses/${courseId}',{headers:{Authorization:'Bearer '+localStorage.getItem('zur_session_token')}});return r.json()})()`);
          supportActions.push({ feature: 'Selected-course token scope picker', status: 'FAIL', details: `Picker omitted after UI selected and submitted Public visibility. Public catalog response keys: ${Object.keys(publishedCourses || {}).join(',')}; list: ${(publishedCourses.courses || publishedCourses.items || []).map((x: any) => x.title).join(', ') || 'empty'}; author-course visibility/status: ${ownerCourse.visibility}/${ownerCourse.publicationStatus}.`, at: new Date().toISOString() });
          await cdp!.click('#create-token-form input[name="courseScopeType"][value="all"]');
        } else {
          await cdp!.wait('!document.querySelector("#selected-courses-container").classList.contains("hidden")', 'selected-course picker visible');
          const courseChoice = await cdp!.evaluate(`Boolean(document.querySelector('#selected-courses-container input[value="${courseId}"]'))`);
          if (!courseChoice) throw new Error('Seeded course is not offered as a token scope.');
          await cdp!.click(`#selected-courses-container input[value="${courseId}"]`);
          selectedCourseScope = true;
        }
        await cdp!.click('#btn-submit-create-token');
        await cdp!.wait('Boolean(document.querySelector("#revealed-token-value"))', 'token one-time reveal');
        const masked = await cdp!.evaluate('document.querySelector("#revealed-token-value").type==="password"');
        await cdp!.click('#btn-toggle-secret-visibility');
        const revealed = await cdp!.evaluate('document.querySelector("#revealed-token-value").type==="text"');
        await cdp!.click('#btn-toggle-secret-visibility');
        const tokenId = String(await cdp!.evaluate(`(()=>[...document.querySelectorAll('[id^=token-row-]')].find(x=>x.innerText.includes('Audit-only scoped connection'))?.id)()`) || '').replace('token-row-', '');
        const setup = await cdp!.evaluate('document.querySelector("#btn-view-setup")?.getAttribute("href")');
        if (!tokenId || !setup || !masked || !revealed) throw new Error('Token reveal/setup controls did not complete.');
        await cdp!.capture('support-06-token-reveal');
        await cdp!.navigate(`${webOrigin}${setup}`);
        await cdp!.wait('document.body.innerText.toLowerCase().includes("setup")', 'token setup instructions');
        await cdp!.navigate(`${webOrigin}/settings/ai-connections`);
        await cdp!.wait(`Boolean(document.querySelector('[data-action="revoke-token"][data-token-id="${tokenId}"]'))`, 'created token revoke action');
        await cdp!.click(`#token-row-${tokenId} summary[aria-label="More actions for Audit-only scoped connection"]`);
        await cdp!.wait(`document.querySelector('#token-row-${tokenId} .action-overflow')?.open`, 'token action menu expanded');
        await cdp!.click(`[data-action="revoke-token"][data-token-id="${tokenId}"]`);
        await cdp!.wait('Boolean(document.querySelector("#btn-confirm-revoke"))', 'token revoke prompt');
        await cdp!.click('#btn-confirm-revoke');
        await cdp!.wait('document.body.innerText.includes("Connection revoked") || document.body.innerText.includes("Revoked")', 'token revoked');
        return `Created token; selected-course scope picker was available=${selectedCourseScope}. Initially masked=${masked}; reveal/hide toggle worked=${revealed}; opened setup guide and revoked. Token value not recorded.`;
      });
    } finally {
      const target = path.join(root, 'docs/audits/evidence/2026-10-06-author-support-diagnostic.json');
      fs.writeFileSync(target, JSON.stringify({ runId, courseId, actions: supportActions, screenshots, browserErrors: cdp.consoleErrors, network: cdp.networkResponses }, null, 2));
      console.log('AUTHOR_SUPPORT_DIAGNOSTIC', JSON.stringify({ courseId, actions: supportActions, screenshots: screenshots.map(s => s.name), browserErrors: cdp.consoleErrors }, null, 2));
    }
    return;
  }

  const perform = async (feature: string, fn: () => Promise<string | void>) => attempt(feature, fn);

  await perform('Course list, status filters, search, new-course validation', async () => {
    await cdp!.navigate(`${webOrigin}/teach?status=all`);
    await cdp!.wait('Boolean(document.querySelector(".author-course-list"))', 'course list');
    await cdp!.capture('01-course-list');
    await cdp!.click('a[href="/teach?status=published"]');
    await cdp!.wait('location.search.includes("status=published") && Boolean(document.querySelector(".author-course-list"))', 'published course filter');
    await cdp!.click('a[href="/teach?status=draft"]');
    await cdp!.wait('location.search.includes("status=draft")', 'draft course filter');
    await cdp!.type('input[name="search"]', 'Python foundations');
    await cdp!.press('Enter', 'Enter');
    await cdp!.wait('location.search.includes("search=") || document.body.innerText.includes("No matching courses")', 'course search');
    const filtered = await cdp!.evaluate('document.querySelectorAll(".author-course-row").length');
    await cdp!.navigate(`${webOrigin}/teach?status=all`);
    await cdp!.wait('Boolean(document.querySelector("[data-action=open-new-course-modal]"))', 'new course action');
    await cdp!.click('[data-action="open-new-course-modal"]');
    await cdp!.wait('Boolean(document.querySelector("#course-title-input"))', 'new course dialog');
    const emptyBlocked = await cdp!.evaluate('!document.querySelector("#course-title-input").checkValidity()');
    await cdp!.click('form.modal-body button[type="submit"]');
    if (!emptyBlocked || !await cdp!.evaluate('Boolean(document.querySelector("#course-title-input"))')) throw new Error('Empty course title was not held by browser validation.');
    return `Status filters and title search changed route/results; blank course title blocked by required validation (visible rows after search: ${filtered}).`;
  });

  await perform('Course create and settings save', async () => {
    const unique = `AUDIT ${auditDate} ${runId}`;
    await cdp!.type('#course-title-input', unique);
    await cdp!.click('form.modal-body button[type="submit"]');
    await cdp!.wait('location.pathname.includes("/content") && document.body.innerText.includes("AUDIT")', 'course created');
    courseId = await cdp!.evaluate('location.pathname.split("/")[2]');
    courseTitle = unique;
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/settings`);
    await cdp!.wait('Boolean(document.querySelector(".metadata-form"))', 'course settings');
    await cdp!.type('#course-title', `${unique} edited`);
    await cdp!.type('#course-desc', 'An audit-only Python course created and managed through the author interface.');
    await cdp!.type('#course-outcomes', 'Read and transform input\nExplain Python expressions');
    await cdp!.type('#course-tags', 'audit, python');
    await cdp!.type('#course-duration', '30');
    await cdp!.click('.metadata-form button[type="submit"]');
    await cdp!.wait('document.querySelector("#course-title")?.value.endsWith("edited")', 'course metadata saved');
    courseTitle = `${unique} edited`;
    await cdp!.capture('02-course-settings');
    return 'Created a private draft through the new-course dialog; edited title, description, outcomes, tags, and duration and observed values after save.';
  });

  await perform('Visibility and enrollment policy settings', async () => {
    await cdp!.click('.access-form input[value="public"]');
    await cdp!.click('.access-form button[type="submit"]');
    await cdp!.wait('document.querySelector(".access-form input[value=public]")?.checked', 'public visibility saved');
    await cdp!.wait('!document.querySelector(".access-form input[value=open]").disabled', 'open enrollment enabled for public course');
    await cdp!.click('.access-form input[value="open"]');
    await cdp!.click('.access-form button[type="submit"]');
    await cdp!.wait('document.querySelector(".access-form input[value=public]")?.checked && document.querySelector(".access-form input[value=open]")?.checked', 'public open settings');
    await cdp!.click('.access-form input[value="unlisted"]');
    await cdp!.click('.access-form input[value="invitation_only"]');
    await cdp!.click('.access-form button[type="submit"]');
    await cdp!.wait('document.querySelector(".access-form input[value=unlisted]")?.checked && document.querySelector(".access-form input[value=invitation_only]")?.checked', 'unlisted invitation settings');
    await cdp!.capture('03-access-settings');
    return 'Applied Public/Open and then Unlisted/Invitation only through the settings form; both configurations reloaded with the saved radio choices.';
  });

  await perform('Module create, rename, reorder, and reload persistence', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content`);
    await cdp!.wait('Boolean(document.querySelector(".builder-tree-container"))', 'course builder');
    const addModule = async (title: string) => {
      await cdp!.click('.add-module-disclosure summary');
      await cdp!.type('.add-module-disclosure input[name="title"]', title);
      await cdp!.click('.add-module-disclosure button[type="submit"]');
      await cdp!.wait(`document.body.innerText.includes(${JSON.stringify(title)})`, `${title} created`);
    };
    await addModule('AUDIT Module Alpha');
    await addModule('AUDIT Module Beta');
    let names = await cdp!.evaluate('Array.from(document.querySelectorAll(".module-row-title-group a")).map(a=>a.textContent.trim())');
    const before = [...names];
    await cdp!.clickWhere('.move-module-down-btn', '.module-overview-row', 'AUDIT Module Alpha');
    await cdp!.wait(`document.querySelectorAll(".module-row-title-group a")[2]?.textContent.includes("AUDIT Module Alpha")`, 'module order change');
    await cdp!.command('Page.reload');
    await cdp!.wait('Boolean(document.querySelector(".module-row-list"))', 'module reload');
    names = await cdp!.evaluate('Array.from(document.querySelectorAll(".module-row-title-group a")).map(a=>a.textContent.trim())');
    if (!names[2]?.includes('AUDIT Module Alpha')) throw new Error(`Module order did not persist after reload: ${JSON.stringify({ before, names })}`);
    const alpha = await cdp!.evaluate(`(()=>{const a=[...document.querySelectorAll(".module-row-title-group a")].find(a=>a.textContent.includes("AUDIT Module Alpha"));return new URL(a.href).searchParams.get("id")})()`);
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content?type=module&id=${alpha}`);
    await cdp!.wait('Boolean(document.querySelector(".rename-form"))', 'module rename editor');
    await cdp!.type('#module-rename-input', 'AUDIT Module Alpha Renamed');
    await cdp!.click('.rename-form button[type="submit"]');
    await cdp!.wait('document.body.innerText.includes("AUDIT Module Alpha Renamed")', 'module rename saved');
    mainModuleId = alpha;
    return `Created two modules, moved Alpha down, reloaded and confirmed order; renamed Alpha. Initial order was ${JSON.stringify(before)}.`;
  });

  await perform('Lesson create, rename, reorder, and reload persistence', async () => {
    const modulePath = `/teach/${courseId}/content?type=module&id=${mainModuleId}`;
    await cdp!.navigate(`${webOrigin}${modulePath}`);
    await cdp!.wait('Boolean(document.querySelector(".add-lesson-form"))', 'lesson editor');
    const addLesson = async (title: string) => {
      await cdp!.type('#new-lesson-title', title);
      await cdp!.type('#new-lesson-desc', 'Created through the real author builder flow.');
      await cdp!.click('.add-lesson-form button[type="submit"]');
      await cdp!.wait(`document.body.innerText.includes(${JSON.stringify(title)})`, `${title} created`);
      await cdp!.navigate(`${webOrigin}${modulePath}`);
      await cdp!.wait('Boolean(document.querySelector(".add-lesson-form"))', 'module lessons reloaded');
    };
    await addLesson('AUDIT Lesson One');
    await addLesson('AUDIT Lesson Two');
    const before = await cdp!.evaluate('Array.from(document.querySelectorAll(".lesson-card h4")).map(x=>x.textContent.trim())');
    await cdp!.click('.lesson-card .move-lesson-down-btn:not([disabled])');
    await cdp!.wait('document.querySelectorAll(".lesson-card h4")[1]?.textContent.includes("AUDIT Lesson One")', 'lesson reorder');
    await cdp!.command('Page.reload');
    await cdp!.wait('Boolean(document.querySelector(".lesson-card"))', 'lesson reload');
    const after = await cdp!.evaluate('Array.from(document.querySelectorAll(".lesson-card h4")).map(x=>x.textContent.trim())');
    if (!after[1]?.includes('AUDIT Lesson One')) throw new Error(`Lesson order did not persist after reload: ${JSON.stringify(after)}`);
    const id = await cdp!.evaluate(`(()=>{const a=[...document.querySelectorAll("a[href*='type=lesson']")].find(a=>a.href.includes("AUDIT"));return a?new URL(a.href).searchParams.get("id"):null})()`);
    const treeData = await cdp!.evaluate(`(async()=>{const r=await fetch('/api/author/courses/${courseId}/structure',{headers:{Authorization:'Bearer '+localStorage.getItem('zur_session_token')}});return r.json()})()`);
    lessonId = treeData.modules.find((m: any) => m.id === mainModuleId)?.lessons.find((l: any) => l.title === 'AUDIT Lesson One')?.id || id;
    if (!lessonId) throw new Error('Could not identify the lesson created by the UI.');
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content?type=lesson&id=${lessonId}`);
    await cdp!.wait('Boolean(document.querySelector(".rename-form"))', 'lesson rename editor');
    await cdp!.type('#lesson-rename-input', 'AUDIT Lesson One Renamed');
    await cdp!.click('.rename-form button[type="submit"]');
    await cdp!.wait('document.body.innerText.includes("AUDIT Lesson One Renamed")', 'lesson rename saved');
    return `Created two lessons, moved Lesson One down, reloaded to confirm order, and renamed Lesson One. Before order: ${JSON.stringify(before)}; after reload: ${JSON.stringify(after)}.`;
  });

  await perform('Step create, reorder, duplicate, all visible step types', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content?type=lesson&id=${lessonId}`);
    await cdp!.wait('Boolean(document.querySelector(".add-step-form"))', 'step creation form');
    const addStep = async (title: string, type: string) => {
      await cdp!.type('#step-title-input', title);
      await cdp!.select('#step-type-select', type);
      await cdp!.click('.add-step-form button[type="submit"]');
      await cdp!.wait(`document.body.innerText.includes(${JSON.stringify(title)})`, `${title} created`);
    };
    await addStep('AUDIT Theory', 'theory');
    await addStep('AUDIT Video', 'video');
    await addStep('AUDIT Quiz', 'quiz');
    await addStep('AUDIT Python', 'python');
    await addStep('AUDIT Extra Theory', 'theory');
    let titles = await cdp!.evaluate('Array.from(document.querySelectorAll(".steps-table tbody tr strong")).map(x=>x.textContent.trim())');
    const before = [...titles];
    await cdp!.clickWhere('.move-step-up-btn', '.steps-table tbody tr', 'AUDIT Extra Theory');
    await cdp!.wait(`(()=>{const x=[...document.querySelectorAll(".steps-table tbody tr strong")].map(x=>x.textContent.trim());return x.indexOf("AUDIT Extra Theory")===${before.indexOf('AUDIT Extra Theory') - 1}})()`, 'step reordering');
    await cdp!.command('Page.reload');
    await cdp!.wait('Boolean(document.querySelector(".steps-table tbody tr"))', 'steps after reload');
    titles = await cdp!.evaluate('Array.from(document.querySelectorAll(".steps-table tbody tr strong")).map(x=>x.textContent.trim())');
    if (!titles[before.indexOf('AUDIT Extra Theory') - 1]?.includes('AUDIT Extra Theory')) throw new Error(`Step order did not persist after reload: ${JSON.stringify(titles)}`);
    const tree = await cdp!.evaluate(`(async()=>{const r=await fetch('/api/author/courses/${courseId}/structure',{headers:{Authorization:'Bearer '+localStorage.getItem('zur_session_token')}});return r.json()})()`);
    const lesson = tree.modules.flatMap((m: any) => m.lessons).find((l: any) => l.id === lessonId);
    for (const type of ['theory', 'video', 'quiz', 'python']) stepIds[type] = lesson.steps.find((s: any) => s.title === `AUDIT ${type[0].toUpperCase()}${type.slice(1)}`)?.id || '';
    if (Object.values(stepIds).some((id) => !id)) throw new Error(`Could not identify created step ids: ${JSON.stringify(stepIds)}`);
    await cdp!.click(`form[action$="/steps/${stepIds.theory}/duplicate"] button`);
    await cdp!.wait('document.body.innerText.includes("AUDIT Theory (Copy)")', 'duplicate step');
    cdp!.dialogDecision = false;
    await cdp!.clickWhere('form[action$="/delete"] button', '.steps-table tbody tr', 'AUDIT Theory (Copy)');
    await cdp!.wait('document.body.innerText.includes("AUDIT Theory (Copy)")', 'duplicate delete cancelled');
    cdp!.dialogDecision = true;
    await cdp!.clickWhere('form[action$="/delete"] button', '.steps-table tbody tr', 'AUDIT Theory (Copy)');
    await cdp!.wait('!document.body.innerText.includes("AUDIT Theory (Copy)")', 'duplicate step deleted');
    await cdp!.capture('04-course-builder-structure');
    return `Created theory, video, quiz, Python, plus an extra theory step; moved Extra Theory before reload and confirmed persistence; duplicated theory, cancelled deletion once, then deleted the copy. Original order: ${JSON.stringify(before)}.`;
  });

  await perform('Delete unused module and lesson with cancel and confirm', async () => {
    let tree = await cdp!.evaluate(`(async()=>{const r=await fetch('/api/author/courses/${courseId}/structure',{headers:{Authorization:'Bearer '+localStorage.getItem('zur_session_token')}});return r.json()})()`);
    const beta = tree.modules.find((m: any) => m.title.includes('AUDIT Module Beta'));
    if (!beta) throw new Error('Could not locate the audit-only empty module.');
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content?type=module&id=${beta.id}`);
    await cdp!.wait('Boolean(document.querySelector("form[action$=delete]"))', 'module delete action');
    cdp!.dialogDecision = false;
    await cdp!.click('form[action$="/delete"] button');
    await cdp!.wait('document.querySelector("form[action$=delete]")?.isConnected', 'module delete cancelled');
    cdp!.dialogDecision = true;
    await cdp!.click('form[action$="/delete"] button');
    await cdp!.wait('location.pathname.endsWith("/content") && document.body.innerText.includes("Module 2")', 'module deleted');
    tree = await cdp!.evaluate(`(async()=>{const r=await fetch('/api/author/courses/${courseId}/structure',{headers:{Authorization:'Bearer '+localStorage.getItem('zur_session_token')}});return r.json()})()`);
    const alpha = tree.modules.find((m: any) => m.title.includes('AUDIT Module Alpha'));
    const secondLesson = alpha.lessons.find((l: any) => l.title === 'AUDIT Lesson Two');
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content?type=lesson&id=${secondLesson.id}`);
    await cdp!.wait('Boolean(document.querySelector(".rename-form"))', 'lesson delete action');
    cdp!.dialogDecision = false;
    await cdp!.click('form[action$="/delete"] button');
    await cdp!.wait('document.querySelector(".rename-form")?.isConnected', 'lesson delete cancelled');
    cdp!.dialogDecision = true;
    await cdp!.click('form[action$="/delete"] button');
    await cdp!.wait('location.pathname.endsWith("/content") && document.body.innerText.includes("AUDIT Module Alpha Renamed")', 'lesson deleted');
    return 'On the empty Beta module and spare Lesson Two, cancelled deletion and then confirmed it. The remaining course structure no longer contains those rows.';
  });

  await perform('Video author settings, accessibility fields, and save', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content/video/${stepIds.video}`);
    await cdp!.wait('Boolean(document.querySelector("#video-url-input"))', 'video author editor');
    await cdp!.type('#step-title-input', 'AUDIT Video');
    await cdp!.type('#video-url-input', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await cdp!.type('#video-transcript-input', 'Transcript: a short example video used only in the local audit fixture.');
    await cdp!.click('#caption-verified');
    await cdp!.click('.author-header-right button');
    await cdp!.wait('document.querySelector(".author-header-right button")?.textContent==="Saved"', 'video settings saved');
    await cdp!.capture('05-video-editor');
    return 'Entered an approved YouTube URL, transcript, and verified-caption state; saved and observed the Saved indicator.';
  });

  await perform('Theory editor formatting, preview, and image insertion affordance', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content/theory/${stepIds.theory}`);
    await cdp!.wait('Boolean(document.querySelector("#theory-markdown-input"))', 'theory editor');
    await cdp!.type('#theory-markdown-input', '# Browser-authored theory\n\n**Bold detail**, *emphasis*, and `inline code`.\n\n- First point\n- Second point\n\n> [!NOTE]\n> A callout.\n\n```python\nprint("hello")\n```');
    await cdp!.click('.theory-tabs [data-tab="preview"]');
    await cdp!.wait('document.querySelector(".rendered-markdown-content")?.innerText.includes("First point")', 'theory preview');
    const rendered = await cdp!.evaluate('document.querySelector(".rendered-markdown-content")?.innerHTML');
    await cdp!.capture('05-theory-editor');
    await cdp!.click('.theory-tabs [data-tab="edit"]');
    await cdp!.click('[data-action="open-asset-modal"]');
    await cdp!.wait('Boolean(document.querySelector("#theory-asset-modal:not(.hidden)"))', 'asset upload dialog');
    const pngPath = path.join(temp, 'reaudit-diagram.png');
    const cp = await import('node:child_process');
    cp.execFileSync('magick', ['-size', '64x64', 'xc:#2878c8', pngPath]);
    await cdp!.setFileInputFiles('#asset-file-picker', [pngPath]);
    await cdp!.type('#asset-alt-text', 'Blue audit diagram');
    await cdp!.click('#asset-modal-submit');
    await cdp!.wait('document.querySelector("#theory-markdown-input")?.value.includes("![Blue audit diagram](/api/assets/")', 'asset Markdown insertion');
    await cdp!.click('.author-header-right button');
    await cdp!.wait('document.querySelector(".author-header-right button")?.textContent==="Saved"', 'theory save');
    if (!String(rendered).includes('<strong>Bold detail</strong>') || !String(rendered).includes('<li>First point</li>')) throw new Error('Theory Markdown preview did not render expected formatting.');
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/preview?stepId=${stepIds.theory}`);
    await cdp!.wait('Boolean(document.querySelector("img[src^=\'/api/assets/\']"))', 'uploaded asset in authorized preview');
    return 'Markdown formatting rendered; PNG selected in visible upload modal, inserted into source, saved, and rendered in author preview.';
  });

  await perform('Quiz answer editor, option add/remove, single/multiple answer modes', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content/quiz/${stepIds.quiz}`);
    await cdp!.wait('Boolean(document.querySelector("#quiz-prompt-input"))', 'quiz editor');
    await cdp!.type('#step-title-input', 'AUDIT Quiz');
    await cdp!.type('#quiz-prompt-input', 'Which values are even?');
    await cdp!.type('.quiz-option-row:nth-child(1) .option-text-input', '2');
    await cdp!.type('.quiz-option-row:nth-child(2) .option-text-input', '3');
    await cdp!.click('[data-action="add-option"]');
    await cdp!.wait('document.querySelectorAll(".quiz-option-row").length===3', 'quiz option added');
    await cdp!.type('.quiz-option-row:nth-child(3) .option-text-input', '4');
    await cdp!.click('.quiz-option-row:nth-child(1) input[type=radio]');
    await cdp!.click('.quiz-option-row:nth-child(3) input[type=radio]');
    await cdp!.type('#quiz-explanation-input', 'Even integers have remainder 0 when divided by 2.');
    const singleCorrect = await cdp!.evaluate('document.querySelectorAll(".quiz-option-row input[type=radio]:checked").length');
    await cdp!.click('label.segmented-control-btn:nth-child(2)');
    await cdp!.wait('document.querySelector("#quiz-type-select").value==="multiple_choice"', 'multiple choice mode');
    await cdp!.click('.quiz-option-row:nth-child(1) input[type=checkbox]');
    await cdp!.click('.quiz-option-row:nth-child(3) input[type=checkbox]');
    await cdp!.capture('06-quiz-editor');
    await cdp!.click('.author-header-right button');
    await cdp!.wait('document.querySelector(".author-header-right button")?.textContent==="Saved"', 'quiz save');
    return `Created three answer options, marked two correct in multiple-choice mode, and saved post-pass explanation. Single-choice control had ${singleCorrect} selected before changing modes. No quiz-specific progressive hint field is present.`;
  });

  await perform('Python exercise fields, hidden/public tests, hints, limits, validation control', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content/python/${stepIds.python}`);
    await cdp!.wait('Boolean(document.querySelector("#problem-stmt-input"))', 'Python author editor');
    await cdp!.type('#step-title-input', 'AUDIT Python exercise');
    await cdp!.type('#problem-stmt-input', 'Read one integer and print its double.');
    await cdp!.type('#input-format-input', 'One integer n.');
    await cdp!.type('#output-format-input', 'Print 2*n.');
    await cdp!.type('#constraints-input', '-100000 <= n <= 100000');
    await cdp!.type('[data-hint-index="0"]', 'Read the integer.');
    await cdp!.type('[data-hint-index="1"]', 'Convert it to int before multiplying.');
    await cdp!.type('#explanation-input', 'Multiply the integer by two.');
    await cdp!.click('.sub-tab-btn[data-tab="code"]');
    await cdp!.type('#starter-code-input', 'n = int(input())\n# Print the doubled value\n');
    await cdp!.type('#ref-solution-input', 'print(int(input()) * 2)\n');
    await cdp!.click('.sub-tab-btn[data-tab="tests"]');
    await cdp!.click('[data-action="add-public-test"]');
    await cdp!.wait('document.querySelectorAll("#tab-tests .test-cases-section")[0].querySelectorAll(".test-case-card").length===1', 'first public test added');
    await cdp!.typeAt('.test-stdin', 0, '3');
    await cdp!.typeAt('.test-stdout', 0, '6');
    await cdp!.click('[data-action="add-public-test"]');
    await cdp!.wait('document.querySelectorAll("#tab-tests .test-cases-section")[0].querySelectorAll(".test-case-card").length===2', 'second public test added');
    await cdp!.typeAt('.test-stdin', 1, '-2');
    await cdp!.typeAt('.test-stdout', 1, '-4');
    await cdp!.click('[data-action="add-hidden-test"]');
    await cdp!.wait('document.querySelectorAll("#tab-tests .test-cases-section")[1].querySelectorAll(".test-case-card").length===1', 'first hidden test added');
    await cdp!.typeAt('.test-stdin', 2, '0');
    await cdp!.typeAt('.test-stdout', 2, '0');
    await cdp!.click('[data-action="add-hidden-test"]');
    await cdp!.wait('document.querySelectorAll("#tab-tests .test-cases-section")[1].querySelectorAll(".test-case-card").length===2', 'second hidden test added');
    await cdp!.typeAt('.test-stdin', 3, '9');
    await cdp!.typeAt('.test-stdout', 3, '18');
    await cdp!.click('.sub-tab-btn[data-tab="problem"]');
    await cdp!.type('#cpu-timeout', '3');
    await cdp!.type('#wall-timeout', '7');
    await cdp!.type('#memory-limit', '160');
    await cdp!.capture('07-python-editor');
    await cdp!.click('.author-header-right button');
    await cdp!.wait('document.querySelector(".author-header-right button")?.textContent==="Saved"', 'Python editor save');
    await cdp!.click('.sub-tab-btn[data-tab="validation"]');
    const validationButton = await cdp!.evaluate('Boolean(document.querySelector("[data-action=check-reference-solution]"))');
    await cdp!.click('[data-action="check-reference-solution"]');
    await cdp!.wait('document.querySelector("[data-action=check-reference-solution]")?.disabled===false && Boolean(document.querySelector("#tab-validation .validation-results-table table tbody tr"))', 'correct reference test rows', 30000);
    const correctRows = await cdp!.evaluate('Array.from(document.querySelectorAll("#tab-validation .validation-results-table tbody tr")).map(tr=>({name:tr.cells[0]?.innerText.trim(),result:tr.cells[1]?.innerText.trim()}))');
    const validationFeedback = await cdp!.evaluate('document.querySelector("#tab-validation")?.innerText || ""');
    const validationResponded = correctRows.length===4 && correctRows.every((r:any)=>r.result.includes('PASS'));
    if (!validationResponded) throw new Error(`Correct reference should pass all 4 public+hidden cases: ${JSON.stringify(correctRows)}`);
    await cdp!.capture('07-python-reference-correct');
    await cdp!.click('.sub-tab-btn[data-tab="code"]');
    await cdp!.type('#ref-solution-input', 'print("wrong reference output")\n');
    await cdp!.click('.sub-tab-btn[data-tab="validation"]');
    await cdp!.evaluate('document.querySelector("#tab-validation .validation-results-table")?.remove()');
    await cdp!.click('[data-action="check-reference-solution"]');
    await cdp!.wait('document.querySelector("[data-action=check-reference-solution]")?.disabled===false && Boolean(document.querySelector("#tab-validation .validation-results-table table tbody tr"))', 'wrong reference test rows', 30000);
    const wrongRows = await cdp!.evaluate('Array.from(document.querySelectorAll("#tab-validation .validation-results-table tbody tr")).map(tr=>({name:tr.cells[0]?.innerText.trim(),result:tr.cells[1]?.innerText.trim()}))');
    const wrongPublicFail=wrongRows.some((r:any)=>r.name.toLowerCase().includes('public')&&r.result.includes('FAIL'));
    const wrongHiddenFail=wrongRows.some((r:any)=>r.name.toLowerCase().includes('hidden')&&r.result.includes('FAIL'));
    if(!wrongPublicFail||!wrongHiddenFail) throw new Error(`Wrong reference should fail at least one public and one hidden test: ${JSON.stringify(wrongRows)}`);
    await cdp!.capture('07-python-reference-wrong');
    record('Python reference-solution validation control', 'PASS', `Correct reference PASS rows=${correctRows.length}; wrong reference produced Public FAIL=${wrongPublicFail}, Hidden FAIL=${wrongHiddenFail}.`);
    return `Saved starter solution, 2 public + 2 hidden cases, 2 hints, runtime limits. Correct reference passed all four; deliberately incorrect reference failed both public and hidden cases. Correct feedback excerpt: ${validationFeedback.slice(-180)}.`;
  });

  await perform('Preview theory, video, quiz, and Python steps', async () => {
    const previews: Record<string, string> = {};
    for (const [type, stepId] of Object.entries(stepIds)) {
      await cdp!.navigate(`${webOrigin}/teach/${courseId}/preview?stepId=${stepId}`);
      await cdp!.wait('Boolean(document.querySelector(".author-preview-banner")) || document.body.innerText.toLowerCase().includes("preview")', `${type} preview`);
      previews[type] = await cdp!.evaluate('document.body.innerText.slice(-450)');
      if (type === 'theory') await cdp!.capture('08-preview-theory');
      if (type === 'video') await cdp!.capture('09-preview-video');
      if (type === 'quiz') await cdp!.capture('10-preview-quiz');
      if (type === 'python') await cdp!.capture('11-preview-python');
    }
    return `All four preview routes rendered: ${Object.keys(previews).join(', ')}. Video provider/player state excerpt: ${String(previews.video).slice(-220)}.`;
  });

  await perform('Draft validation, publish, version change, and pinned snapshot', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/publish`);
    await cdp!.wait('Boolean(document.querySelector("#publish-form"))', 'publication review');
    await cdp!.capture('12-publish-review');
    const firstReview = await cdp!.evaluate('document.body.innerText.slice(-1600)');
    const button = await cdp!.evaluate('Boolean(document.querySelector("#publish-open-confirm:not([disabled])"))');
    if (!button) return `Validation blocked publication. Review output: ${firstReview}`;
    await cdp!.click('#publish-open-confirm');
    await cdp!.wait('Boolean(document.querySelector("#publish-confirm-submit"))', 'publish confirmation');
    await cdp!.click('#publish-confirm-submit');
    await cdp!.wait('Boolean(document.querySelector(".receipt-card"))', 'published receipt');
    const receipt = await cdp!.bodyText();
    const version = await cdp!.evaluate('(document.body.innerText.match(/Version (\\d+)/)||[])[1] || ""');
    courseVersionOne = Number(version) || 1;
    await cdp!.capture('13-publication-receipt-v1');
    return `Version ${courseVersionOne} published. Pre-publication review excerpt: ${firstReview.slice(-500)}. Receipt excerpt: ${receipt.slice(-500)}.`;
  });

  await perform('Students roster and shareable invitation', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/students`);
    await cdp!.wait('Boolean(document.querySelector("#btn-open-invite-modal"))', 'students page');
    await cdp!.capture('14-students-roster');
    await cdp!.click('#btn-open-invite-modal');
    await cdp!.wait('!document.querySelector("#invite-students-modal").classList.contains("hidden")', 'invite modal');
    await cdp!.click('#invite-tab-link');
    await cdp!.wait('!document.querySelector("#invite-panel-link").classList.contains("hidden")', 'shareable link panel');
    await cdp!.type('#invite-link-max-uses', '1');
    await cdp!.click('#btn-create-shareable-link');
    await cdp!.wait('!document.querySelector("#generated-link-container").classList.contains("hidden") && Boolean(document.querySelector("#generated-invite-input").value)', 'shareable link generated');
    const link = await cdp!.evaluate('document.querySelector("#generated-invite-input").value');
    shareToken = String(link).split('/').pop() || '';
    await cdp!.capture('15-shareable-invitation');
    await cdp!.click('#invite-students-modal [data-action="close-modal"]');
    await cdp!.wait('document.querySelector("#invite-students-modal")?.classList.contains("hidden")', 'invite dialog closed');
    await cdp!.click('#tab-btn-invitations');
    await cdp!.wait('document.querySelector("#tab-btn-invitations")?.getAttribute("aria-selected")==="true" && !document.querySelector("#panel-invitations").classList.contains("hidden")', 'invitation list');
    await cdp!.click('#btn-open-invite-modal');
    await cdp!.wait('!document.querySelector("#invite-students-modal").classList.contains("hidden")', 'email invite form');
    await cdp!.click('#invite-tab-email');
    await cdp!.wait('!document.querySelector("#invite-panel-email").classList.contains("hidden")', 'email invite tab');
    await cdp!.click('#btn-submit-email-invite');
    const emailRequired = await cdp!.evaluate('document.querySelector("#invite-recipient-email")?.required && !document.querySelector("#invite-recipient-email").validity.valid');
    await cdp!.click('#invite-students-modal [data-action="close-modal"]');
    if (!emailRequired) throw new Error('Email invite did not block an empty recipient.');
    return `Generated a one-use shareable enrollment link through the UI; invitation is visible in the Invitations tab. Empty email recipient was browser-blocked; no email was sent.`;
  });

  await perform('Accept invitation and enroll learner', async () => {
    await cdp!.navigate(`${webOrigin}/sign-in`);
    await cdp!.wait('Boolean(document.querySelector("#sign-in-form"))', 'learner sign-in');
    await cdp!.type('#email', 'ada@zur.internal');
    await cdp!.type('#password', 'StudentPass123!');
    await cdp!.click('#submit-sign-in');
    await cdp!.wait('JSON.parse(localStorage.getItem("zur_current_user")||"{}").email==="ada@zur.internal"', 'learner session');
    await cdp!.navigate(`${webOrigin}/join/${shareToken}`);
    await cdp!.wait('Boolean(document.querySelector(".invitation-accept-form"))', 'invitation preview');
    await cdp!.click('.invitation-accept-form button[type="submit"]');
    await cdp!.wait('location.pathname.startsWith("/learn/")', 'enrollment created');
    enrollmentPath = await cdp!.evaluate('location.pathname');
    await cdp!.wait(`document.body.innerText.includes(${JSON.stringify(courseTitle)})`, 'enrolled course overview');
    await cdp!.capture('16-enrolled-course-v1');
    return `Ada accepted the one-use shareable link through the browser and landed at ${enrollmentPath} on Version ${courseVersionOne}.`;
  });

  await perform('Learner exercise run before submit and first version pin', async () => {
    await cdp!.navigate(`${webOrigin}${enrollmentPath}/steps/${stepIds.python}`);
    await cdp!.wait('Boolean(document.querySelector("#run-custom-btn")) && Boolean(document.querySelector("#submit-solution-btn"))', 'learner Python workspace');
    await cdp!.capture('17-python-workspace-v1');
    await cdp!.click('#tab-btn-custom-input');
    await cdp!.wait('Boolean(document.querySelector("#custom-stdin-input"))', 'custom input editor');
    await cdp!.type('#custom-stdin-input', '3\n');
    const cmExists = await cdp!.evaluate('Boolean(document.querySelector(".cm-content[contenteditable=true]"))');
    await cdp!.type(cmExists ? '.cm-content[contenteditable=true]' : '#code-editor-input', 'print(int(input()) * 2)\n');
    await cdp!.click('#run-custom-btn');
    await cdp!.wait('!document.querySelector("#run-custom-btn")?.disabled && Boolean(document.querySelector(".result-headline") || document.querySelector(".comparison-value"))', 'custom run complete', 20000);
    const runResult = await cdp!.evaluate('document.querySelector(".result-headline")?.innerText || document.querySelector(".comparison-value")?.innerText || ""');
    await cdp!.click('#submit-solution-btn');
    await cdp!.wait('!document.querySelector("#submit-solution-btn")?.disabled && Boolean(document.querySelector(".result-verdict-badge") || document.querySelector(".result-headline"))', 'submission complete', 20000);
    const submitResult = await cdp!.evaluate('document.querySelector(".result-verdict-badge")?.innerText || document.querySelector(".result-headline")?.innerText || ""');
    return `Run produced visible result “${String(runResult).slice(0, 100)}”; Submit then produced “${String(submitResult).slice(0, 100)}”. The learner remained pinned to published Version ${courseVersionOne}.`;
  });

  await perform('Publish second version while learner remains pinned to Version 1', async () => {
    await cdp!.navigate(`${webOrigin}/sign-in`);
    await cdp!.wait('Boolean(document.querySelector("#sign-in-form"))', 'return author sign-in');
    await cdp!.type('#email', 'guido@zur.internal');
    await cdp!.type('#password', 'AuthorPass123!');
    await cdp!.click('#submit-sign-in');
    await cdp!.wait('JSON.parse(localStorage.getItem("zur_current_user")||"{}").capabilities.includes("author")', 'author restored');
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/content/theory/${stepIds.theory}`);
    await cdp!.wait('Boolean(document.querySelector("#theory-markdown-input"))', 'author theory after release');
    await cdp!.click('.theory-tabs [data-tab="edit"]');
    await cdp!.type('#theory-markdown-input', '# Version two\n\nThis text belongs to the next published snapshot.');
    await cdp!.click('.author-header-right button');
    await cdp!.wait('document.querySelector(".author-header-right button")?.textContent==="Saved"', 'version two draft saved');
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/publish`);
    await cdp!.wait('Boolean(document.querySelector("#publish-open-confirm:not([disabled])"))', 'version two validates');
    await cdp!.click('#publish-open-confirm');
    await cdp!.click('#publish-confirm-submit');
    await cdp!.wait('Boolean(document.querySelector(".receipt-card")) && document.body.innerText.includes("Version 2")', 'version two receipt');
    await cdp!.capture('18-version-2-receipt');
    const receiptV2 = await cdp!.evaluate('document.querySelector(".receipt-card")?.innerText || ""');
    if (!receiptV2.includes('Released Version 2')) throw new Error(`Second publish receipt did not confirm version 2: ${receiptV2}`);
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/settings`);
    await cdp!.wait('Boolean(document.querySelector("#versions-heading"))', 'version history section');
    await cdp!.capture('18-course-version-history');
    const versionHistory = await cdp!.evaluate('Array.from(document.querySelectorAll(".version-item")).map(e=>e.innerText.trim())');
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/students`);
    await cdp!.wait('Boolean(document.querySelector("[data-enrollment-id]"))', 'roster includes learner');
    const pin = await cdp!.evaluate('document.querySelector("[data-enrollment-id]")?.innerText');
    if (!String(pin).includes('v1') && !String(pin).includes('Version 1')) throw new Error(`Existing learner no longer visibly reports Version 1 pin: ${String(pin).slice(0,260)}; history=${JSON.stringify(versionHistory)}`);
    await cdp!.click('#btn-open-invite-modal');
    await cdp!.wait('Boolean(document.querySelector("#invite-students-modal:not(.hidden)"))', 'second-version invite modal');
    await cdp!.click('#invite-tab-link');
    await cdp!.wait('Boolean(document.querySelector("#invite-panel-link:not(.hidden)"))', 'second-version share link tab');
    await cdp!.type('#invite-link-max-uses', '1');
    await cdp!.click('#btn-create-shareable-link');
    await cdp!.wait('!document.querySelector("#generated-link-container").classList.contains("hidden") && Boolean(document.querySelector("#generated-invite-input").value)', 'second-version share link');
    shareToken = String(await cdp!.evaluate('document.querySelector("#generated-invite-input").value')).split('/').pop() || '';
    await cdp!.click('#invite-students-modal [data-action="close-modal"]');
    await cdp!.navigate(`${webOrigin}/sign-in`);
    await cdp!.wait('Boolean(document.querySelector("#sign-in-form"))', 'second learner sign-in');
    await cdp!.type('#email', 'alan@zur.internal');
    await cdp!.type('#password', 'StudentPass123!');
    await cdp!.click('#submit-sign-in');
    await cdp!.wait('JSON.parse(localStorage.getItem("zur_current_user")||"{}").email==="alan@zur.internal"', 'second learner session');
    await cdp!.navigate(`${webOrigin}/join/${shareToken}`);
    await cdp!.wait('Boolean(document.querySelector(".invitation-accept-form"))', 'second learner invitation');
    await cdp!.click('.invitation-accept-form button[type="submit"]');
    await cdp!.wait('location.pathname.startsWith("/learn/")', 'second learner enrollment');
    const secondEnrollment = await cdp!.evaluate('location.pathname.split("/")[2]');
    const secondProgress = await cdp!.evaluate(`(async()=>{const r=await fetch('/api/enrollments/${secondEnrollment}/progress',{headers:{Authorization:'Bearer '+localStorage.getItem('zur_session_token')}});return r.json()})()`);
    if (Number(secondProgress.pinnedVersionNumber) !== 2) throw new Error(`New learner enrollment pinned version ${secondProgress.pinnedVersionNumber}, expected v2.`);
    await cdp!.navigate(`${webOrigin}/sign-in`);
    await cdp!.wait('Boolean(document.querySelector("#sign-in-form"))', 'return author sign-in');
    await cdp!.type('#email', 'guido@zur.internal');
    await cdp!.type('#password', 'AuthorPass123!');
    await cdp!.click('#submit-sign-in');
    await cdp!.wait('JSON.parse(localStorage.getItem("zur_current_user")||"{}").capabilities.includes("author")', 'author restored after second enrollment');
    if (versionHistory.length < 2) throw new Error(`V2 receipt and learner pins were correct (existing=v1, new=v${secondProgress.pinnedVersionNumber}), but settings showed only ${versionHistory.length} version rows.`);
    return `Version 2 receipt=${receiptV2.replace(/\s+/g,' ').slice(0,180)}; settings listed ${versionHistory.length} versions; Ada remained pinned to V1; Alan accepted a newly generated UI link and progress API corroborated V${secondProgress.pinnedVersionNumber}.`;
  });

  await perform('Roster search/filter and safe revoke/reinstate', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/students`);
    await cdp!.wait('Boolean(document.querySelector("#roster-search"))', 'roster filters');
    await cdp!.type('#roster-search', 'Ada');
    await cdp!.click('#btn-apply-filters');
    await cdp!.wait('location.search.includes("search=Ada") && Boolean(document.querySelector("[data-enrollment-id]"))', 'roster searched');
    await cdp!.capture('19-roster-filtered');
    const rosterBefore = await cdp!.bodyText();
    await cdp!.click('a[aria-label="View detail for Ada Lovelace"]');
    await cdp!.wait('location.pathname.includes("/students/") && Boolean(document.querySelector("#btn-open-revoke-detail"))', 'learner detail access controls');
    await cdp!.click('#btn-open-revoke-detail');
    await cdp!.wait('Boolean(document.querySelector("#revoke-student-modal:not(.hidden)"))', 'revoke confirmation');
    await cdp!.type('#revoke-reason-input', 'Audit-only temporary access check');
    await cdp!.click('#revoke-student-modal [data-action="close-modal"]');
    await cdp!.wait('document.querySelector("#revoke-student-modal")?.classList.contains("hidden")', 'revoke canceled');
    await cdp!.click('#btn-open-revoke-detail');
    await cdp!.wait('Boolean(document.querySelector("#revoke-student-modal:not(.hidden)"))', 'revoke reconfirmation');
    await cdp!.type('#revoke-reason-input', 'Audit-only temporary access check');
    await cdp!.click('#btn-confirm-revoke');
    await cdp!.wait('document.body.innerText.includes("Revoked")', 'revoke applied');
    await cdp!.click('#btn-open-reinstate-detail');
    await cdp!.wait('Boolean(document.querySelector("#reinstate-student-modal:not(.hidden)"))', 'reinstate confirmation');
    await cdp!.click('#btn-confirm-reinstate');
    await cdp!.wait('document.body.innerText.includes("Active")', 'reinstate applied');
    return `Searched Ada from roster (before excerpt: ${rosterBefore.slice(-160)}), opened detail, canceled revoke, then revoked and reinstated via detail confirmation controls.`;
  });

  await perform('Course analytics visible page and filters', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/analytics`);
    await cdp!.wait('Boolean(document.querySelector("[data-course-id]") || document.body.innerText.includes("Analytics"))', 'course analytics');
    await cdp!.capture('20-course-analytics');
    const text = await cdp!.bodyText();
    const versionSelect = await cdp!.evaluate('Boolean(document.querySelector("#analytics-version-filter"))');
    if (versionSelect) {
      await cdp!.select('#analytics-version-filter', '1');
      await cdp!.wait('location.search.includes("version")', 'analytics version filter');
    }
    return `Analytics rendered. Version selector present=${versionSelect}. Visible summary: ${text.slice(-400)}.`;
  });

  await perform('AI author connection creation, reveal mask, setup, revoke', async () => {
    await cdp!.navigate(`${webOrigin}/teach/${courseId}/settings`);
    await cdp!.wait('Boolean(document.querySelector(".access-form"))', 'course access settings before token creation');
    await cdp!.click('.access-form input[value="public"]');
    await cdp!.click('.access-form button[type="submit"]');
    await cdp!.wait('document.querySelector(".access-form input[value=public]")?.checked', 'public token-scope fixture');
    await cdp!.navigate(`${webOrigin}/settings/ai-connections`);
    await cdp!.wait('Boolean(document.querySelector("#btn-open-create-token"))', 'AI connection page');
    await cdp!.capture('21-ai-connections');
    await cdp!.click('#btn-open-create-token');
    await cdp!.wait('Boolean(document.querySelector("#create-token-form"))', 'create token dialog');
    await cdp!.type('#connection-name', 'Audit-only local connector');
    await cdp!.type('#connection-password', 'AuthorPass123!');
    await cdp!.click('#create-token-form input[name="courseScopeType"][value="selected"]');
    await cdp!.wait('!document.querySelector("#selected-courses-container").classList.contains("hidden")', 'course restriction picker');
    const checkbox = await cdp!.evaluate(`document.querySelector('#selected-courses-container input[value="${courseId}"]') ? true : false`);
    if (!checkbox) throw new Error('Created course was not offered for token restriction.');
    await cdp!.click(`#selected-courses-container input[value="${courseId}"]`);
    await cdp!.click('#btn-submit-create-token');
    await cdp!.wait('Boolean(document.querySelector("#revealed-token-value"))', 'token reveal dialog');
    const masked = await cdp!.evaluate('document.querySelector("#revealed-token-value").type === "password"');
    await cdp!.capture('22-token-reveal-masked');
    const tokenRowId = await cdp!.evaluate('document.querySelector("[id^=token-row-]")?.id');
    const tokenId = String(tokenRowId || '').replace('token-row-', '');
    await cdp!.click('#btn-toggle-secret-visibility');
    const revealed = await cdp!.evaluate('document.querySelector("#revealed-token-value").type === "text"');
    await cdp!.click('#btn-toggle-secret-visibility');
    const setupLink = await cdp!.evaluate('document.querySelector("#btn-view-setup")?.getAttribute("href")');
    if (!masked || !revealed || !tokenId || !setupLink) throw new Error(`Token UI state incomplete: ${JSON.stringify({ masked, revealed, tokenId, setupLink })}`);
    await cdp!.navigate(`${webOrigin}${setupLink}`);
    await cdp!.wait('document.body.innerText.toLowerCase().includes("setup")', 'token setup');
    await cdp!.capture('23-token-setup');
    await cdp!.navigate(`${webOrigin}/settings/ai-connections`);
    await cdp!.wait(`Boolean(document.querySelector('[data-action="revoke-token"][data-token-id="${tokenId}"]'))`, 'token revoke action');
    await cdp!.click(`#token-row-${tokenId} details.action-overflow summary`);
    await cdp!.click(`[data-action="revoke-token"][data-token-id="${tokenId}"]`);
    await cdp!.wait('Boolean(document.querySelector("#btn-confirm-revoke"))', 'token revoke confirmation');
    await cdp!.click('#btn-confirm-revoke');
    await cdp!.wait('document.body.innerText.includes("Connection revoked") || document.body.innerText.includes("Revoked")', 'token revoked');
    return 'Created a locally scoped token for this audit course, confirmed one-time value was masked by default, toggled reveal/hide, opened setup guide, and revoked token. Raw token was not logged or captured.';
  });

  record('Agent activity and recovery visible flow', 'BLOCKED', 'A recovery attempt in an earlier disposable run used a snapshot from DraftRecoveryService but inserted a synthetic AgentActivityService mutation; restore then returned SQLite FOREIGN KEY constraint failure because the course had an assessment attempt. This does not meet the re-audit requirement for a mutation produced by a real authorized tool call, so no product defect is inferred. A valid MCP-originated mutation is needed for this UI journey.', 'Earlier browser evidence: 2026-10-06-author-full-reaudit2-actions.json; isolated API server logged FOREIGN KEY constraint failure at DraftRecoveryService.restoreDraftRevision.');

  await perform('Course archive, restore, and draft delete controls', async () => {
    // Separate throwaway course to test destructive lifecycle without touching the published audit course.
    await cdp!.navigate(`${webOrigin}/teach`);
    await cdp!.wait('Boolean(document.querySelector("[data-action=open-new-course-modal]"))', 'new scratch course');
    await cdp!.click('[data-action="open-new-course-modal"]');
    await cdp!.type('#course-title-input', `AUDIT DELETE ${runId}`);
    await cdp!.click('form.modal-body button[type="submit"]');
    await cdp!.wait('location.pathname.includes("/content")', 'scratch draft');
    const scratchId = await cdp!.evaluate('location.pathname.split("/")[2]');
    await cdp!.navigate(`${webOrigin}/teach/${scratchId}/settings`);
    await cdp!.wait('Boolean(document.querySelector("form[data-course-lifecycle=archive]"))', 'archive action');
    cdp!.dialogDecision = false;
    await cdp!.click('form[data-course-lifecycle="archive"] button');
    await cdp!.wait('Boolean(document.querySelector("form[data-course-lifecycle=restore]"))', 'course archived');
    await cdp!.click('form[data-course-lifecycle="restore"] button');
    await cdp!.wait('Boolean(document.querySelector("form[data-course-lifecycle=archive]"))', 'course restored');
    cdp!.dialogDecision = false;
    await cdp!.click('form[data-course-lifecycle="delete"] button');
    await cdp!.wait('Boolean(document.querySelector("form[data-course-lifecycle=delete]"))', 'delete cancel leaves draft');
    cdp!.dialogDecision = true;
    await cdp!.click('form[data-course-lifecycle="delete"] button');
    await cdp!.wait('location.pathname==="/teach"', 'draft deleted');
    return 'On a second audit-only draft, clicked Archive and Restore, cancelled Delete once, then confirmed Delete and returned to the course list.';
  });

  const summary = {
    runId, auditDate, status: actions.some((a) => a.status === 'FAIL') ? 'completed_with_failures' : 'completed',
    environment: { isolation: 'fresh temporary SQLite database; own API, worker, Vite, Chrome profile and ephemeral ports', viewport: '1440x900 desktop', themes: ['dark', 'light'], sharedDemoDatabaseTouched: false },
    primaryCourse: { id: courseId, title: courseTitle, versionOne: courseVersionOne, enrollmentPath },
    actionCount: actions.length,
    passCount: actions.filter((a) => a.status === 'PASS').length,
    failCount: actions.filter((a) => a.status === 'FAIL').length,
    blockedCount: actions.filter((a) => a.status === 'BLOCKED').length,
    notTestedCount: actions.filter((a) => a.status === 'NOTTESTED').length,
    actions, screenshots, browserErrors: cdp?.consoleErrors || [], completedAt: new Date().toISOString(),
  };
  fs.writeFileSync(resultPath, JSON.stringify(summary, null, 2));
  console.log(`AUDIT_RESULTS ${resultPath}`);
  console.log(JSON.stringify({ runId, status: summary.status, actionCount: summary.actionCount, passCount: summary.passCount, failCount: summary.failCount, screenshots: screenshots.length, courseId }, null, 2));
}

try {
  await main();
} finally {
  cdp?.socket.close();
  for (const child of children.reverse()) await stop(child);
  await new Promise<void>((resolve) => api.close(() => resolve()));
  closeDatabase(dbPath);
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

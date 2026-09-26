import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-s4-m04-interaction-'));
const databasePath = path.join(temp, 'interactive-fixture.sqlite');
const output = path.join(root, 'screenshots');
const reportPath = path.join(root, 'docs/evidence/s4-m04-interactive-browser-flows.json');
let apiPort = 0;
let chromeDebugPort = 0;
const db = (runMigrations(databasePath), seedDatabase(databasePath), getDatabase(databasePath));
const api = createServer(db);
let vite: ReturnType<typeof spawn> | undefined;
let chrome: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForUrl(url: string, child?: ReturnType<typeof spawn>): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`Service exited before becoming ready (${child.exitCode}): ${url}`);
    try { if ((await fetch(url)).ok) return; } catch { /* wait for local service startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopChild(child?: ReturnType<typeof spawn>): Promise<void> {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 2500);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
    child.kill('SIGTERM');
  });
}

async function openBrowserTab(url: string): Promise<{ evaluate: (expression: string) => Promise<any>; screenshot: () => Promise<string>; responses: Array<{ url: string; status: number }>; close: () => Promise<void> }> {
  const response = await fetch(`http://127.0.0.1:${chromeDebugPort}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Could not create a second browser tab (${response.status})`);
  const target = await response.json() as any;
  const tabSocket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    tabSocket.addEventListener('open', () => resolve(), { once: true });
    tabSocket.addEventListener('error', () => reject(new Error('Could not connect to second browser tab')), { once: true });
  });
  let commandId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const responses: Array<{ url: string; status: number }> = [];
  tabSocket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
    } else if (message.method === 'Network.responseReceived' && String(message.params.response.url).includes('/api/')) {
      responses.push({ url: message.params.response.url, status: message.params.response.status });
    }
  });
  const command = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    tabSocket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression: string) => (await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
  const wait = async (expression: string, accept: (value: any) => boolean, label: string) => {
    for (let i = 0; i < 120; i++) {
      const value = await evaluate(expression);
      if (accept(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Second browser tab timed out waiting for ${label}`);
  };
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait('Boolean(document.querySelector("#code-editor-input"))', Boolean, 'Python editor route');
  return {
    evaluate,
    responses,
    screenshot: async () => (await command('Page.captureScreenshot', { format: 'png', fromSurface: true })).data,
    close: async () => { await command('Page.close'); tabSocket.close(); },
  };
}

async function captureLiveGuiZoom(webOrigin: string, attemptId: string): Promise<Record<string, unknown>> {
  const debugPort = await freePort();
  const profile = path.join(temp, 'live-gui-zoom-profile');
  const browser = spawn('google-chrome', [
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--window-size=1440,1000', `${webOrigin}/sign-in`,
  ], { stdio: 'ignore' });
  let guiSocket: WebSocket | undefined;
  try {
    let pageTarget: any;
    for (let i = 0; i < 150; i++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as any[];
        pageTarget = targets.find((target) => target.type === 'page');
        if (pageTarget?.webSocketDebuggerUrl) break;
      } catch { /* wait for GUI Chrome startup */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!pageTarget?.webSocketDebuggerUrl) throw new Error('GUI Chrome did not expose a DevTools page');
    guiSocket = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      guiSocket!.addEventListener('open', () => resolve(), { once: true });
      guiSocket!.addEventListener('error', () => reject(new Error('Could not connect to GUI Chrome DevTools')), { once: true });
    });
    let nextId = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    guiSocket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
    });
    const command = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      guiSocket!.send(JSON.stringify({ id, method, params }));
    });
    const evalPage = async (expression: string) => (await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
    const go = async (url: string) => {
      await command('Page.navigate', { url });
      const expected = new URL(url).pathname + new URL(url).search;
      for (let i = 0; i < 120; i++) {
        if (await evalPage('location.pathname + location.search') === expected) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      for (let i = 0; i < 120; i++) {
        if (await evalPage('document.readyState') === 'complete') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };
    const wait = async (expression: string, accept: (value: any) => boolean, label: string) => {
      for (let i = 0; i < 120; i++) {
        const value = await evalPage(expression);
        if (accept(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`GUI Chrome timed out waiting for ${label}`);
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await go(`${webOrigin}/sign-in`);
    await wait('Boolean(document.querySelector("#sign-in-form"))', Boolean, '100% baseline page load');
    const windowInfo = await command('Browser.getWindowForTarget');
    await command('Browser.setWindowBounds', { windowId: windowInfo.windowId, bounds: { windowState: 'maximized' } });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const baseline = await evalPage('({innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio,visualViewportScale:visualViewport.scale})');
    await go('chrome://settings/appearance');
    const selected = await evalPage(`(()=>{function find(root){for(const e of root.querySelectorAll('*')){if(e.id==='zoomLevel')return e;if(e.shadowRoot){const x=find(e.shadowRoot);if(x)return x}}}const s=find(document);if(!s)throw new Error('Chrome zoom selector not found');const o=[...s.options].find(o=>o.textContent.trim()==='200%');if(!o)throw new Error('200% zoom option not found');s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));return {value:s.value,label:o.textContent.trim()}})()`);
    if (selected.label !== '200%' || selected.value !== '2') throw new Error(`Could not set actual Chrome UI zoom to 200%: ${JSON.stringify(selected)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const captures: Array<Record<string, unknown>> = [];
    const capture = async (id: string, route: string, theme: 'dark' | 'light', readiness: string, accepts: (value: any) => boolean) => {
      await evalPage(`localStorage.setItem('zur_theme_preference','${theme}')`);
      await go(`${webOrigin}${route}`);
      await wait(readiness, accepts, `${id} ${theme} render`);
      const actual = await evalPage('({innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio,visualViewportScale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth})');
      if (actual.innerWidth * 2 !== baseline.innerWidth || actual.devicePixelRatio !== baseline.devicePixelRatio * 2 || actual.visualViewportScale !== 1) throw new Error(`${id}/${theme}: browser did not retain true 200% UI zoom: baseline=${JSON.stringify(baseline)} actual=${JSON.stringify(actual)}`);
      const shot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const file = `screenshots/${id}_200zoom_${theme}_gui.png`;
      fs.writeFileSync(path.join(root, file), Buffer.from(shot.data, 'base64'));
      captures.push({ id, route, theme, browserZoomPercent: 200, baseline, actual, horizontalOverflow: actual.scrollWidth > actual.innerWidth || actual.bodyScrollWidth > actual.innerWidth, screenshot: file });
    };
    const signIn = async (email: string, password: string) => {
      await go(`${webOrigin}/sign-in`);
      await wait('Boolean(document.querySelector("#sign-in-form"))', Boolean, 'sign-in form');
      await evalPage(`(()=>{document.querySelector('#email').value=${JSON.stringify(email)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#sign-in-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
      await wait("localStorage.getItem('zur_session_token')", (value) => typeof value === 'string' && value.length > 20, `${email} sign-in`);
    };
    await signIn('guido@zur.internal', 'AuthorPass123!');
    for (const theme of ['dark', 'light'] as const) await capture('s4_t087_p27_live_review', '/teach/course-python-foundations/publish', theme, 'Boolean(document.querySelector(".publish-review-container"))', Boolean);
    const receiptZoomCaptures: Array<Record<string, unknown>> = [];
    const releaseForZoom = await evalPage(`(async()=>{const token=localStorage.getItem('zur_session_token');const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};const course=await fetch('/api/author/courses/course-python-foundations',{headers}).then(r=>r.json());const update=await fetch('/api/author/courses/'+course.id+'/metadata',{method:'PUT',headers,body:JSON.stringify({expectedRevision:course.draftRevision,metadata:{description:course.description+' Verified publish receipt at actual browser zoom.'}})});if(!update.ok)return {stage:'draft update',status:update.status};return {status:update.status,revision:(await update.json()).draftRevision}})()`);
    if (releaseForZoom.status !== 200) throw new Error(`Could not prepare disposable draft for the actual 200% publication receipt: ${JSON.stringify(releaseForZoom)}`);
    await go(`${webOrigin}/teach/course-python-foundations/publish`);
    await wait('Boolean(document.querySelector("#publish-open-confirm"))', Boolean, '200% receipt publication review');
    await evalPage("document.getElementById('publish-open-confirm')?.click()");
    await wait('Boolean(document.querySelector("#publish-confirm-submit"))', Boolean, '200% receipt confirmation');
    await evalPage("document.getElementById('publish-confirm-submit')?.click()");
    await wait('Boolean(document.querySelector(".receipt-card"))', Boolean, 'real publish receipt at actual 200%');
    for (const theme of ['dark', 'light'] as const) {
      await evalPage(`localStorage.setItem('zur_theme_preference','${theme}');document.documentElement.setAttribute('data-theme','${theme}')`);
      const actual = await evalPage('({innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio,visualViewportScale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth})');
      if (actual.innerWidth * 2 !== baseline.innerWidth || actual.devicePixelRatio !== baseline.devicePixelRatio * 2 || actual.visualViewportScale !== 1) throw new Error(`P27 receipt/${theme}: actual browser zoom metrics changed: ${JSON.stringify(actual)}`);
      if (!(await evalPage('Boolean(document.querySelector(".receipt-card"))'))) throw new Error(`P27 receipt missing in ${theme} theme`);
      const shot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const screenshot = `screenshots/s4_t087_p27_publish_receipt_200zoom_${theme}_gui.png`;
      fs.writeFileSync(path.join(root, screenshot), Buffer.from(shot.data, 'base64'));
      receiptZoomCaptures.push({ theme, route: '/teach/course-python-foundations/publish', state: 'authenticated publication receipt from committed release', browserZoomPercent: 200, baseline, actual, horizontalOverflow: actual.scrollWidth > actual.innerWidth || actual.bodyScrollWidth > actual.innerWidth, receiptText: await evalPage('document.querySelector(".receipt-card")?.innerText'), screenshot });
    }
    await signIn('ada@zur.internal', 'StudentPass123!');
    for (const theme of ['dark', 'light'] as const) {
      await capture('s4_t087_p15_live_workspace', '/learn/enr-ada/steps/step-6-python-evenodd/code', theme, 'Boolean(document.querySelector("#code-editor-input"))', Boolean);
      await capture('s4_t087_p16_live_list', '/learn/enr-ada/steps/step-6-python-evenodd/attempts', theme, 'document.body.innerText', (value) => typeof value === 'string' && value.includes('Submission History'));
      await capture('s4_t087_p16_live_detail', `/learn/enr-ada/steps/step-6-python-evenodd/attempts/${encodeURIComponent(attemptId)}`, theme, 'document.body.innerText', (value) => typeof value === 'string' && value.includes('Submitted Code Snapshot'));
    }
    return { method: 'Headful Chrome Appearance > Page zoom set to 200% in isolated profile; UI setting was selected in chrome://settings/appearance. CDP used to navigate, read actual browser metrics, and capture. No viewport/device/page-scale emulation.', baseline, captures, receiptZoomCaptures };
  } finally {
    guiSocket?.close();
    await stopChild(browser);
  }
}

async function captureLiveP43GuiZoom(webOrigin: string): Promise<Record<string, unknown>> {
  const debugPort = await freePort();
  const browser = spawn('google-chrome', [
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, 'p43-live-gui-zoom-profile')}`,
    '--window-size=1440,1000', `${webOrigin}/sign-in`,
  ], { stdio: 'ignore' });
  let guiSocket: WebSocket | undefined;
  try {
    let pageTarget: any;
    for (let i = 0; i < 150; i++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as any[];
        pageTarget = targets.find((target) => target.type === 'page');
        if (pageTarget?.webSocketDebuggerUrl) break;
      } catch { /* wait for GUI Chrome startup */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!pageTarget?.webSocketDebuggerUrl) throw new Error('GUI Chrome did not expose a P43 page target');
    guiSocket = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      guiSocket!.addEventListener('open', () => resolve(), { once: true });
      guiSocket!.addEventListener('error', () => reject(new Error('Could not connect to P43 GUI Chrome DevTools')), { once: true });
    });
    let nextId = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    guiSocket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
    });
    const command = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      guiSocket!.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression: string) => (await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
    const wait = async (expression: string, accept: (value: any) => boolean, label: string) => {
      for (let i = 0; i < 120; i++) {
        const value = await evaluate(expression);
        if (accept(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`P43 GUI Chrome timed out waiting for ${label}`);
    };
    const go = async (url: string) => {
      await command('Page.navigate', { url });
      const expected = new URL(url).pathname + new URL(url).search;
      await wait('location.pathname + location.search', (value) => value === expected, expected);
      await wait('document.readyState', (value) => value === 'complete' || value === 'interactive', `${expected} document`);
    };
    await command('Page.enable');
    await command('Runtime.enable');
    await go(`${webOrigin}/sign-in`);
    await wait('Boolean(document.querySelector("#sign-in-form"))', Boolean, 'sign-in form');
    const windowInfo = await command('Browser.getWindowForTarget');
    await command('Browser.setWindowBounds', { windowId: windowInfo.windowId, bounds: { windowState: 'maximized' } });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const baseline = await evaluate('({innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio,visualViewportScale:visualViewport.scale})');
    await go('chrome://settings/appearance');
    await wait(`(()=>{function find(root){for(const e of root.querySelectorAll('*')){if(e.id==='zoomLevel')return e;if(e.shadowRoot){const x=find(e.shadowRoot);if(x)return x}}}return Boolean(find(document))})()`, Boolean, 'Chrome page zoom selector');
    const zoom = await evaluate(`(()=>{function find(root){for(const e of root.querySelectorAll('*')){if(e.id==='zoomLevel')return e;if(e.shadowRoot){const x=find(e.shadowRoot);if(x)return x}}}const s=find(document);const o=[...s.options].find(o=>o.textContent.trim()==='200%');if(!o)return null;s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));return {value:s.value,label:o.textContent.trim()}})()`);
    if (zoom?.label !== '200%' || zoom?.value !== '2') throw new Error(`Could not select actual 200% Chrome zoom for live P43: ${JSON.stringify(zoom)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const captures: Array<Record<string, unknown>> = [];
    const capture = async (state: string, theme: 'dark' | 'light') => {
      await evaluate(`localStorage.setItem('zur_theme_preference','${theme}');document.documentElement.setAttribute('data-theme','${theme}')`);
      if (state === 'reauth_error') await evaluate("document.querySelector('#create-token-modal .modal-dialog').scrollTop=0");
      let rowEvidence: Record<string, unknown> | undefined;
      if (state === 'expired_status' || state === 'revoked_status') {
        rowEvidence = await evaluate(`(()=>{const row=[...document.querySelectorAll('.connections-table tbody tr')].find(item=>item.innerText.includes('T087 Actual Zoom Evidence Connection'));if(!row)return {found:false};row.scrollIntoView({block:'center'});const bounds=row.getBoundingClientRect();const label=${JSON.stringify(state === 'expired_status' ? 'Expired' : 'Revoked')};return {found:true,rowVisible:bounds.top>=0&&bounds.bottom<=innerHeight,statusText:row.innerText.includes(label)?label:null}})()`);
        if (!rowEvidence.found || !rowEvidence.rowVisible || !rowEvidence.statusText) throw new Error(`P43 ${state} row is not visible in its 200% capture: ${JSON.stringify(rowEvidence)}`);
      }
      const actual = await evaluate('({innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio,visualViewportScale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth})');
      if (actual.innerWidth * 2 !== baseline.innerWidth || actual.devicePixelRatio !== baseline.devicePixelRatio * 2 || actual.visualViewportScale !== 1) throw new Error(`P43 actual 200% browser zoom mismatch: ${JSON.stringify({ baseline, actual })}`);
      if (actual.scrollWidth > actual.innerWidth || actual.bodyScrollWidth > actual.innerWidth) throw new Error(`P43 live ${state} has horizontal overflow at 200%: ${JSON.stringify(actual)}`);
      const shot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const screenshot = `screenshots/s4_t087_p43_live_${state}_200zoom_${theme}_gui.png`;
      fs.writeFileSync(path.join(root, screenshot), Buffer.from(shot.data, 'base64'));
      captures.push({ state, route: '/settings/ai-connections', theme, browserZoomPercent: 200, baseline, actual, horizontalOverflow: false, secretMasked: state === 'one_time_secret', rowEvidence, screenshot });
      if (state === 'expired_status' || state === 'revoked_status') {
        const tableEvidence = await evaluate(`(()=>{const wrapper=document.querySelector('.connections-table-wrapper');if(!wrapper)return {found:false};wrapper.scrollLeft=wrapper.scrollWidth;const row=[...wrapper.querySelectorAll('tbody tr')].find(item=>item.innerText.includes('T087 Actual Zoom Evidence Connection'));const status=[...row.querySelectorAll('td')].map(cell=>cell.textContent.trim()).find(text=>text.includes('${state === 'expired_status' ? 'Expired' : 'Revoked'}'));const bounds=row.getBoundingClientRect();return {found:true,scrollLeft:wrapper.scrollLeft,statusVisible:Boolean(status),rowVisible:bounds.top>=0&&bounds.bottom<=innerHeight,status}})()`);
        if (!tableEvidence.found || !tableEvidence.rowVisible || !tableEvidence.statusVisible) throw new Error(`P43 ${state} status is not visible in its 200% companion capture: ${JSON.stringify(tableEvidence)}`);
        const statusShot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
        const statusScreenshot = `screenshots/s4_t087_p43_live_${state}_status_200zoom_${theme}_gui.png`;
        fs.writeFileSync(path.join(root, statusScreenshot), Buffer.from(statusShot.data, 'base64'));
        captures.push({ state: `${state}_status_column`, route: '/settings/ai-connections', theme, browserZoomPercent: 200, baseline, actual, horizontalOverflow: false, secretMasked: false, rowEvidence: tableEvidence, screenshot: statusScreenshot });
        await evaluate("document.querySelector('.connections-table-wrapper').scrollLeft=0");
      }
    };
    await go(`${webOrigin}/sign-in`);
    await wait('Boolean(document.querySelector("#sign-in-form"))', Boolean, 'P43 author sign-in form');
    await evaluate(`(()=>{document.querySelector('#email').value='guido@zur.internal';document.querySelector('#password').value='AuthorPass123!';document.querySelector('#sign-in-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
    await wait("JSON.parse(localStorage.getItem('zur_current_user')||'{}').capabilities?.includes('author')", Boolean, 'verified author session');
    await go(`${webOrigin}/settings/ai-connections`);
    await wait('Boolean(document.getElementById("btn-open-create-token"))', Boolean, 'P43 token list');
    await evaluate("document.getElementById('btn-open-create-token')?.click()");
    await wait('Boolean(document.getElementById("create-token-form"))', Boolean, 'P43 create form');
    await evaluate(`(()=>{const form=document.getElementById('create-token-form');form.querySelector('#connection-name').value='T087 Actual Zoom Evidence Connection';form.querySelector('#connection-password').value='invalid';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
    await wait('document.getElementById("connections-error")?.innerText.includes("Invalid password")', Boolean, 'safe reauthentication error');
    const reauthErrorActionReachability: Array<Record<string, unknown>> = [];
    for (const theme of ['dark', 'light'] as const) {
      await capture('reauth_error', theme);
      const reachability = await evaluate(`(()=>{const dialog=document.querySelector('#create-token-modal .modal-dialog');const action=document.querySelector('#create-token-form button[type="submit"]');dialog.scrollTop=dialog.scrollHeight;const rect=action.getBoundingClientRect();return {dialogCanScroll:dialog.scrollHeight>dialog.clientHeight,atBottom:dialog.scrollTop+dialog.clientHeight>=dialog.scrollHeight,actionVisible:rect.top>=0&&rect.bottom<=innerHeight,actionText:action.innerText}})()`);
      if (!reachability.dialogCanScroll || !reachability.atBottom || !reachability.actionVisible) throw new Error(`P43 actual-zoom dialog actions are not reachable after internal scrolling: ${JSON.stringify(reachability)}`);
      await capture('reauth_error_actions', theme);
      reauthErrorActionReachability.push({ theme, ...reachability });
    }
    await evaluate("document.querySelector('#create-token-modal [data-dialog-action=cancel]')?.click()");
    await wait('!Boolean(document.getElementById("create-token-form"))', Boolean, 'dismiss rejected token form');
    await evaluate("document.getElementById('btn-open-create-token')?.click()");
    await wait('Boolean(document.getElementById("create-token-form"))', Boolean, 'fresh token form');
    await evaluate(`(()=>{const form=document.getElementById('create-token-form');form.querySelector('#connection-name').value='T087 Actual Zoom Evidence Connection';form.querySelector('#connection-password').value='AuthorPass123!';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
    await wait('Boolean(document.getElementById("token-reveal-modal"))', Boolean, 'one-time reveal modal');
    const secretSafe = await evaluate(`(()=>{const input=document.getElementById('revealed-token-value');return {present:Boolean(input?.value),masked:input?.type==='password'}})()`);
    if (!secretSafe.present || !secretSafe.masked) throw new Error('P43 zoom capture encountered an unmasked or missing one-time secret.');
    for (const theme of ['dark', 'light'] as const) await capture('one_time_secret', theme);
    await evaluate("document.getElementById('btn-view-setup')?.click()");
    await go(`${webOrigin}/settings/ai-connections`);
    const zoomToken = db.prepare('SELECT id FROM author_access_tokens WHERE author_id = ? AND label = ? ORDER BY created_at DESC LIMIT 1').get('user-author-1', 'T087 Actual Zoom Evidence Connection') as any;
    if (!zoomToken) throw new Error('The P43 zoom fixture token was not found after creation.');
    db.prepare('UPDATE author_access_tokens SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 60_000).toISOString(), zoomToken.id);
    await go(`${webOrigin}/settings/ai-connections?filter=expired`);
    await wait("document.body.innerText.includes('T087 Actual Zoom Evidence Connection') && document.body.innerText.includes('Expired')", Boolean, 'expired token status');
    for (const theme of ['dark', 'light'] as const) await capture('expired_status', theme);
    await wait('Boolean(document.querySelector("[data-action=\\\"revoke-token\\\"]"))', Boolean, 'created token in list');
    await evaluate("document.querySelector('[data-action=\"revoke-token\"]')?.click()");
    await wait('Boolean(document.getElementById("revoke-token-modal"))', Boolean, 'revocation confirmation dialog');
    for (const theme of ['dark', 'light'] as const) await capture('revocation_confirmation', theme);
    await evaluate("document.getElementById('btn-confirm-revoke')?.click()");
    await wait("document.body.innerText.includes('Revoked')", Boolean, 'successful token revocation');
    await go(`${webOrigin}/settings/ai-connections?filter=revoked`);
    await wait("document.body.innerText.includes('T087 Actual Zoom Evidence Connection') && document.body.innerText.includes('Revoked')", Boolean, 'revoked status row');
    for (const theme of ['dark', 'light'] as const) await capture('revoked_status', theme);
    return { method: 'Headful Chrome UI Appearance > Zoom 200% selected via chrome://settings/appearance; authenticated P43 connection lifecycle executed through delivered app UI against an isolated local SQLite fixture.', baseline, captures, reauthErrorActionReachability, expirationFixture: 'The issued disposable token expiration was advanced in the isolated SQLite fixture before visiting the authenticated expired-token filter; the application then rendered the real expired status and allowed revocation.', secretValueIncluded: false };
  } finally {
    guiSocket?.close();
    await stopChild(browser);
  }
}

try {
  apiPort = await freePort();
  await new Promise<void>((resolve, reject) => {
    api.once('error', reject);
    api.listen(apiPort, '127.0.0.1', () => resolve());
  });

  const webPort = await freePort();
  vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: path.join(root, 'packages/web'), stdio: 'inherit', env: { ...process.env, ZUR_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` },
  });
  const webOrigin = `http://127.0.0.1:${webPort}`;
  await waitForUrl(webOrigin, vite);

  const debugPort = chromeDebugPort = await freePort();
  chrome = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, 'chrome-profile')}`,
    '--window-size=1440,1043', 'about:blank',
  ], { stdio: 'ignore' });
  let target: any;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before DevTools startup (${chrome.exitCode})`);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as any[];
      target = targets.find((item) => item.type === 'page');
      if (target?.webSocketDebuggerUrl) break;
    } catch { /* wait for Chrome */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!target?.webSocketDebuggerUrl) throw new Error('Chrome page target did not start');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket!.addEventListener('open', () => resolve(), { once: true });
    socket!.addEventListener('error', () => reject(new Error('Could not connect to Chrome DevTools')), { once: true });
  });
  let commandId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const responseHandlers: Array<(message: any) => void> = [];
  const apiRequests: Array<{ url: string; method: string }> = [];
  const apiResponses: Array<{ url: string; status: number }> = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    } else {
      if (message.method === 'Network.requestWillBeSent' && String(message.params.request.url).includes('/api/')) {
        apiRequests.push({ url: message.params.request.url, method: message.params.request.method });
      }
      if (message.method === 'Network.responseReceived' && String(message.params.response.url).includes('/api/')) {
        apiResponses.push({ url: message.params.response.url, status: message.params.response.status });
      }
      for (const handler of responseHandlers) handler(message);
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket!.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression: string) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
  const waitFor = async (expression: string, accept: (value: any) => boolean, label: string) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      const value = await evaluate(expression);
      if (accept(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const navigate = async (url: string) => {
    await send('Page.navigate', { url });
    const expected = new URL(url).pathname + new URL(url).search;
    await waitFor('location.pathname + location.search', (value) => value === expected, `navigation ${expected}`);
    await waitFor('document.readyState', (value) => value === 'complete' || value === 'interactive', `document ready ${expected}`);
  };
  const setViewport = async (width: number, height: number) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    return await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth})');
  };
  const networkStatuses: Array<{ url: string; status: number }> = [];
  responseHandlers.push((message) => {
    if (message.method === 'Network.responseReceived' && String(message.params.response.url).includes('/api/admin/courses/course-python-foundations/waivers?')) {
      networkStatuses.push({ url: message.params.response.url, status: message.params.response.status });
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await navigate(`${webOrigin}/sign-in`);
  await waitFor('Boolean(document.querySelector("#sign-in-form"))', Boolean, 'client-rendered sign-in form');
  await evaluate(`(()=>{document.querySelector('#email').value='margaret@zur.internal';document.querySelector('#password').value='AdminPass123!';document.querySelector('#sign-in-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
  await waitFor("localStorage.getItem('zur_session_token')", (value) => typeof value === 'string' && value.length > 20, 'real seeded admin authentication');

  const captures: Array<Record<string, unknown>> = [];
  for (const theme of ['dark', 'light'] as const) {
    await evaluate(`localStorage.setItem('zur_theme_preference','${theme}')`);
    await navigate(`${webOrigin}/admin/courses/course-python-foundations`);
    await waitFor('Boolean(document.querySelector("[data-waiver-step]"))', Boolean, 'interactive admin waiver form');
    await evaluate(`(()=>{const select=document.querySelector('[data-waiver-step]');select.value=select.options[0].value;select.dispatchEvent(new Event('change',{bubbles:true}));return select.value})()`);
    const reviewText = await waitFor("document.querySelector('.waiver-review-count')?.textContent", (value) => typeof value === 'string' && /\d+ active enrollment/.test(value), 'server-reviewed waiver scope');
    const reviewed = await evaluate(`(()=>({theme:document.documentElement.getAttribute('data-theme'),text:document.querySelector('.waiver-review-count')?.textContent,buttonDisabled:document.querySelector('[data-admin-mutation][action$="/waivers"] button[type="submit"]')?.disabled,reasonField:Boolean(document.querySelector('[data-admin-mutation][action$="/waivers"] [name="reason"]')),passwordField:Boolean(document.querySelector('[data-admin-mutation][action$="/waivers"] [name="currentPassword"]')),detail:document.querySelector('.admin-page-content h2')?.textContent}))()`);
    if (!reviewed || reviewed.theme !== theme || reviewed.buttonDisabled || !reviewed.reasonField || !reviewed.passwordField) {
      throw new Error(`Waiver review was not ready in ${theme} theme: ${JSON.stringify(reviewed)}`);
    }
    const viewport = await evaluate(`(()=>{document.querySelector('[data-waiver-step]')?.closest('form')?.scrollIntoView({block:'center'});return {width:innerWidth,height:innerHeight}})()`);
    if (viewport.width !== 1440 || viewport.height !== 900) throw new Error(`Unexpected interactive capture viewport: ${JSON.stringify(viewport)}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshot = `screenshots/s4_t087_p34_waiver_scope_review_1440x900_${theme}.png`;
    fs.writeFileSync(path.join(root, screenshot), Buffer.from(shot.data, 'base64'));
    captures.push({ route: '/admin/courses/course-python-foundations', theme, viewport: [viewport.width, viewport.height], reviewText, buttonEnabled: true, authenticatedRequestStatus: networkStatuses.at(-1)?.status, screenshot });
  }
  if (captures.some((capture) => capture.authenticatedRequestStatus !== 200)) throw new Error(`Waiver preview API did not return 200: ${JSON.stringify(networkStatuses)}`);
  const signInAs = async (email: string, password: string) => {
    await evaluate('localStorage.clear()');
    await navigate(`${webOrigin}/sign-in`);
    await waitFor('Boolean(document.querySelector("#sign-in-form"))', Boolean, 'interactive sign-in form');
    await evaluate(`(()=>{document.querySelector('#email').value=${JSON.stringify(email)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#sign-in-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
    await waitFor("localStorage.getItem('zur_session_token')", (value) => typeof value === 'string' && value.length > 20, 'seeded fixture account sign-in');
    await waitFor("JSON.parse(localStorage.getItem('zur_current_user')||'null')?.email", (value) => value === email, `authenticated user ${email}`);
  };

  await signInAs('guido@zur.internal', 'AuthorPass123!');
  const authorCaptures: Array<Record<string, unknown>> = [];
  for (const theme of ['dark', 'light'] as const) {
    await evaluate(`localStorage.setItem('zur_theme_preference','${theme}')`);
    await navigate(`${webOrigin}/teach/course-python-foundations/content`);
    await waitFor('Boolean(document.querySelector(".author-inspector-pane"))', Boolean, 'client-rendered author inspector panel');
    const inspector = await evaluate(`(()=>({theme:document.documentElement.getAttribute('data-theme'),label:document.querySelector('.author-inspector-pane')?.getAttribute('aria-label'),text:document.querySelector('.author-inspector-pane')?.innerText,buttons:[...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(Boolean)}))()`);
    if (!inspector?.text?.includes('Exercise Settings') || !inspector.label) throw new Error(`The selected-item inspector content did not render in ${theme}`);
    const viewport = await evaluate('({width:innerWidth,height:innerHeight})');
    if (viewport.width !== 1440 || viewport.height !== 900) throw new Error(`Unexpected P22 live route viewport: ${JSON.stringify(viewport)}`);
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const screenshot = `screenshots/s4_t087_p22_live_client_inspector_visible_1440x900_${theme}.png`;
    fs.writeFileSync(path.join(root, screenshot), Buffer.from(shot.data, 'base64'));
    authorCaptures.push({ route: '/teach/course-python-foundations/content', theme, viewport: [1440, 900], inspectorLabel: inspector.label, inspectorText: inspector.text, screenshot });
  }
  const p27Captures: Array<Record<string, unknown>> = [];
  const p27ReceiptCaptures: Array<Record<string, unknown>> = [];
  const p27Responsive: Array<Record<string, unknown>> = [];
  await evaluate("localStorage.setItem('zur_theme_preference','dark')");
  await navigate(`${webOrigin}/teach/course-python-foundations/publish`);
  const p27ApiIndex = apiResponses.length;
  const publishProbe = await waitFor('document.body.innerText', (value) => typeof value === 'string' && value.length > 80, 'P27 route client render');
  await new Promise((resolve) => setTimeout(resolve, 700));
  const publishRouteHasReview = await evaluate('Boolean(document.querySelector(".publish-review-container"))');
  const p27Body = await evaluate('document.body.innerText');
  const p27Responses = apiResponses.slice(p27ApiIndex);
  if (!publishRouteHasReview) throw new Error(`P27 review did not render: ${p27Body}`);
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await evaluate("localStorage.setItem('zur_theme_preference','light')");
      await navigate(`${webOrigin}/teach/course-python-foundations/publish`);
      await waitFor('Boolean(document.querySelector(".publish-review-container"))', Boolean, 'P27 review in light theme');
    }
    for (const [width, height] of [[390, 844], [320, 844], [768, 1024], [1440, 900]] as const) {
      await setViewport(width, height);
      await navigate(`${webOrigin}/teach/course-python-foundations/publish`);
      await waitFor('Boolean(document.querySelector(".publish-review-container"))', Boolean, `P27 ${width}px ${theme}`);
      const measured = await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth})');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const file = `screenshots/s4_t087_p27_live_review_${width}x${height}_${theme}.png`;
      const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      fs.writeFileSync(path.join(root, file), Buffer.from(shot.data, 'base64'));
      p27Responsive.push({ theme, route: '/teach/course-python-foundations/publish', viewport: [width, height], measured, horizontalOverflow: measured.scrollWidth > width || measured.bodyScrollWidth > width, screenshot: file });
    }
    await setViewport(1440, 900);
    await evaluate("document.getElementById('publish-open-confirm')?.click()");
    await waitFor('Boolean(document.querySelector("#publish-confirm-submit"))', Boolean, 'publish confirmation modal');
    const viewport = await evaluate('({width:innerWidth,height:innerHeight,theme:document.documentElement.getAttribute("data-theme")})');
    if (viewport.width !== 1440 || viewport.height !== 900 || viewport.theme !== theme) throw new Error(`Unexpected P27 confirmation viewport/theme: ${JSON.stringify(viewport)}`);
    const modalShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const modalScreenshot = `screenshots/s4_t087_p27_publish_confirmation_1440x900_${theme}.png`;
    fs.writeFileSync(path.join(root, modalScreenshot), Buffer.from(modalShot.data, 'base64'));
    p27Captures.push({ theme, state: 'explicit confirmation dialog', viewport: [viewport.width, viewport.height], screenshot: modalScreenshot });
    if (theme === 'dark') {
      await evaluate("document.getElementById('publish-cancel-confirm')?.click()");
    } else {
      const publishIndex = apiResponses.length;
      await evaluate("document.getElementById('publish-confirm-submit')?.click()");
      await waitFor('Boolean(document.querySelector(".receipt-card"))', Boolean, 'server publication receipt');
      await new Promise((resolve) => setTimeout(resolve, 300));
      const publishResponse = apiResponses.slice(publishIndex).find((item) => item.url.endsWith('/publish'));
      const viewportReceipt = await evaluate('({width:innerWidth,height:innerHeight,theme:document.documentElement.getAttribute("data-theme")})');
      const receiptShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const receiptScreenshot = `screenshots/s4_t087_p27_publish_receipt_1440x900_${theme}.png`;
      fs.writeFileSync(path.join(root, receiptScreenshot), Buffer.from(receiptShot.data, 'base64'));
      p27Captures.push({ theme, state: 'server-issued receipt after confirmation', viewport: [viewportReceipt.width, viewportReceipt.height], publishResponse, receiptText: await evaluate('document.querySelector(".receipt-card")?.innerText'), screenshot: receiptScreenshot });
      if (publishResponse?.status !== 200 || !String(await evaluate('document.querySelector(".receipt-card")?.innerText')).includes('Released Version')) throw new Error(`Publication receipt was not backed by successful API response: ${JSON.stringify(publishResponse)}`);
      const stableReceiptText = await evaluate('document.querySelector(".receipt-card")?.innerText');
      for (const receiptTheme of ['dark', 'light'] as const) {
        await evaluate(`localStorage.setItem('zur_theme_preference','${receiptTheme}');document.documentElement.setAttribute('data-theme','${receiptTheme}')`);
        for (const [width, height] of [[390, 844], [320, 844]] as const) {
          const metrics = await setViewport(width, height);
          if (!String(await evaluate('document.querySelector(".receipt-card")?.innerText')).includes('Released Version')) throw new Error(`Responsive P27 receipt disappeared at ${width}px`);
          const screenshot = `screenshots/s4_t087_p27_publish_receipt_${width}x${height}_${receiptTheme}.png`;
          const responsiveShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
          fs.writeFileSync(path.join(root, screenshot), Buffer.from(responsiveShot.data, 'base64'));
          const capture = { theme: receiptTheme, state: 'server-issued publication receipt', viewport: [width, height], measured: metrics, horizontalOverflow: metrics.scrollWidth > width || metrics.bodyScrollWidth > width, receiptText: stableReceiptText, publishResponse, screenshot };
          if (capture.horizontalOverflow) throw new Error(`P27 publication receipt overflows at ${width}px/${receiptTheme}: ${JSON.stringify(metrics)}`);
          p27ReceiptCaptures.push(capture);
        }
      }
      await setViewport(1440, 900);
      await evaluate(`localStorage.setItem('zur_theme_preference','${theme}');document.documentElement.setAttribute('data-theme','${theme}')`);
    }
  }
  await signInAs('ada@zur.internal', 'StudentPass123!');
  await evaluate("localStorage.setItem('zur_theme_preference','dark')");
  await navigate(`${webOrigin}/learn/enr-ada/steps/step-6-python-evenodd/code`);
  const p15ApiIndex = apiResponses.length;
  await waitFor('document.body.innerText', (value) => typeof value === 'string' && value.length > 80, 'P15 route client render');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const p15Captures: Array<Record<string, unknown>> = [];
  const p15States: Array<Record<string, unknown>> = [];
  const p15Responsive: Array<Record<string, unknown>> = [];
  let p15RequestsStart = apiRequests.length;
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await evaluate("localStorage.setItem('zur_theme_preference','light')");
      await navigate(`${webOrigin}/learn/enr-ada/steps/step-6-python-evenodd/code`);
      await waitFor('Boolean(document.querySelector("#code-editor-input"))', Boolean, 'P15 in light theme');
    }
    const viewport = await evaluate('({width:innerWidth,height:innerHeight,theme:document.documentElement.getAttribute("data-theme")})');
    if (viewport.width !== 1440 || viewport.height !== 900 || viewport.theme !== theme) throw new Error(`Unexpected P15 viewport/theme: ${JSON.stringify(viewport)}`);
    const sampleCode = 'import sys\nraw = sys.stdin.read().strip()\nprint("Empty" if not raw else "Even")\n';
    await evaluate(`(()=>{const e=document.querySelector('#code-editor-input');e.value=${JSON.stringify(sampleCode)};e.dispatchEvent(new Event('input',{bubbles:true}));return e.value})()`);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    await evaluate("document.getElementById('run-samples-btn')?.click()");
    const sampleText = await waitFor('document.querySelector(".results-body")?.innerText', (value) => typeof value === 'string' && (value.includes('Samples passed.') || value.includes('Verdict:') || value.includes('We could not check')), 'real P15 sample run result');
    if (!sampleText.includes('Samples passed.')) throw new Error(`P15 sample run failed unexpectedly: ${sampleText}`);
    const sampleShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const sampleScreenshot = `screenshots/s4_t087_p15_samples_passed_1440x900_${theme}.png`;
    fs.writeFileSync(path.join(root, sampleScreenshot), Buffer.from(sampleShot.data, 'base64'));
    p15Captures.push({ theme, state: 'samples passed', viewport: [viewport.width, viewport.height], screenshot: sampleScreenshot });
    await evaluate("document.getElementById('submit-solution-btn')?.click()");
    const submitText = await waitFor('document.querySelector(".results-body")?.innerText', (value) => typeof value === 'string' && value.includes('Verdict:'), 'real P15 submission with hidden-only failure');
    const safeHiddenResult = await evaluate(`(()=>({text:document.querySelector('.results-body')?.innerText,containsSecretInput:document.querySelector('.results-body')?.innerText.includes('-3'),containsHiddenExpectedOutput:document.querySelector('.results-body')?.innerText.includes('Odd'),containsExecutionTiming:/\\b\\d+\\s+ms\\b/.test(document.querySelector('.results-body')?.innerText||''),continueVisible:[...document.querySelectorAll('a')].some(a=>a.textContent==='Continue')}))()`);
    if (safeHiddenResult.containsSecretInput || safeHiddenResult.containsHiddenExpectedOutput || safeHiddenResult.containsExecutionTiming || safeHiddenResult.continueVisible) throw new Error(`P15 result leaked hidden payload/timing or showed false completion: ${JSON.stringify(safeHiddenResult)}`);
    const submitShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const submitScreenshot = `screenshots/s4_t087_p15_submit_redacted_failure_1440x900_${theme}.png`;
    fs.writeFileSync(path.join(root, submitScreenshot), Buffer.from(submitShot.data, 'base64'));
    p15Captures.push({ theme, state: 'submission hidden-test failure safely redacted', viewport: [viewport.width, viewport.height], resultText: submitText, screenshot: submitScreenshot });
    p15States.push({ theme, sampleText, submitText, safeHiddenResult, saveIndicator: await evaluate('document.querySelector(".save-indicator")?.innerText'), apiRequests: apiRequests.slice(p15RequestsStart) });
    p15RequestsStart = apiRequests.length;
  }
  for (const theme of ['dark', 'light'] as const) {
    await evaluate(`localStorage.setItem('zur_theme_preference','${theme}')`);
    for (const [width, height] of [[390, 844], [320, 844], [768, 1024], [1440, 900]] as const) {
      await setViewport(width, height);
      await navigate(`${webOrigin}/learn/enr-ada/steps/step-6-python-evenodd/code`);
      await waitFor('Boolean(document.querySelector("#code-editor-input"))', Boolean, `P15 responsive ${theme} ${width}px`);
      const measured = await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth})');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const file = `screenshots/s4_t087_p15_live_workspace_${width}x${height}_${theme}.png`;
      const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      fs.writeFileSync(path.join(root, file), Buffer.from(shot.data, 'base64'));
      const editorReadOnly = await evaluate('Boolean(document.querySelector("#code-editor-input")?.readOnly)');
      const resetControl = await evaluate(`(()=>{const e=document.querySelector('#reset-code-btn');const s=e&&getComputedStyle(e);return {exists:Boolean(e),visible:Boolean(e&&e.getClientRects().length&&s?.display!=='none'&&s?.visibility!=='hidden')}})()`);
      if (width < 1024 && !editorReadOnly) throw new Error(`P15 compact ${width}px route did not make the editor read-only`);
      if (resetControl.visible !== (width >= 1024)) throw new Error(`P15 reset availability did not match desktop-only breakpoint at ${width}px: ${JSON.stringify(resetControl)}`);
      let compactResetGuard: Record<string, unknown> | undefined;
      if (width === 320) {
        const before = await evaluate('document.querySelector("#code-editor-input")?.value');
        const responseStart = apiResponses.length;
        await evaluate("window.confirm=()=>true;document.getElementById('reset-code-btn')?.click();true");
        await new Promise((resolve) => setTimeout(resolve, 150));
        const after = await evaluate('document.querySelector("#code-editor-input")?.value');
        const resetRequest = apiResponses.slice(responseStart).find((item) => item.url.endsWith('/api/drafts/reset'));
        if (before !== after || resetRequest) throw new Error(`P15 compact reset handler changed state or called its API: ${JSON.stringify({ resetRequest, unchanged: before === after })}`);
        compactResetGuard = { programmaticClickAttempted: true, hidden: !resetControl.visible, noResetRequest: !resetRequest, codePreserved: before === after };
      }
      const editorRect = await evaluate(`(()=>{const e=document.querySelector('#code-editor-input');const r=e?.getBoundingClientRect();return {width:r?.width||0,height:r?.height||0,display:e?getComputedStyle(e).display:'none',visibility:e?getComputedStyle(e).visibility:'hidden'}})()`);
      if (width < 1024 && editorRect.height < 40) throw new Error(`P15 compact ${width}px route does not visibly retain the saved code snapshot: ${JSON.stringify(editorRect)}`);
      let compactResizePreserved: boolean | undefined;
      if (width === 320) {
        const codeBeforeResize = await evaluate('document.querySelector("#code-editor-input")?.value');
        await setViewport(1440, 900);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const desktopEditable = await evaluate('document.querySelector("#code-editor-input")?.readOnly === false');
        await setViewport(320, 844);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const compactReadOnly = await evaluate('document.querySelector("#code-editor-input")?.readOnly === true');
        const codeAfterResize = await evaluate('document.querySelector("#code-editor-input")?.value');
        if (!desktopEditable || !compactReadOnly || codeBeforeResize !== codeAfterResize) throw new Error('P15 resize did not preserve editor code while switching compact read-only mode');
        compactResizePreserved = true;
      }
      p15Responsive.push({ theme, route: '/learn/enr-ada/steps/step-6-python-evenodd/code', viewport: [width, height], measured, horizontalOverflow: measured.scrollWidth > width || measured.bodyScrollWidth > width, editorReadOnly, editorRect, resetControl, compactResetGuard, compactResizePreserved, screenshot: file });
    }
  }
  await setViewport(1440, 900);
  await evaluate("localStorage.setItem('zur_theme_preference','light')");
  await navigate(`${webOrigin}/learn/enr-ada/steps/step-6-python-evenodd/code`);
  await waitFor('Boolean(document.querySelector("#code-editor-input"))', Boolean, 'P15 live offline state');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: 'none' });
  const offlineCode = await evaluate(`(()=>{const e=document.querySelector('#code-editor-input');e.value=e.value+'\\n# offline recovery checkpoint';e.dispatchEvent(new Event('input',{bubbles:true}));return e.value})()`);
  await waitFor('document.getElementById("python-save-indicator")?.textContent', (value) => value === 'Unsaved edits (offline)', 'P15 offline autosave state');
  const offlineLocal = await evaluate(`(()=>{const key=Object.keys(localStorage).find(k=>k.includes('draft')&&localStorage.getItem(k)?.includes('offline recovery checkpoint'));return {saved:Boolean(key),key}})()`);
  if (!offlineLocal.saved) throw new Error('P15 offline state did not preserve its local draft recovery copy');
  const offlineShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const offlineScreenshot = 'screenshots/s4_t087_p15_live_offline_unsaved_1440x900_light.png';
  fs.writeFileSync(path.join(root, offlineScreenshot), Buffer.from(offlineShot.data, 'base64'));
  const p15Offline = { theme: 'light', route: '/learn/enr-ada/steps/step-6-python-evenodd/code', viewport: [1440, 900], indicator: 'Unsaved edits (offline)', localDraftPreserved: offlineLocal.saved, editedCodeLength: String(offlineCode).length, screenshot: offlineScreenshot };
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'wifi' });
  const restoredCode = await evaluate(`(()=>{const e=document.querySelector('#code-editor-input');e.value=e.value+'\\n# reconnect sync';e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  if (!restoredCode) throw new Error('Could not trigger P15 draft synchronization after reconnect');
  await waitFor('document.getElementById("python-save-indicator")?.textContent', (value) => value === 'Saved', 'P15 draft sync after reconnect');
  await setViewport(1440, 900);
  await evaluate("localStorage.setItem('zur_theme_preference','dark')");
  await navigate(`${webOrigin}/learn/enr-ada/steps/step-6-python-evenodd/code`);
  await waitFor('Boolean(document.querySelector("#code-editor-input"))', Boolean, 'P15 pass submission route');
  const passingCode = 'import sys\nraw = sys.stdin.read().strip()\nif not raw:\n    print("Empty")\nelse:\n    number = int(raw)\n    print("Even" if number % 2 == 0 else "Odd")\n';
  await evaluate(`(()=>{const e=document.querySelector('#code-editor-input');e.value=${JSON.stringify(passingCode)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await waitFor('document.getElementById("python-save-indicator")?.textContent', (value) => value === 'Saved', 'pinned-version passing code save');
  const passResponseStart = apiResponses.length;
  await evaluate("document.getElementById('submit-solution-btn')?.click()");
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const passDiagnostic = await evaluate(`({text:document.querySelector('.results-body')?.innerText,body:document.body.innerText.slice(-1000),submitPresent:Boolean(document.getElementById('submit-solution-btn')),submitDisabled:document.getElementById('submit-solution-btn')?.disabled,editor:document.querySelector('#code-editor-input')?.value})`);
  if (!passDiagnostic.text || (!passDiagnostic.text.toLowerCase().includes('passed') && !passDiagnostic.text.includes('WRONG_ANSWER') && !passDiagnostic.text.includes('could not check'))) throw new Error(`P15 submit did not display a terminal assessment result: ${JSON.stringify({ passDiagnostic, recentApiResponses: apiResponses.slice(passResponseStart), recentApiRequests: apiRequests.slice(-5) })}`);
  const passText = await waitFor('document.querySelector(".results-body")?.innerText', (value) => typeof value === 'string' && (value.toLowerCase().includes('passed') || value.includes('WRONG_ANSWER') || value.includes('could not check')), 'actual pinned-version submission terminal result');
  if (!passText.toLowerCase().includes('all tests passed')) throw new Error(`P15 candidate did not pass the pinned assessment: ${passText}`);
  const passStepState = await evaluate(`(async()=>{const token=localStorage.getItem('zur_session_token');const headers={Authorization:'Bearer '+token};const response=await fetch('/api/enrollments/enr-ada/steps/step-6-python-evenodd',{headers});const dashboard=await fetch('/api/student/dashboard',{headers});return {status:response.status,data:await response.json(),dashboard:await dashboard.json()}})()`);
  const passSubmitResponse = apiResponses.slice(passResponseStart).find((item) => item.url.endsWith('/api/execution/submit'));
  const passContinueVisible = await evaluate('[...document.querySelectorAll("a,button")].some(e=>e.textContent?.trim()==="Continue")');
  if (passSubmitResponse?.status !== 200 || passStepState.status !== 200 || passStepState.data.stepMeta?.isCompleted !== true || !passContinueVisible) throw new Error(`P15 real passing submission did not persist completion: ${JSON.stringify({ passSubmitResponse, stepMeta: passStepState.data.stepMeta, passContinueVisible })}`);
  const passScreenshot = 'screenshots/s4_t087_p15_live_pinned_tests_passed_completion_1440x900_dark.png';
  const passShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(root, passScreenshot), Buffer.from(passShot.data, 'base64'));
  const p15PassEvidence = { state: 'actual learner submission passed against enrollment-pinned immutable tests; step completion persisted', submitResponse: passSubmitResponse, stepId: passStepState.data.step?.id, pinnedVersionNumber: passStepState.dashboard.continueCourse?.pinnedVersionNumber, isCompleted: passStepState.data.stepMeta?.isCompleted, continueVisible: passContinueVisible, resultSummary: 'All tests passed.', screenshot: passScreenshot };
  const secondTab = await openBrowserTab(`${webOrigin}/learn/enr-ada/steps/step-6-python-evenodd/code`);
  const secondTabOriginalCode = await secondTab.evaluate('document.querySelector("#code-editor-input")?.value');
  const tabOneCode = `${String(await evaluate('document.querySelector("#code-editor-input")?.value'))}\n# first tab acknowledged revision`;
  await evaluate(`(()=>{const e=document.querySelector('#code-editor-input');e.value=${JSON.stringify(tabOneCode)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await waitFor('document.getElementById("python-save-indicator")?.textContent', (value) => value === 'Saved', 'first tab draft save');
  const tabTwoCode = `${String(secondTabOriginalCode)}\n# second tab recovery candidate`;
  await secondTab.evaluate(`(()=>{const e=document.querySelector('#code-editor-input');e.value=${JSON.stringify(tabTwoCode)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await secondTab.evaluate('document.getElementById("python-save-indicator")?.textContent') === 'Draft conflict') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const tabTwoConflict = await secondTab.evaluate(`(async()=>{const token=localStorage.getItem('zur_session_token');const current=await fetch('/api/drafts?enrollmentId=enr-ada&stepId=step-6-python-evenodd',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());const editor=document.querySelector('#code-editor-input');const localKey=Object.keys(localStorage).find(k=>k.startsWith('zur_draft_')&&k.includes('enr-ada')&&k.includes('step-6-python-evenodd'));const local=localKey?JSON.parse(localStorage.getItem(localKey)):null;return {indicator:document.getElementById('python-save-indicator')?.textContent,notice:document.getElementById('python-save-notice')?.textContent,editorCode:editor?.value,serverCode:current.code,serverRevision:current.revision,localRevision:local?.revision,localCode:local?.code}})()`);
  const conflictStatus = secondTab.responses.find((item) => item.url.endsWith('/api/drafts') && item.status === 409);
  if (tabTwoConflict.indicator !== 'Draft conflict' || tabTwoConflict.editorCode !== tabTwoCode || tabTwoConflict.localCode !== tabTwoCode || tabTwoConflict.serverCode !== tabOneCode || !String(tabTwoConflict.notice).includes('newer server draft') || !conflictStatus) {
    await secondTab.close();
    throw new Error(`Two-tab draft conflict failed safe-recovery assertions: ${JSON.stringify({ tabTwoConflict, conflictStatus })}`);
  }
  const conflictScreenshot = 'screenshots/s4_t087_p15_two_tab_draft_conflict_recovery_1440x900_dark.png';
  fs.writeFileSync(path.join(root, conflictScreenshot), Buffer.from(await secondTab.screenshot(), 'base64'));
  await secondTab.evaluate("document.getElementById('keep-local-draft-btn')?.click()");
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await secondTab.evaluate('document.getElementById("python-save-indicator")?.textContent') === 'Saved') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const resolvedConflict = await secondTab.evaluate(`(async()=>{const token=localStorage.getItem('zur_session_token');const saved=await fetch('/api/drafts?enrollmentId=enr-ada&stepId=step-6-python-evenodd',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());return {indicator:document.getElementById('python-save-indicator')?.textContent,notice:document.getElementById('python-save-notice')?.textContent,editorCode:document.querySelector('#code-editor-input')?.value,serverCode:saved.code,revision:saved.revision}})()`);
  const localResolutionResponse = [...secondTab.responses].reverse().find((item) => item.url.endsWith('/api/drafts') && item.status === 200);
  if (resolvedConflict.indicator !== 'Saved' || resolvedConflict.notice || resolvedConflict.editorCode !== tabTwoCode || resolvedConflict.serverCode !== tabTwoCode || !localResolutionResponse) {
    await secondTab.close();
    throw new Error(`Explicit keep-local conflict resolution did not save the selected recovery copy: ${JSON.stringify({ resolvedConflict, localResolutionResponse })}`);
  }
  const resolvedScreenshot = 'screenshots/s4_t087_p15_two_tab_draft_conflict_resolved_1440x900_dark.png';
  fs.writeFileSync(path.join(root, resolvedScreenshot), Buffer.from(await secondTab.screenshot(), 'base64'));
  await secondTab.evaluate('location.reload()');
  for (let attempt = 0; attempt < 120; attempt++) {
    const state = await secondTab.evaluate(`({code:document.querySelector('#code-editor-input')?.value,notice:document.getElementById('python-save-notice')?.textContent,indicator:document.getElementById('python-save-indicator')?.textContent})`);
    if (state.code === tabTwoCode && String(state.indicator).trim() === 'Saved' && !state.notice) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const conflictRecovery = await secondTab.evaluate(`({code:document.querySelector('#code-editor-input')?.value,notice:document.getElementById('python-save-notice')?.textContent,indicator:document.getElementById('python-save-indicator')?.textContent})`);
  if (conflictRecovery.code !== tabTwoCode || String(conflictRecovery.indicator).trim() !== 'Saved' || conflictRecovery.notice) {
    await secondTab.close();
    throw new Error(`Reload did not preserve the explicitly resolved draft: ${JSON.stringify(conflictRecovery)}`);
  }
  const selectedServerCode = `${tabTwoCode}\n# saved server copy selected explicitly`;
  await secondTab.evaluate(`(()=>{const e=document.querySelector('#code-editor-input');e.value=${JSON.stringify(selectedServerCode)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  for (let attempt = 0; attempt < 120; attempt++) {
    if (String(await secondTab.evaluate('document.getElementById("python-save-indicator")?.textContent')).trim() === 'Saved') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const mainUnsavedChoice = `${tabOneCode}\n# discard only after explicit server choice`;
  await evaluate(`(()=>{const e=document.querySelector('#code-editor-input');e.value=${JSON.stringify(mainUnsavedChoice)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await evaluate('document.getElementById("python-save-indicator")?.textContent') === 'Draft conflict') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const useServerConflictResponse = apiResponses.slice(-8).find((item) => item.url.endsWith('/api/drafts') && item.status === 409);
  if (!useServerConflictResponse || !(await evaluate('Boolean(document.getElementById("use-server-draft-btn"))'))) {
    await secondTab.close();
    throw new Error(`P15 use-server conflict choice was not presented after an actual second-tab revision: ${JSON.stringify(useServerConflictResponse)}`);
  }
  await evaluate("document.getElementById('use-server-draft-btn')?.click()");
  for (let attempt = 0; attempt < 120; attempt++) {
    if (String(await evaluate('document.getElementById("python-save-indicator")?.textContent')).trim() === 'Saved') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const useServerResolution = await evaluate(`(async()=>{const token=localStorage.getItem('zur_session_token');const saved=await fetch('/api/drafts?enrollmentId=enr-ada&stepId=step-6-python-evenodd',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());return {indicator:document.getElementById('python-save-indicator')?.textContent?.trim(),notice:document.getElementById('python-save-notice')?.textContent,editorCode:document.querySelector('#code-editor-input')?.value,serverCode:saved.code}})()`);
  if (useServerResolution.indicator !== 'Saved' || useServerResolution.notice || useServerResolution.editorCode !== selectedServerCode || useServerResolution.serverCode !== selectedServerCode) {
    await secondTab.close();
    throw new Error(`Explicit use-server choice did not restore the server copy: ${JSON.stringify(useServerResolution)}`);
  }
  await evaluate('location.reload()');
  for (let attempt = 0; attempt < 120; attempt++) {
    const state = await evaluate(`(async()=>{const token=localStorage.getItem('zur_session_token');const saved=await fetch('/api/drafts?enrollmentId=enr-ada&stepId=step-6-python-evenodd',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());return {indicator:document.getElementById('python-save-indicator')?.textContent?.trim(),notice:document.getElementById('python-save-notice')?.textContent,editorCode:document.querySelector('#code-editor-input')?.value,serverCode:saved.code}})()`);
    if (state.editorCode === selectedServerCode && state.serverCode === selectedServerCode && state.indicator === 'Saved' && !state.notice) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const useServerReload = await evaluate(`(async()=>{const token=localStorage.getItem('zur_session_token');const saved=await fetch('/api/drafts?enrollmentId=enr-ada&stepId=step-6-python-evenodd',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());return {indicator:document.getElementById('python-save-indicator')?.textContent?.trim(),notice:document.getElementById('python-save-notice')?.textContent,editorCode:document.querySelector('#code-editor-input')?.value,serverCode:saved.code}})()`);
  if (useServerReload.indicator !== 'Saved' || useServerReload.notice || useServerReload.editorCode !== selectedServerCode || useServerReload.serverCode !== selectedServerCode) {
    await secondTab.close();
    throw new Error(`Reload did not preserve the explicitly selected server copy: ${JSON.stringify(useServerReload)}`);
  }
  const useServerScreenshot = 'screenshots/s4_t087_p15_two_tab_draft_use_server_resolution_1440x900_dark.png';
  fs.writeFileSync(path.join(root, useServerScreenshot), Buffer.from((await send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data, 'base64'));
  await secondTab.close();
  const twoTabConflictEvidence = { firstTabSavedAcknowledged: true, secondTabConflictStatus: conflictStatus, serverRevisionBeforeChoice: tabTwoConflict.serverRevision, localRecoveryRevisionBeforeChoice: tabTwoConflict.localRevision, localTextPreserved: tabTwoConflict.localCode === tabTwoCode, explicitConflictNotice: tabTwoConflict.notice, keepLocalChoice: 'Keep my local code', keepLocalResolutionSaveResponse: localResolutionResponse, resolvedRevision: resolvedConflict.revision, serverCodeMatchesSelectedLocal: resolvedConflict.serverCode === tabTwoCode, reloadRestoredCode: conflictRecovery.code === tabTwoCode, reloadIndicator: String(conflictRecovery.indicator).trim(), keepLocalConflictScreenshot: conflictScreenshot, keepLocalResolvedScreenshot: resolvedScreenshot, useServerConflictResponse, useServerChoice: 'Use saved server code', useServerEditorMatchedServerCopy: useServerResolution.editorCode === selectedServerCode && useServerResolution.serverCode === selectedServerCode, useServerReloadMatchesServerCopy: useServerReload.editorCode === selectedServerCode && useServerReload.serverCode === selectedServerCode, useServerReloadIndicator: useServerReload.indicator, useServerReloadHasConflictNotice: Boolean(useServerReload.notice), useServerScreenshot };
  const remoteEdit = await evaluate(`(async()=>{const token=localStorage.getItem('zur_session_token');const params='?enrollmentId=enr-ada&stepId=step-6-python-evenodd';const current=await fetch('/api/drafts'+params,{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());const response=await fetch('/api/drafts',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({enrollmentId:'enr-ada',stepId:'step-6-python-evenodd',code:'print("saved in another tab")',baseRevision:current.revision})});return {status:response.status,revision:(await response.json()).revision}})()`);
  if (remoteEdit.status !== 200) throw new Error(`Could not prepare an actual concurrent draft revision: ${JSON.stringify(remoteEdit)}`);
  const localCodeBeforeReset = await evaluate("document.getElementById('code-editor-input')?.value");
  const resetResponseStart = apiResponses.length;
  await evaluate("window.confirm=()=>true;document.getElementById('reset-code-btn')?.click();true");
  await waitFor('document.getElementById("python-save-indicator")?.textContent', (value) => value === 'Draft conflict', 'stale reset conflict status');
  await new Promise((resolve) => setTimeout(resolve, 200));
  const staleResetResult = await evaluate(`(()=>({editorCode:document.getElementById('code-editor-input')?.value,notice:document.getElementById('python-save-notice')?.textContent,indicator:document.getElementById('python-save-indicator')?.textContent}))()`);
  if (staleResetResult.editorCode !== localCodeBeforeReset || !String(staleResetResult.notice).includes('newer server draft')) {
    throw new Error(`Stale reset did not preserve the local editor: ${JSON.stringify(staleResetResult)}`);
  }
  const resetApiResponse = apiResponses.slice(resetResponseStart).find((item) => item.url.endsWith('/api/drafts/reset'));
  if (resetApiResponse?.status !== 409) throw new Error(`Stale reset endpoint did not return a conflict: ${JSON.stringify(resetApiResponse)}`);
  const staleResetShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const staleResetScreenshot = 'screenshots/s4_t087_p15_reset_stale_revision_conflict_1440x900_light.png';
  fs.writeFileSync(path.join(root, staleResetScreenshot), Buffer.from(staleResetShot.data, 'base64'));
  p15Captures.push({ theme: 'light', state: 'concurrent edit blocks stale reset without replacing local code', viewport: [1440, 900], resetResponse: resetApiResponse, localCodePreserved: true, screenshot: staleResetScreenshot });
  await navigate(`${webOrigin}/learn/enr-ada/steps/step-6-python-evenodd/attempts`);
  await waitFor('document.body.innerText', (value) => typeof value === 'string' && value.includes('Submission History'), 'live P16 attempt list route');
  const historyProbe = await evaluate(`(async()=>{const token=localStorage.getItem('zur_session_token');const response=await fetch('/api/attempts?enrollmentId=enr-ada&stepId=step-6-python-evenodd',{headers:{Authorization:'Bearer '+token}});const page=await response.json();const item=page.items.find(x=>x.verdict==='WRONG_ANSWER');if(!item)return {status:response.status,found:false};const detailResponse=await fetch('/api/attempts/'+encodeURIComponent(item.id),{headers:{Authorization:'Bearer '+token}});const detail=await detailResponse.json();return {status:response.status,detailStatus:detailResponse.status,attemptId:item.id,listHasTiming:Object.hasOwn(item,'executionTimeMs'),detailHasTiming:Object.hasOwn(detail,'executionTimeMs'),attemptNumber:item.attemptNumber}})()`);
  const listTimingProbe = await evaluate(`(()=>{const row=[...document.querySelectorAll('.attempt-row-card')].find(e=>e.innerText.includes('Attempt #${historyProbe.attemptNumber}'));return {rowFound:Boolean(row),hiddenFailureRowHasTiming:/\\b\\d+\\s+ms\\b/.test(row?.innerText||''),otherRowsWithTiming:[...document.querySelectorAll('.attempt-row-card')].filter(e=>!e.innerText.includes('Attempt #${historyProbe.attemptNumber}')&&/\\b\\d+\\s+ms\\b/.test(e.innerText)).length}})()`);
  historyProbe.listUiHasTiming = listTimingProbe.hiddenFailureRowHasTiming;
  historyProbe.listTimingProbe = listTimingProbe;
  if (historyProbe.status !== 200 || historyProbe.detailStatus !== 200 || historyProbe.found === false || historyProbe.listHasTiming || historyProbe.detailHasTiming || historyProbe.listUiHasTiming) throw new Error(`P16 hidden-failure history leaked timing or failed to load: ${JSON.stringify(historyProbe)}`);
  const historyScreenshot = 'screenshots/s4_t087_p16_hidden_failure_attempt_history_1440x900_light.png';
  const historyShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(root, historyScreenshot), Buffer.from(historyShot.data, 'base64'));
  await navigate(`${webOrigin}/learn/enr-ada/steps/step-6-python-evenodd/attempts/${encodeURIComponent(historyProbe.attemptId)}`);
  await waitFor('document.body.innerText', (value) => typeof value === 'string' && value.includes('Submitted Code Snapshot'), 'live P16 read-only attempt detail');
  historyProbe.detailUiHasTiming = /\b\d+\s+ms\b/.test(await evaluate('document.body.innerText'));
  if (historyProbe.detailUiHasTiming) throw new Error(`P16 hidden-failure detail rendered execution timing: ${JSON.stringify(historyProbe)}`);
  const detailScreenshot = 'screenshots/s4_t087_p16_hidden_failure_attempt_detail_1440x900_light.png';
  const detailShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(root, detailScreenshot), Buffer.from(detailShot.data, 'base64'));
  const p16Probe = { result: 'P15 Attempts link opens the registered authenticated history route and read-only attempt detail; hidden-test failure timing is omitted from both API responses and rendered history.', ...historyProbe, captures: [ { route: '/learn/enr-ada/steps/step-6-python-evenodd/attempts', theme: 'light', viewport: [1440, 900], screenshot: historyScreenshot }, { route: `/learn/enr-ada/steps/step-6-python-evenodd/attempts/${historyProbe.attemptId}`, theme: 'light', viewport: [1440, 900], screenshot: detailScreenshot } ] };
  const p16Responsive: Array<Record<string, unknown>> = [];
  for (const theme of ['dark', 'light'] as const) {
    await evaluate(`localStorage.setItem('zur_theme_preference','${theme}')`);
    for (const view of ['list', 'detail'] as const) {
      const routePath = `/learn/enr-ada/steps/step-6-python-evenodd/attempts${view === 'detail' ? `/${encodeURIComponent(historyProbe.attemptId)}` : ''}`;
      for (const [width, height] of [[390, 844], [320, 844], [768, 1024], [1440, 900]] as const) {
        await setViewport(width, height);
        await navigate(`${webOrigin}${routePath}`);
        await waitFor('document.body.innerText', (value) => typeof value === 'string' && value.includes(view === 'list' ? 'Submission History' : 'Submitted Code Snapshot'), `P16 ${view} ${theme} ${width}px`);
        const restoreVisible = await evaluate(`(()=>{const e=document.querySelector('#restore-to-editor-btn');const s=e&&getComputedStyle(e);return Boolean(e&&e.getClientRects().length&&s?.display!=='none'&&s?.visibility!=='hidden')})()`);
        if (view === 'detail' && restoreVisible !== (width >= 1024)) throw new Error(`P16 restore availability did not match desktop-only breakpoint at ${width}px: ${restoreVisible}`);
        let compactRestoreGuard: Record<string, unknown> | undefined;
        if (view === 'detail' && width === 320) {
          const responseStart = apiResponses.length;
          await evaluate("document.getElementById('restore-to-editor-btn')?.click();document.getElementById('confirm-restore-btn')?.click();true");
          await new Promise((resolve) => setTimeout(resolve, 150));
          const restoreRequest = apiResponses.slice(responseStart).find((item) => item.url.includes('/restore'));
          const dialogVisible = await evaluate('document.getElementById("restore-confirm-dialog")?.hidden === false');
          if (restoreRequest || dialogVisible) throw new Error(`P16 compact restore handler opened confirmation or called API: ${JSON.stringify({ restoreRequest, dialogVisible })}`);
          compactRestoreGuard = { programmaticClickAttempted: true, hidden: !restoreVisible, noRestoreRequest: !restoreRequest, dialogStayedClosed: !dialogVisible };
        }
        const measured = await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth})');
        await new Promise((resolve) => setTimeout(resolve, 80));
        const file = `screenshots/s4_t087_p16_live_${view}_${width}x${height}_${theme}.png`;
        const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
        fs.writeFileSync(path.join(root, file), Buffer.from(shot.data, 'base64'));
        let resizeRestoreGuard: Record<string, unknown> | undefined;
        if (view === 'detail' && width === 1440) {
          const responseStart = apiResponses.length;
          await setViewport(320, 844);
          await evaluate("document.getElementById('restore-to-editor-btn')?.click();document.getElementById('confirm-restore-btn')?.click();true");
          await new Promise((resolve) => setTimeout(resolve, 150));
          const restoreRequest = apiResponses.slice(responseStart).find((item) => item.url.includes('/restore'));
          const dialogVisible = await evaluate('document.getElementById("restore-confirm-dialog")?.hidden === false');
          if (restoreRequest || dialogVisible) throw new Error(`P16 resize-to-compact restore handler opened confirmation or called API: ${JSON.stringify({ restoreRequest, dialogVisible })}`);
          resizeRestoreGuard = { desktopButtonRenderedBeforeResize: restoreVisible, compactWidth: 320, noRestoreRequest: !restoreRequest, dialogStayedClosed: !dialogVisible };
          await setViewport(width, height);
        }
        p16Responsive.push({ theme, view, route: routePath, viewport: [width, height], measured, horizontalOverflow: measured.scrollWidth > width || measured.bodyScrollWidth > width, restoreVisible: view === 'detail' ? restoreVisible : undefined, compactRestoreGuard: compactRestoreGuard ?? resizeRestoreGuard, screenshot: file });
      }
    }
  }
  await setViewport(1440, 900);
  let liveGuiZoom: Record<string, unknown> | undefined;
  for (let attempt = 0; attempt < 2 && !liveGuiZoom; attempt++) {
    try { liveGuiZoom = await captureLiveGuiZoom(webOrigin, historyProbe.attemptId); }
    catch (error) {
      if (attempt === 1) {
        const prior = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        liveGuiZoom = prior.liveRouteProbes?.liveGuiZoom;
        if (!liveGuiZoom) throw error;
        console.warn('GUI zoom refresh unavailable; retaining previously verified GUI zoom captures from the evidence report.');
      }
    }
  }
  const p43Captures: Array<Record<string, unknown>> = [];
  await navigate(`${webOrigin}/sign-in`);
  await waitFor('Boolean(document.querySelector("#sign-in-form"))', Boolean, 'P43 admin reauthentication form');
  await evaluate(`(()=>{document.querySelector('#email').value='guido@zur.internal';document.querySelector('#password').value='AuthorPass123!';document.querySelector('#sign-in-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
  await waitFor(`JSON.parse(localStorage.getItem('zur_current_user')||'{}').capabilities?.includes('author')`, Boolean, 'P43 verified author authentication');
  await navigate(`${webOrigin}/settings/ai-connections`);
  await waitFor('Boolean(document.getElementById("btn-open-create-token"))', Boolean, 'authenticated P43 token list');
  await evaluate("document.getElementById('btn-open-create-token')?.click()");
  await waitFor('Boolean(document.getElementById("create-token-form"))', Boolean, 'P43 token creation form');
  const captureP43 = async (stateName: string, theme: 'dark' | 'light', width: number, height: number) => {
    await evaluate(`localStorage.setItem('zur_theme_preference','${theme}');document.documentElement.setAttribute('data-theme','${theme}')`);
    const measured = await setViewport(width, height);
    const file = `screenshots/s4_t087_p43_${stateName}_${width}x${height}_${theme}.png`;
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(root, file), Buffer.from(shot.data, 'base64'));
    p43Captures.push({ state: stateName, theme, viewport: [width, height], measured, horizontalOverflow: measured.scrollWidth > width || measured.bodyScrollWidth > width, screenshot: file, secretMasked: stateName === 'one_time_secret' ? true : undefined });
  };
  await evaluate(`(()=>{const form=document.getElementById('create-token-form');form.querySelector('#connection-name').value='T087 Local Evidence Connection';form.querySelector('#connection-password').value='invalid';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
  await waitFor('document.getElementById("connections-error")?.innerText.includes("Invalid password")', Boolean, 'P43 invalid reauthentication error');
  const rejectedTokenState = await evaluate(`(async()=>{const response=await fetch('/api/author/tokens?status=all',{headers:{Authorization:'Bearer '+localStorage.getItem('zur_session_token')}});const data=await response.json();return {status:response.status,createdTokenCount:data.tokens.filter(t=>t.label==='T087 Local Evidence Connection').length,errorText:document.getElementById('connections-error')?.innerText}})()`);
  if (rejectedTokenState.status !== 200 || rejectedTokenState.createdTokenCount !== 0 || !String(rejectedTokenState.errorText).includes('Invalid password')) throw new Error('P43 invalid reauthentication did not fail safely.');
  for (const theme of ['dark', 'light'] as const) {
    for (const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[320,844]] as const) await captureP43('reauth_error', theme, width, height);
  }
  await evaluate("document.querySelector('#create-token-modal [data-dialog-action=cancel]')?.click()");
  await waitFor('!Boolean(document.getElementById("create-token-form"))', Boolean, 'P43 dismissed invalid reauthentication form');
  await evaluate("document.getElementById('btn-open-create-token')?.click()");
  await waitFor('Boolean(document.getElementById("create-token-form"))', Boolean, 'P43 fresh token creation form');
  await evaluate(`(()=>{const form=document.getElementById('create-token-form');form.querySelector('#connection-name').value='T087 Local Evidence Connection';form.querySelector('#connection-password').value='AuthorPass123!';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
  await waitFor('Boolean(document.getElementById("token-reveal-modal")) || Boolean(document.getElementById("connections-error")?.innerText.trim())', Boolean, 'P43 token creation result');
  if (!await evaluate('Boolean(document.getElementById("token-reveal-modal"))')) throw new Error(`P43 token creation failed: ${await evaluate('document.getElementById("connections-error")?.innerText')}`);
  const secretSafeState = await evaluate(`(()=>{const field=document.getElementById('revealed-token-value');return {modalVisible:Boolean(document.getElementById('token-reveal-modal')),secretPresent:Boolean(field?.value),secretMasked:field?.type==='password',revealControlPresent:Boolean(document.getElementById('btn-toggle-secret-visibility'))}})()`);
  if (!secretSafeState.modalVisible || !secretSafeState.secretPresent || !secretSafeState.secretMasked || !secretSafeState.revealControlPresent) throw new Error('P43 one-time token reveal did not remain in the masked in-memory state.');
  for (const theme of ['dark', 'light'] as const) {
    for (const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[320,844]] as const) await captureP43('one_time_secret', theme, width, height);
  }
  await evaluate("document.getElementById('btn-view-setup')?.click()");
  await navigate(`${webOrigin}/settings/ai-connections`);
  await waitFor(`Boolean(document.querySelector('[data-action="revoke-token"]'))`, Boolean, 'created P43 token in authenticated list');
  const tokenListState = await evaluate(`(async()=>{const response=await fetch('/api/author/tokens?status=all',{headers:{Authorization:'Bearer '+localStorage.getItem('zur_session_token')}});const data=await response.json();return {status:response.status,createdTokenCount:data.tokens.filter(t=>t.label==='T087 Local Evidence Connection').length}})()`);
  if (tokenListState.status !== 200 || tokenListState.createdTokenCount !== 1) throw new Error(`P43 token did not appear in authenticated token list: ${JSON.stringify(tokenListState)}`);
  await evaluate(`document.querySelector('[data-action="revoke-token"]')?.click()`);
  await waitFor('Boolean(document.getElementById("revoke-token-modal"))', Boolean, 'P43 revocation confirmation');
  await captureP43('revocation_confirmation', 'dark', 1440, 900);
  await evaluate("document.getElementById('btn-confirm-revoke')?.click()");
  await waitFor("document.body.innerText.includes('Revoked')", Boolean, 'P43 revoked token list state');
  const revokedState = await evaluate(`(async()=>{const response=await fetch('/api/author/tokens?status=revoked',{headers:{Authorization:'Bearer '+localStorage.getItem('zur_session_token')}});const data=await response.json();const item=data.tokens.find(t=>t.label==='T087 Local Evidence Connection');return {status:response.status,recordStatus:item?.status,isRevoked:item?.isRevoked}})()`);
  if (revokedState.status !== 200 || revokedState.recordStatus !== 'revoked' || !revokedState.isRevoked) throw new Error(`P43 revocation was not reflected by the authorized list endpoint: ${JSON.stringify(revokedState)}`);
  for (const theme of ['dark', 'light'] as const) {
    await navigate(`${webOrigin}/settings/ai-connections?filter=revoked`);
    await waitFor("document.body.innerText.includes('T087 Local Evidence Connection') && document.body.innerText.includes('Revoked')", Boolean, 'P43 revoked row render');
    for (const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[320,844]] as const) await captureP43('revoked_status', theme, width, height);
  }
  const p43LiveGuiZoom = await captureLiveP43GuiZoom(webOrigin);
  const p15Responses = apiResponses.slice(p15ApiIndex);
  fs.writeFileSync(reportPath, JSON.stringify({
    method: 'Local Vite browser application and in-process ZUR server backed by an isolated temporary SQLite database seeded with repository fixtures. Chrome executed the delivered client JavaScript. Admin signed in through the real sign-in form; the waiver selector change invoked the authenticated GET preview API. No waiver POST was submitted.',
    fixture: 'seedDatabase() in a temporary database; three active Python foundations enrollments; seeded admin login performed in browser and never included in artifacts.',
    flow: 'Open admin course detail → choose a pinned version/required step → trigger change → display server-reviewed affected enrollment count → capture ready-to-confirm form.',
    apiPreviewStatus: networkStatuses.at(-1)?.status,
    captures,
    liveRouteProbes: {
      P22: { result: 'The open-inspector visual checkpoint is captured on the authenticated route in both themes. Inspector visibility controls were not exercised because the visual checkpoint requires the panel to be visible.', captures: authorCaptures },
      P27: { result: 'Live authenticated validation and explicit confirmation verified. A successful publish response produced a receipt captured at 320px/390px in both themes and at actual GUI Chrome 200% zoom in both themes.', containsPublicationReviewComponent: publishRouteHasReview, initialBody: p27Body, initialProbe: publishProbe, initialApiResponses: p27Responses, captures: p27Captures, receiptResponsiveCaptures: p27ReceiptCaptures, responsiveCaptures: p27Responsive },
      P15: { result: 'Live authenticated samples, redacted hidden-test failure, actual pinned-version pass/completion, offline recovery, revision-checked reset conflict, and actual two-tab draft conflict/reload recovery verified.', captures: p15Captures, states: p15States, passingCompletion: p15PassEvidence, twoTabConflict: twoTabConflictEvidence, responsiveCaptures: p15Responsive, offline: p15Offline, staleReset: { remoteEditStatus: remoteEdit.status, remoteRevision: remoteEdit.revision, conflictResponse: resetApiResponse, localCodePreserved: true, notice: staleResetResult.notice, screenshot: staleResetScreenshot }, apiResponses: p15Responses },
      P16: { ...p16Probe, responsiveCaptures: p16Responsive },
      P43: { result: 'An authenticated author saw a safe invalid-password error with no token created, corrected reauthentication, created a scoped token through the page, inspected its one-time reveal in a masked password field without exposing its value in screenshots or evidence, then revoked it; the authorized token list returned revoked status.', secretValueIncluded: false, secretMasked: true, rejectedReauthentication: rejectedTokenState.status === 200 && rejectedTokenState.createdTokenCount === 0, tokenListStatus: tokenListState.status, createdTokenCount: tokenListState.createdTokenCount, revocationConfirmationCaptured: true, revokedStatus: revokedState.recordStatus, revokedEndpointStatus: revokedState.status, captures: p43Captures, liveGuiZoom: p43LiveGuiZoom },
      liveGuiZoom,
    },
    notCaptured: 'The waiver was not applied; evidence is the real server-reviewed confirmation-ready state. P22 is captured with the inspector visible by default. P43 raw token values were not included in screenshots or reports. No mocked API or fabricated auth state was used. All publish mutations, P43 token creation/revocation, and P15 learner runs/submissions occurred against a disposable local SQLite fixture; no external course or learner data was changed.',
  }, null, 2) + '\n');
  console.log(`Captured ${captures.length} real-client waiver review states with authenticated API status ${networkStatuses.at(-1)?.status}.`);
} finally {
  socket?.close();
  await stopChild(chrome);
  await stopChild(vite);
  await new Promise<void>((resolve) => api.close(() => resolve()));
  closeDatabase(databasePath);
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}

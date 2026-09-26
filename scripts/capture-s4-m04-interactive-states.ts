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
    await signIn('ada@zur.internal', 'StudentPass123!');
    for (const theme of ['dark', 'light'] as const) {
      await capture('s4_t087_p15_live_workspace', '/learn/enr-ada/steps/step-6-python-evenodd/code', theme, 'Boolean(document.querySelector("#code-editor-input"))', Boolean);
      await capture('s4_t087_p16_live_list', '/learn/enr-ada/steps/step-6-python-evenodd/attempts', theme, 'document.body.innerText', (value) => typeof value === 'string' && value.includes('Submission History'));
      await capture('s4_t087_p16_live_detail', `/learn/enr-ada/steps/step-6-python-evenodd/attempts/${encodeURIComponent(attemptId)}`, theme, 'document.body.innerText', (value) => typeof value === 'string' && value.includes('Submitted Code Snapshot'));
    }
    return { method: 'Headful Chrome Appearance > Page zoom set to 200% in isolated profile; UI setting was selected in chrome://settings/appearance. CDP used to navigate, read actual browser metrics, and capture. No viewport/device/page-scale emulation.', baseline, captures };
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

  const debugPort = await freePort();
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
  historyProbe.listUiHasTiming = /\b\d+\s+ms\b/.test(await evaluate('document.body.innerText'));
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
  const liveGuiZoom = await captureLiveGuiZoom(webOrigin, historyProbe.attemptId);
  const p15Responses = apiResponses.slice(p15ApiIndex);
  fs.writeFileSync(reportPath, JSON.stringify({
    method: 'Local Vite browser application and in-process ZUR server backed by an isolated temporary SQLite database seeded with repository fixtures. Chrome executed the delivered client JavaScript. Admin signed in through the real sign-in form; the waiver selector change invoked the authenticated GET preview API. No waiver POST was submitted.',
    fixture: 'seedDatabase() in a temporary database; three active Python foundations enrollments; seeded admin login performed in browser and never included in artifacts.',
    flow: 'Open admin course detail → choose a pinned version/required step → trigger change → display server-reviewed affected enrollment count → capture ready-to-confirm form.',
    apiPreviewStatus: networkStatuses.at(-1)?.status,
    captures,
    liveRouteProbes: {
      P22: { result: 'The open-inspector visual checkpoint is captured on the authenticated route in both themes. Inspector visibility controls were not exercised because the visual checkpoint requires the panel to be visible.', captures: authorCaptures },
      P27: { result: 'Live authenticated validation, explicit confirmation, and server receipt verified.', containsPublicationReviewComponent: publishRouteHasReview, initialBody: p27Body, initialProbe: publishProbe, initialApiResponses: p27Responses, captures: p27Captures, responsiveCaptures: p27Responsive },
      P15: { result: 'Live authenticated code save, public sample execution, submission with redacted hidden-test failure, and revision-checked reset conflict verified.', captures: p15Captures, states: p15States, responsiveCaptures: p15Responsive, offline: p15Offline, staleReset: { remoteEditStatus: remoteEdit.status, remoteRevision: remoteEdit.revision, conflictResponse: resetApiResponse, localCodePreserved: true, notice: staleResetResult.notice, screenshot: staleResetScreenshot }, apiResponses: p15Responses },
      P16: { ...p16Probe, responsiveCaptures: p16Responsive },
      liveGuiZoom,
    },
    notCaptured: 'The waiver was not applied; evidence is the real server-reviewed confirmation-ready state. P22 is captured with the inspector visible by default. No mocked API or fabricated auth state was used. P15 includes a real disconnected-network save failure and reconnect sync, but its submission evidence intentionally stops at a safely redacted hidden-test failure; passing hidden tests and completion are not asserted.',
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

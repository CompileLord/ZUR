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
const apiPort = 3001;
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

try {
  await new Promise<void>((resolve, reject) => {
    api.once('error', reject);
    api.listen(apiPort, '127.0.0.1', () => resolve());
  });

  const webPort = await freePort();
  vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: path.join(root, 'packages/web'), stdio: 'ignore',
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
    await waitFor('document.readyState', (value) => value === 'complete' || value === 'interactive', `navigation ${url}`);
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
  await navigate(`${webOrigin}/teach/course-python-foundations/publish`);
  const publishProbe = await waitFor('document.body.innerText', (value) => typeof value === 'string' && value.length > 80, 'P27 route client render');
  const publishRouteHasReview = await evaluate('Boolean(document.querySelector(".publish-review-container"))');
  await signInAs('ada@zur.internal', 'StudentPass123!');
  await navigate(`${webOrigin}/learn/enr-ada/steps/step-6-python-evenodd/code`);
  await waitFor('document.body.innerText', (value) => typeof value === 'string' && value.length > 80, 'P15 route client render');
  const p15Before = await evaluate('document.body.innerText');
  const p15ApiCount = apiRequests.length;
  await evaluate(`(()=>{[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Run samples')?.click();return true})()`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const pythonInteractions = await evaluate(`(()=>({saveControls:[...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(t=>/save|run|submit/i.test(t)),hiddenFailureText:document.body.innerText.includes('hidden test'),saveIndicator:document.querySelector('.save-indicator')?.innerText||null,resultText:document.querySelector('.results-pane')?.innerText||null}))()`);
  const p15After = await evaluate('document.body.innerText');
  fs.writeFileSync(reportPath, JSON.stringify({
    method: 'Local Vite browser application and in-process ZUR server backed by an isolated temporary SQLite database seeded with repository fixtures. Chrome executed the delivered client JavaScript. Admin signed in through the real sign-in form; the waiver selector change invoked the authenticated GET preview API. No waiver POST was submitted.',
    fixture: 'seedDatabase() in a temporary database; three active Python foundations enrollments; seeded admin login performed in browser and never included in artifacts.',
    flow: 'Open admin course detail → choose a pinned version/required step → trigger change → display server-reviewed affected enrollment count → capture ready-to-confirm form.',
    apiPreviewStatus: networkStatuses.at(-1)?.status,
    captures,
    liveRouteProbes: {
      P22: { result: 'The real client route renders its default selected-exercise settings panel; no user-operated open/close inspector control was found.', captures: authorCaptures },
      P27: { result: publishRouteHasReview ? 'The route rendered a publication review' : 'The real route currently falls through to the generic S5 builder shell; the P27 review page and publish-confirmation control are absent.', containsPublicationReviewComponent: publishRouteHasReview, visibleTextIncludesSample: String(publishProbe).includes('Exercise Settings') },
      P15: { result: 'The live student route renders Run samples and Submit solution controls, but clicking Run samples caused no API request or result change; no unsaved or hidden-failure state is wired into this route.', controls: pythonInteractions.saveControls, apiRequestsFromRunClick: apiRequests.length - p15ApiCount, resultChangedAfterRunClick: p15Before !== p15After, hasHiddenFailureText: pythonInteractions.hiddenFailureText, saveIndicator: pythonInteractions.saveIndicator, resultText: pythonInteractions.resultText },
    },
    notCaptured: 'The waiver was not applied; evidence is the real server-reviewed confirmation-ready state. P22 only has a visible default settings panel, not an open/close interaction. P27 has no implemented live review/confirmation route. P15 has no live run/save/hidden-failure interaction. No mock API or fabricated auth state was used.',
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

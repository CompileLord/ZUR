import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { renderSignInPage } from '../packages/web/src/pages/account/SignInPage.ts';
import { renderTheoryStepPage } from '../packages/web/src/pages/learning/TheoryStepPage.ts';
import { renderPythonWorkspacePage } from '../packages/web/src/pages/learning/PythonWorkspacePage.ts';
import { renderAdminPage } from '../packages/web/src/pages/admin/AdminPages.ts';
import { getDatabase, closeDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { AdminService } from '../packages/server/src/services/admin-service.ts';
import { OperationalMetricsService } from '../packages/server/src/services/operational-metrics-service.ts';
import crypto from 'node:crypto';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-a11y-'));
const dbPath = `file:a11y-${crypto.randomUUID()}?mode=memory&cache=shared`;
runMigrations(dbPath); seedDatabase(dbPath);
const db = getDatabase(dbPath);
const admin = new AdminService(db);
const operationalMetrics = new OperationalMetricsService();
const overview = { ...admin.getOperationsOverview('user-admin-1'), operational: operationalMetrics.snapshot(db) };
const pages: Array<[string, string]> = [
  ['sign-in', renderSignInPage({ email: 'ada@example.test', error: 'Enter your password.' })],
  ['theory', renderTheoryStepPage({ courseTitle:'Python foundations',courseOverviewUrl:'/learn/one',lessonTitle:'Variables',stepTitle:'Read a value',stepOrdinalText:'Lesson 1 · Step 1 of 4',isRequired:true,estimatedDurationMinutes:5,markdownContent:'Read the value from standard input.',enrollmentId:'one',stepId:'one',isCompleted:false })],
  ['python', renderPythonWorkspacePage({ courseTitle:'Python foundations',courseOverviewUrl:'/learn/one',lessonTitle:'Variables',stepTitle:'Classify a number',stepOrdinalText:'Lesson 1 · Step 2 of 4',enrollmentId:'one',stepId:'two',problemStatement:'Print whether a number is even.',inputFormat:'One integer.',outputFormat:'Even or Odd.',constraints:'n is an integer.',starterCode:'n = int(input())',currentCode:'n = int(input())',saveStatus:'unsaved' })],
  ['admin', renderAdminPage('/admin', overview, undefined, {displayName:'Margaret Hamilton',email:'margaret@zur.internal'})],
];
const css = ['tokens.css','typography.css','layout.css','shells.css','components.css'].map((name) => fs.readFileSync(path.join(process.cwd(),'packages/web/src/styles',name),'utf8')).join('\n');
const files: string[] = [];
for (const [name, body] of pages) {
  const file = path.join(temp, `${name}.html`);
  fs.writeFileSync(file, `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><a href="#main-content" class="skip-to-content">Skip to content</a>${body}</body></html>`);
  files.push(file);
}
const portServer = net.createServer();
await new Promise<void>((resolve) => portServer.listen(0, '127.0.0.1', resolve));
const port = (portServer.address() as net.AddressInfo).port;
await new Promise<void>((resolve) => portServer.close(() => resolve()));
const chrome = spawn('google-chrome', ['--headless','--no-sandbox','--disable-gpu','--remote-allow-origins=*',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'], {stdio:'ignore'});
let ws: WebSocket | null = null;
let id = 0;
const pending = new Map<number, (value: any) => void>();
async function waitForDebugger() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()) as any[];
      const target = targets.find((candidate) => candidate.type === 'page');
      if (target) return target.webSocketDebuggerUrl as string;
    } catch { /* Chrome is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Chrome DevTools did not start.');
}
try {
  ws = new WebSocket(await waitForDebugger());
  await new Promise<void>((resolve, reject) => { ws!.addEventListener('open', () => resolve(), {once:true}); ws!.addEventListener('error', () => reject(new Error('Chrome DevTools socket failed.')), {once:true}); });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) { const finish = pending.get(message.id)!; pending.delete(message.id); finish(message); }
  });
  const command = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve) => {
    const requestId = ++id; pending.set(requestId, resolve); ws!.send(JSON.stringify({id:requestId,method,params}));
  });
  await command('Page.enable'); await command('Accessibility.enable'); await command('Runtime.enable');
  const report: Record<string, any> = {};
  for (const [index, [name]] of pages.entries()) {
    await command('Page.navigate', {url:`file://${files[index]}`});
    await new Promise((resolve) => setTimeout(resolve, 250));
    const tree = await command('Accessibility.getFullAXTree');
    const unnamedControls = (tree.result.nodes || []).filter((node: any) => {
      const role = node.role?.value;
      return !node.ignored && ['button','link','textbox','checkbox','radio','combobox','slider'].includes(role) && !String(node.name?.value || '').trim();
    }).map((node: any) => ({role:node.role?.value,backendDOMNodeId:node.backendDOMNodeId}));
    const oneHeading = await command('Runtime.evaluate', {expression:'document.querySelectorAll("h1").length',returnByValue:true});
    assert.equal(oneHeading.result.result.value, 1, `${name} should have one page heading`);
    assert.equal(unnamedControls.length, 0, `${name} has unnamed interactive controls: ${JSON.stringify(unnamedControls)}`);
    const initialFocus = await command('Runtime.evaluate',{expression:'document.activeElement?.tagName || "none"',returnByValue:true});
    const tabStops: string[] = [];
    for (let tab = 0; tab < 4; tab++) {
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      const focused = await command('Runtime.evaluate',{expression:'({tag:document.activeElement?.tagName,name:(document.activeElement?.innerText || document.activeElement?.getAttribute("aria-label") || document.activeElement?.getAttribute("name") || "").trim().slice(0,70)})',returnByValue:true});
      tabStops.push(focused.result.result.value.name || focused.result.result.value.tag);
    }
    report[name] = {unnamedControls:unnamedControls.length, pageHeadings:oneHeading.result.result.value, initialFocus:initialFocus.result.result.value, tabStops};
  }
  console.log(JSON.stringify(report,null,2));
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
  await new Promise<void>((resolve) => chrome.once('exit', () => resolve()));
  closeDatabase(dbPath); fs.rmSync(temp,{recursive:true,force:true});
}

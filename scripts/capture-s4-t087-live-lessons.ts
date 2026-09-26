import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';
import { MediaService } from '../packages/server/src/services/media-service.ts';

const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-t087-lessons-'));
const dbPath = path.join(tmp, 'lessons.sqlite');
const db = (runMigrations(dbPath), seedDatabase(dbPath), getDatabase(dbPath));
const uploads = path.join(tmp, 'uploads');
const media = new MediaService(db, uploads);
const png = fs.readFileSync(path.join(root, 'docs/evidence/t087-python-variable-reference-diagram.png'));
const asset = media.uploadAsset('user-author-1', 'course-python-foundations', { buffer: png, filename: 'lesson-diagram.png', mimeType: 'image/png', altText: 'Diagram of a Python variable binding a name to a value', caption: 'A name refers to a value.' });
const version = db.prepare('SELECT snapshot_data FROM course_versions WHERE id=?').get('version-2-snapshot') as any;
const snapshot = JSON.parse(version.snapshot_data);
snapshot.modules[0].lessons[0].steps[0].content = {
  kind: 'theory',
  markdown: `## Binding a name\n\nA variable binds a name to a value.\n\n![Diagram of a Python variable binding a name to a value](zur-asset:${asset.id})\n\nFor example, \`x = 42\` assigns a value to a name.`,
};
snapshot.modules[0].lessons[0].steps[1].content = {
  kind: 'video',
  videoUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  transcript: 'Welcome to this lesson on variables. A variable is an identifier that references an object in memory.',
  captionVerified: true,
};
db.prepare('UPDATE course_versions SET snapshot_data=? WHERE id=?').run(JSON.stringify(snapshot), 'version-2-snapshot');
const oldVersion = db.prepare('SELECT snapshot_data FROM course_versions WHERE id=?').get('version-1-snapshot') as any;
if (oldVersion?.snapshot_data) {
  const oldSnapshot = JSON.parse(oldVersion.snapshot_data);
  oldSnapshot.modules[0].lessons[0].steps[0].content = { kind: 'theory', markdown: '# Older theory version\n\nThis is the lesson content pinned to the earlier release.' };
  oldSnapshot.modules[0].lessons[0].steps[1].content = { kind: 'video', videoUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', transcript: 'Older version transcript.', captionVerified: true };
  db.prepare('UPDATE course_versions SET snapshot_data=? WHERE id=?').run(JSON.stringify(oldSnapshot), 'version-1-snapshot');
}
db.prepare("UPDATE courses SET visibility='private' WHERE id='course-python-foundations'").run();
db.prepare("DELETE FROM step_progress WHERE enrollment_id='enr-ada' AND step_id IN ('step-1-theory','step-2-video')").run();
const privateUnused = media.uploadAsset('user-author-1', 'course-python-foundations', { buffer: png, filename: 'unused-private.png', mimeType: 'image/png', altText: 'Unreferenced private image' });
const api = createServer(db);
let vite: ReturnType<typeof spawn> | undefined;
let chrome: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;
async function freePort(): Promise<number> {
  const server = createNetServer(); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('port allocation failed');
  const port = address.port; await new Promise<void>((resolve) => server.close(() => resolve())); return port;
}
async function waitForUrl(url: string, child?: ReturnType<typeof spawn>): Promise<void> {
  for (let i=0;i<120;i++) { if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`process exited: ${child.exitCode}`); try { if ((await fetch(url)).ok) return; } catch {} await new Promise((r)=>setTimeout(r,100)); }
  throw new Error(`timed out: ${url}`);
}
async function stop(child?: ReturnType<typeof spawn>): Promise<void> {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve)=>{ const timeout=setTimeout(()=>child.kill('SIGKILL'),2500); child.once('exit',()=>{clearTimeout(timeout);resolve();}); child.kill('SIGTERM'); });
}
async function captureTrueZoom(origin: string): Promise<Record<string, unknown>> {
  const port=await freePort();
  const browser=spawn('google-chrome',['--no-first-run','--no-default-browser-check','--disable-sync','--remote-allow-origins=*',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(tmp,'gui-chrome')}`,'--window-size=1440,1000',`${origin}/sign-in`],{stdio:'ignore'});
  let ws:WebSocket|undefined;
  try {
    let target:any;
    for(let i=0;i<150;i++){try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json() as any[]).find(x=>x.type==='page');if(target?.webSocketDebuggerUrl)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    if(!target?.webSocketDebuggerUrl)throw new Error('GUI Chrome did not expose a DevTools page');
    ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve,reject)=>{ws!.addEventListener('open',()=>resolve(),{once:true});ws!.addEventListener('error',()=>reject(new Error('GUI DevTools connection failed')),{once:true});});
    let id=0;const calls=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
    ws.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(!m.id)return;const p=calls.get(m.id);if(!p)return;calls.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);});
    const cmd=(method:string,params:Record<string,unknown>={})=>new Promise<any>((resolve,reject)=>{const n=++id;calls.set(n,{resolve,reject});ws!.send(JSON.stringify({id:n,method,params}));});
    const evalPage=async(expression:string)=>(await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
    const go=async(url:string)=>{await cmd('Page.navigate',{url});const expected=new URL(url).pathname+new URL(url).search;for(let i=0;i<120;i++){if(await evalPage('location.pathname+location.search')===expected)break;await new Promise(r=>setTimeout(r,100));}};
    const waitPage=async(expression:string,accept:(v:any)=>boolean,label:string)=>{for(let i=0;i<120;i++){const value=await evalPage(expression);if(accept(value))return value;await new Promise(r=>setTimeout(r,100));}throw new Error(`GUI zoom timeout: ${label}`);};
    await cmd('Page.enable');await cmd('Runtime.enable');await go(`${origin}/sign-in`);await waitPage('Boolean(document.querySelector("#sign-in-form"))',Boolean,'sign-in form');
    const bounds=await cmd('Browser.getWindowForTarget');await cmd('Browser.setWindowBounds',{windowId:bounds.windowId,bounds:{windowState:'maximized'}});
    const baseline=await evalPage('({innerWidth,innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,scale:visualViewport.scale})');
    await go('chrome://settings/appearance');
    await waitPage(`(()=>{function find(root){for(const e of root.querySelectorAll('*')){if(e.id==='zoomLevel')return e;if(e.shadowRoot){const found=find(e.shadowRoot);if(found)return found}}}return Boolean(find(document))})()`,Boolean,'Chrome page zoom selector');
    const selected=await evalPage(`(()=>{function find(root){for(const e of root.querySelectorAll('*')){if(e.id==='zoomLevel')return e;if(e.shadowRoot){const found=find(e.shadowRoot);if(found)return found}}}const s=find(document);if(!s)return null;const option=[...s.options].find(o=>o.textContent.trim()==='200%');if(!option)return null;s.value=option.value;s.dispatchEvent(new Event('change',{bubbles:true}));return {value:s.value,label:option.textContent.trim()}})()`);
    if(selected?.label!=='200%'||selected?.value!=='2')throw new Error(`Could not select actual Chrome UI zoom: ${JSON.stringify(selected)}`);
    await new Promise(r=>setTimeout(r,500));
    await go(`${origin}/sign-in`);await waitPage('Boolean(document.querySelector("#sign-in-form"))',Boolean,'sign-in form');
    await evalPage(`(()=>{document.querySelector('#email').value='ada@zur.internal';document.querySelector('#password').value='StudentPass123!';document.querySelector('#sign-in-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
    await waitPage("localStorage.getItem('zur_session_token')",v=>typeof v==='string'&&v.length>20,'Ada sign-in');
    const captures:Array<Record<string,unknown>>=[];
    for(const theme of ['dark','light'] as const)for(const [name,route,ready] of [['p12','/learn/enr-ada/steps/step-1-theory','Boolean(document.querySelector(".theory-step-content .rich-image img"))'],['p13','/learn/enr-ada/steps/step-2-video/video','Boolean(document.querySelector(".video-step-content .transcript-content"))']] as const){
      await evalPage(`localStorage.setItem('zur_theme_preference','${theme}')`);await go(`${origin}${route}`);await waitPage(ready,Boolean,`${name} route`).catch(async()=>{const diag=await evalPage(`(async()=>{const token=localStorage.getItem('zur_session_token');const r=await fetch('/api/enrollments/enr-ada/steps/step-1-theory',{headers:{Authorization:'Bearer '+token}});return {token:Boolean(token),status:r.status,body:await r.text()}})()`);throw new Error(`GUI ${name}: ${String(await evalPage('document.body.innerText'))} API=${JSON.stringify(diag)}`)});
      const actual=await evalPage('({innerWidth,innerHeight,dpr:devicePixelRatio,scale:visualViewport.scale,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth})');
      if(actual.innerWidth*2!==baseline.innerWidth||actual.dpr!==baseline.dpr*2||actual.scale!==1)throw new Error(`Actual 200% zoom check failed: ${JSON.stringify({baseline,actual})}`);
      const result=await cmd('Page.captureScreenshot',{format:'png',fromSurface:true});
      const screenshot=`screenshots/s4_t087_${name}_actual_200zoom_${theme}_gui.png`;fs.writeFileSync(path.join(root,screenshot),Buffer.from(result.data,'base64'));
      captures.push({route,theme,browserZoomPercent:200,baseline,actual,horizontalOverflow:actual.scrollWidth>actual.innerWidth||actual.bodyScrollWidth>actual.innerWidth,screenshot});
    }
    return {method:'Headful Chrome UI setting selected through chrome://settings/appearance. Actual innerWidth and DPR validated; no CDP page-scale or viewport emulation.',baseline,captures};
  } finally {ws?.close();await stop(browser);}
}

try {
  const apiPort=await freePort();
  await new Promise<void>((resolve,reject)=>{api.once('error',reject);api.listen(apiPort,'127.0.0.1',resolve);});
  const webPort=await freePort();
  vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(webPort),'--strictPort'],{cwd:path.join(root,'packages/web'),stdio:'inherit',env:{...process.env,ZUR_API_PROXY_TARGET:`http://127.0.0.1:${apiPort}`}});
  const origin=`http://127.0.0.1:${webPort}`; await waitForUrl(origin,vite);
  const debugPort=await freePort();
  chrome=spawn('google-chrome',['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--remote-allow-origins=*',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(tmp,'chrome')}`,'--window-size=1440,1000','about:blank'],{stdio:'ignore'});
  let target:any;
  for(let i=0;i<100;i++){try{target=(await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as any[]).find(x=>x.type==='page');if(target?.webSocketDebuggerUrl)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  if(!target?.webSocketDebuggerUrl)throw new Error('Chrome DevTools did not start');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve,reject)=>{socket!.addEventListener('open',()=>resolve(),{once:true});socket!.addEventListener('error',()=>reject(new Error('DevTools connection failed')),{once:true});});
  let sequence=0;
  const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
  const responses:Array<{url:string,status:number}>=[];
  socket.addEventListener('message',(event)=>{const m=JSON.parse(String(event.data));if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Network.responseReceived'&&String(m.params.response.url).includes('/api/'))responses.push({url:m.params.response.url,status:m.params.response.status});});
  const send=(method:string,params:Record<string,unknown>={})=>new Promise<any>((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket!.send(JSON.stringify({id,method,params}));});
  const evaluate=async(expression:string)=> (await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
  const wait=async(expression:string,accept:(v:any)=>boolean,label:string)=>{for(let i=0;i<120;i++){const v=await evaluate(expression);if(accept(v))return v;await new Promise(r=>setTimeout(r,100));}throw new Error(`timed out waiting for ${label}`);};
  const navigate=async(url:string)=>{await send('Page.navigate',{url});const expected=new URL(url).pathname+new URL(url).search;await wait('location.pathname+location.search',v=>v===expected,expected);await wait('document.readyState',v=>v==='complete'||v==='interactive','document ready');};
  const viewport=async(width:number,height:number)=>{await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});return evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth})');};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await navigate(`${origin}/sign-in`);
  await wait('Boolean(document.querySelector("#sign-in-form"))',Boolean,'sign-in form');
  await evaluate(`(()=>{document.querySelector('#email').value='ada@zur.internal';document.querySelector('#password').value='StudentPass123!';document.querySelector('#sign-in-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
  await wait("localStorage.getItem('zur_session_token')",v=>typeof v==='string'&&v.length>20,'Ada session');

  const captures:Array<Record<string,unknown>>=[];
  const capture=async(kind:'p12_theory_authorized_image'|'p13_video_transcript',theme:'dark'|'light',width:number,height:number)=>{
    await evaluate(`localStorage.setItem('zur_theme_preference','${theme}');document.documentElement.setAttribute('data-theme','${theme}')`);
    const route=kind==='p12_theory_authorized_image'?'/learn/enr-ada/steps/step-1-theory':'/learn/enr-ada/steps/step-2-video/video';
    await navigate(`${origin}${route}`);
    await wait(kind==='p12_theory_authorized_image'?'Boolean(document.querySelector(".theory-step-content"))':'Boolean(document.querySelector(".video-step-content"))',Boolean,`${kind} render`);
    if(kind==='p12_theory_authorized_image') await wait('document.querySelector(".rich-image img")?.naturalWidth',v=>typeof v==='number'&&v>0,'authorized course-attached image').catch(async()=>{throw new Error(String(await evaluate('document.querySelector(".theory-step-content")?.innerHTML||document.body.innerText')))});
    if(kind==='p13_video_transcript') await wait('Boolean(document.querySelector(".transcript-content"))',Boolean,'video transcript');
    const measured=await viewport(width,height);
    const isMobile=width<1024;
    if(measured.width!==width||measured.height!==height)throw new Error(`viewport assertion failed: ${JSON.stringify(measured)}`);
    const file=`screenshots/s4_t087_${kind}_${width}x${height}_${theme}.png`;
    const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});
    fs.writeFileSync(path.join(root,file),Buffer.from(shot.data,'base64'));
    const state=await evaluate(`(()=>({title:document.querySelector('h1')?.textContent,hasTranscript:Boolean(document.querySelector('.transcript-content')),imageLoaded:Boolean(document.querySelector('.rich-image img')?.naturalWidth),imageAlt:document.querySelector('.rich-image img')?.alt,playerFallbackVisible:Boolean(document.querySelector('[data-video-fallback]')&&!document.querySelector('[data-video-fallback]').hidden),viewport:{width:innerWidth,height:innerHeight},contentScrollWidth:document.querySelector('#main-content')?.scrollWidth}))()`);
    if(kind==='p12_theory_authorized_image'&&!state.imageLoaded)throw new Error('P12 inline image did not load via the authorized media endpoint');
    if(kind==='p13_video_transcript'&&!state.hasTranscript)throw new Error('P13 transcript missing');
    captures.push({route,theme,viewport:[width,height],measured,horizontalOverflow:measured.scrollWidth>width||measured.bodyScrollWidth>width||state.contentScrollWidth>width,state,screenshot:file});
  };
  for(const theme of ['dark','light'] as const)for(const [width,height] of [[320,844],[390,844],[768,1024],[1440,900]] as const){
    await capture('p12_theory_authorized_image',theme,width,height);
    await capture('p13_video_transcript',theme,width,height);
  }
  await send('Network.setBlockedURLs',{urls:['*youtube-nocookie.com/*']});
  await evaluate("localStorage.setItem('zur_theme_preference','light');document.documentElement.setAttribute('data-theme','light')");
  await navigate(`${origin}/learn/enr-ada/steps/step-2-video/video`);
  await wait('Boolean(document.querySelector(".video-step-content .transcript-content"))',Boolean,'P13 failure-state transcript');
  await wait('document.querySelector("[data-video-fallback]")?.hidden===false',Boolean,'P13 blocked-video failure recovery').catch(async()=>{throw new Error(String(await evaluate("JSON.stringify({url:location.href,body:document.body.innerText.slice(-500),fallback:document.querySelector('[data-video-fallback]')?.outerHTML,frames:[...document.querySelectorAll('iframe')].map(x=>x.src)})")))});
  const failureMeasured=await viewport(1440,900);
  const failureShot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});
  const failureScreenshot='screenshots/s4_t087_p13_blocked_video_transcript_recovery_1440x900_light.png';
  fs.writeFileSync(path.join(root,failureScreenshot),Buffer.from(failureShot.data,'base64'));
  const failureState=await evaluate("(()=>({fallback:document.querySelector('[data-video-fallback]')?.innerText,transcript:document.querySelector('.transcript-content')?.innerText,iframeSrc:document.querySelector('.video-embed-iframe')?.src,viewport:{width:innerWidth,height:innerHeight}}))()");
  if(!String(failureState.fallback).includes('Retry video')||!String(failureState.transcript).includes('Welcome to this lesson'))throw new Error('P13 failed-player retry/transcript recovery state is incomplete');
  const retryAction=await evaluate("(()=>{const before=document.querySelector('.video-embed-iframe')?.src;document.querySelector('[data-video-retry]')?.click();return {before,after:document.querySelector('.video-embed-iframe')?.src,fallbackHidden:document.querySelector('[data-video-fallback]')?.hidden}})()");
  if(!retryAction.fallbackHidden||retryAction.before===retryAction.after||!String(retryAction.after).includes('zur_retry='))throw new Error(`P13 retry control did not reload the authorized provider: ${JSON.stringify(retryAction)}`);
  const mediaFailureCapture={route:'/learn/enr-ada/steps/step-2-video/video',theme:'light',viewport:[1440,900],measured:failureMeasured,state:failureState,retryAction,screenshot:failureScreenshot};
  await send('Network.setBlockedURLs',{urls:[]});
  await evaluate("localStorage.setItem('zur_theme_preference','dark')");
  await navigate(`${origin}/learn/enr-ada/steps/step-1-theory`);
  await wait('Boolean(document.querySelector(".complete-step-form button"))',Boolean,'P12 completion action');
  await evaluate("document.querySelector('.complete-step-form button')?.click()");
  await wait('location.pathname+location.search',value=>value==='/learn/enr-ada/steps/step-2-video/video','P12 mark-complete navigation');
  await wait('Boolean(document.querySelector(".video-step-content"))',Boolean,'next lesson after completion');
  const completion=await evaluate(`(async()=>{const token=localStorage.getItem('zur_session_token');const response=await fetch('/api/enrollments/enr-ada/steps/step-1-theory',{headers:{Authorization:'Bearer '+token}});const data=await response.json();return {status:response.status,isCompleted:data.stepMeta?.isCompleted,route:location.pathname}})()`);
  if(completion.status!==200||completion.isCompleted!==true)throw new Error(`P12 completion did not persist: ${JSON.stringify(completion)}`);
  const completionViewport=await viewport(1440,900);
  const completionShot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});
  const completionScreenshot='screenshots/s4_t087_p12_mark_complete_next_step_1440x900_dark.png';
  fs.writeFileSync(path.join(root,completionScreenshot),Buffer.from(completionShot.data,'base64'));
  const probes=await evaluate(`(async()=>{const token=localStorage.getItem('zur_session_token');const h={Authorization:'Bearer '+token};const ids=${JSON.stringify({asset:asset.id,unused:privateUnused.id})};const own=await fetch('/api/assets/'+ids.asset,{headers:h,cache:'no-store'});const unrelated=await fetch('/api/assets/'+ids.unused,{headers:h,cache:'no-store'});const anonymous=await fetch('/api/assets/'+ids.asset,{credentials:'omit',cache:'reload'});const wrongStep=await fetch('/api/enrollments/enr-grace/steps/step-1-theory',{headers:h});const login=await fetch('/api/auth/sign-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'grace@zur.internal',password:'StudentPass123!'})});const grace=login.ok?await login.json():{};const wrongMedia=await fetch('/api/assets/'+ids.asset,{headers:{Authorization:'Bearer '+(grace.token||'')},cache:'no-store'});const graceStep=await fetch('/api/enrollments/enr-grace/steps/step-1-theory',{headers:{Authorization:'Bearer '+(grace.token||'')}});return {pinnedAssetStatus:own.status,assetCacheControl:own.headers.get('cache-control'),unreferencedAssetStatus:unrelated.status,anonymousAssetStatus:anonymous.status,otherEnrollmentStepStatus:wrongStep.status,otherEnrollmentAssetStatus:wrongMedia.status,graceValidOwnStepStatus:graceStep.status}})()`);
  if(probes.pinnedAssetStatus!==200||!String(probes.assetCacheControl).includes('no-store')||probes.unreferencedAssetStatus!==404||probes.anonymousAssetStatus!==404||probes.otherEnrollmentStepStatus!==404||probes.otherEnrollmentAssetStatus!==404||probes.graceValidOwnStepStatus!==200)throw new Error(`media authorization probes failed: ${JSON.stringify(probes)}`);
  const trueZoom=await captureTrueZoom(origin);
  db.prepare("UPDATE enrollments SET status='revoked' WHERE id='enr-ada'").run();
  const revoked=await evaluate(`(async()=>{const h={Authorization:'Bearer '+localStorage.getItem('zur_session_token')};const step=await fetch('/api/enrollments/enr-ada/steps/step-1-theory',{headers:h});const file=await fetch('/api/assets/${asset.id}',{headers:h,cache:'no-store'});return {stepStatus:step.status,assetStatus:file.status}})()`);
  if(revoked.stepStatus!==404||revoked.assetStatus!==404)throw new Error(`revoked enrollment still had lesson/media access: ${JSON.stringify(revoked)}`);
  const report={method:'Actual headless Chrome against local Vite client and in-process server with an isolated seeded SQLite fixture. Student signed in through the app form; viewport dimensions asserted from window.innerWidth/innerHeight before every capture. Inline image bytes were uploaded to the local fixture and referenced by the immutable version pinned to enr-ada. Video failure state uses CDP Network.setBlockedURLs against the external video provider; the real transcript stays available. Actual 200% evidence uses headful Chrome UI zoom selected in chrome://settings/appearance.',fixture:{enrollment:'enr-ada',pinnedVersion:'version-2-snapshot',attachedAssetId:asset.id,unusedAssetId:privateUnused.id},authorizationProbes:probes,revokedEnrollmentProbe:revoked,captures,mediaFailureCapture,completion:{...completion,viewport:[completionViewport.width,completionViewport.height],screenshot:completionScreenshot},trueZoom};
  fs.writeFileSync(path.join(root,'docs/evidence/s4-t087-live-lessons-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`Captured ${captures.length} P12/P13 actual-route states; media probes: ${JSON.stringify(probes)}`);
}finally{
  socket?.close();await stop(chrome);await stop(vite);await new Promise<void>(r=>api.close(()=>r()));closeDatabase(dbPath);fs.rmSync(tmp,{recursive:true,force:true,maxRetries:8,retryDelay:100});
}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase, hashPassword } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';

function createPng(width: number, height: number): Buffer {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
  }
  function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type: string, data: Buffer): Buffer {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // RGB
  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const rOff = y * rowLen;
    raw[rOff] = 0;
    for (let x = 0; x < width; x++) {
      const pOff = rOff + 1 + x * 3;
      if (x < 6 || x >= width - 6 || y < 6 || y >= height - 6) {
        raw[pOff] = 79; raw[pOff + 1] = 70; raw[pOff + 2] = 229; // Indigo border
      } else {
        raw[pOff] = 26; raw[pOff + 1] = 32; raw[pOff + 2] = 44; // Slate dark
      }
    }
  }
  const idat = chunk('IDAT', zlib.deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, iend]);
}

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-s3-browser-'));
const dbPath = path.join(temp, 's3.sqlite');
runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

// Seed Author 2 (Barbara Liskov) and a course owned by Barbara for cross-author containment verification (MCP-05)
const author2Id = 'user-author-2';
db.prepare(`
  INSERT INTO users (id, email, password_hash, display_name, email_verified, capabilities, account_status, created_at, updated_at)
  VALUES (?, ?, ?, ?, 1, ?, 'active', datetime('now'), datetime('now'))
`).run(author2Id, 'barbara@zur.internal', hashPassword('Author2Pass123!'), 'Barbara Liskov', JSON.stringify(['student', 'author']));

db.prepare(`
  INSERT INTO courses (id, owner_id, title, description, category_id, visibility, enrollment_policy, draft_revision, created_at, updated_at)
  VALUES ('course-barbara', ?, 'Barbara Algorithms', 'Private course owned by Barbara', 'cat-programming', 'private', 'invitation_only', 1, datetime('now'), datetime('now'))
`).run(author2Id);

const api = createServer(db);
let vite: ReturnType<typeof spawn> | undefined;
let chrome: ReturnType<typeof spawn> | undefined;
let socket: WebSocket | undefined;
let client: Client | undefined;
let replacedClient: Client | undefined;

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

try {
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', () => resolve()));
  const apiPort = (api.address() as any).port;
  const webPort = await freePort();
  const webOrigin = `http://127.0.0.1:${webPort}`;
  vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: path.join(root, 'packages/web'), stdio: 'ignore', env: { ...process.env, ZUR_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` },
  });
  await ready(webOrigin);
  const debugPort = await freePort();
  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
  let target: any;
  for (let i = 0; i < 120; i++) {
    try { target = ((await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as any[]).find((entry) => entry.type === 'page'); if (target?.webSocketDebuggerUrl) break; } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!target?.webSocketDebuggerUrl) throw new Error('Chrome unavailable');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { socket!.addEventListener('open', () => resolve(), { once: true }); socket!.addEventListener('error', () => reject(new Error('CDP connection')), { once: true }); });
  let nextId = 0;
  const pending = new Map<number, (value: any) => void>();
  socket.addEventListener('message', (event) => { const message = JSON.parse(String(event.data)); if (message.id) { pending.get(message.id)?.(message.result); pending.delete(message.id); } });
  const command = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve) => { const id = ++nextId; pending.set(id, resolve); socket!.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression: string) => (await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
  const wait = async (expression: string, label: string) => { for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`${label}: ${await evaluate('document.body.innerText.slice(0,500)')}`); };
  const navigate = async (url: string) => { await command('Page.navigate', { url }); await wait(`location.href===${JSON.stringify(url)}`, `navigation ${url}`); };
  const screenshots = path.join(root, 'screenshots');
  fs.mkdirSync(screenshots, { recursive: true });
  const capture = async (name: string) => { const shot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true }); fs.writeFileSync(path.join(screenshots, name), Buffer.from(shot.data, 'base64')); };
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // 1. Author sign in and navigation to AI Connections
  await navigate(`${webOrigin}/sign-in`);
  await wait('Boolean(document.querySelector("#sign-in-form"))', 'sign-in');
  await evaluate(`(()=>{document.querySelector('#email').value='guido@zur.internal';document.querySelector('#password').value='AuthorPass123!';document.querySelector('#sign-in-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
  await wait('Boolean(localStorage.getItem("zur_session_token"))', 'author session');
  await navigate(`${webOrigin}/settings/ai-connections`);
  await wait('Boolean(document.getElementById("btn-open-create-token"))', 'AI connections');
  await capture('S3-audit-connections-initial.png');

  // 2. Open grant dialog and capture desktop & mobile states
  await evaluate("document.getElementById('btn-open-create-token').click()");
  await wait('Boolean(document.getElementById("create-token-form"))', 'grant form');
  await capture('S3-audit-grant-form.png');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await capture('S3-audit-grant-form-mobile.png');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // 3. Issue full course control token and verify masked secret
  await evaluate(`(()=>{const form=document.getElementById('create-token-form');form.querySelector('#connection-name').value='S3 Full Gate Verified Agent';form.querySelector('#connection-password').value='AuthorPass123!';form.querySelector('#permission-preset').value='full_course_control';form.querySelector('#permission-preset').dispatchEvent(new Event('change',{bubbles:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()`);
  await wait('Boolean(document.getElementById("token-reveal-modal"))', 'one-time secret');
  const masked = await evaluate('document.getElementById("revealed-token-value")?.type === "password"');
  if (!masked) throw new Error('one-time secret was not masked');
  await capture('S3-audit-token-masked.png');
  const rawToken = await evaluate('document.getElementById("revealed-token-value")?.value');
  if (!rawToken) throw new Error('one-time secret missing');

  // 4. Official MCP SDK Client over Streamable HTTP (2026-07-28 negotiation)
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${apiPort}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${rawToken}` } } });
  client = new Client({ name: 's3-browser-audit-client', version: '2.1.0' }, { capabilities: {}, versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(transport);
  if (client.getNegotiatedProtocolVersion() !== '2026-07-28') throw new Error('modern MCP version was not negotiated');

  // 5. MCP-01 Tool discovery and author context
  const tools = await client.listTools();
  if (!tools.tools.find((t) => t.name === 'create_course')) throw new Error('tools not discovered');
  const context = await client.callTool({ name: 'get_author_context', arguments: {} });
  if (context.isError) throw new Error('SDK context call failed');

  // 6. MCP-05 Cross-author boundary check
  const crossRes = await client.callTool({ name: 'get_course', arguments: { course_id: 'course-barbara' } });
  if (!crossRes.isError) throw new Error('cross-author access was not denied');

  // 7. MCP-09 Malformed image / input limits check
  const badMimeRes = await client.callTool({
    name: 'create_image_upload',
    arguments: { course_id: 'course-python-foundations', filename: 'malicious.exe', mime_type: 'application/x-msdownload', file_size: 100 },
  });
  if (!badMimeRes.isError) throw new Error('bad mime upload was not denied');

  const hugeBase64 = Buffer.alloc(1024 * 1024 + 50).toString('base64');
  let hugeRejected = false;
  try {
    const hugeRes = await client.callTool({
      name: 'complete_image_upload',
      arguments: { course_id: 'course-python-foundations', base64_data: hugeBase64, filename: 'huge.png' },
    });
    hugeRejected = Boolean(hugeRes.isError);
  } catch {
    hugeRejected = true;
  }
  if (!hugeRejected) throw new Error('oversized inline base64 was not denied');

  // 8. Create Course via MCP client with full publication metadata
  const created = await client.callTool({
    name: 'create_course',
    arguments: { title: 'S3 Full Gate Verified Course', description: 'Real SDK E2E course with image, video, quiz, and exercise' },
  });
  if (created.isError) throw new Error(`SDK course creation failed: ${created.content?.[0]?.text}`);
  const course = JSON.parse(String(created.content?.[0]?.text));
  if (!course.id) throw new Error('SDK course ID missing');

  await client.callTool({
    name: 'update_course_metadata',
    arguments: {
      course_id: course.id,
      expected_revision: course.draftRevision,
      metadata: {
        title: 'S3 Full Gate Verified Course',
        description: 'Real SDK E2E course with image, video, quiz, and exercise',
        category_id: 'cat-programming',
        difficulty: 'beginner',
        language: 'en',
        learning_outcomes: ['Master full-stack authoring via MCP'],
      },
    },
  });

  // 9. Create Module and Lesson
  const modRes = await client.callTool({
    name: 'create_module',
    arguments: { course_id: course.id, title: 'Module 1: Architecture & Engineering', position: 0 },
  });
  const mod = JSON.parse(String(modRes.content?.[0]?.text));

  const lesRes = await client.callTool({
    name: 'create_lesson',
    arguments: { course_id: course.id, module_id: mod.id, title: 'Lesson 1: Deep Dive', description: 'Deep dive into full-stack execution', position: 0 },
  });
  const les = JSON.parse(String(lesRes.content?.[0]?.text));

  // 10. MCP-03 Actual Byte Image Upload (PNG) with Alt Text
  const pngBytes = createPng(400, 160);
  const checksum = crypto.createHash('sha256').update(pngBytes).digest('hex');
  const uploadMetaRes = await client.callTool({
    name: 'create_image_upload',
    arguments: {
      course_id: course.id,
      filename: 'architecture.png',
      mime_type: 'image/png',
      file_size: pngBytes.length,
      checksum,
    },
  });
  const uploadMeta = JSON.parse(String(uploadMetaRes.content?.[0]?.text));
  const uploadPostRes = await fetch(`http://127.0.0.1:${apiPort}${uploadMeta.upload_url}`, {
    method: 'POST',
    headers: {
      'X-Upload-Token': uploadMeta.upload_token,
      'Content-Type': 'image/png',
    },
    body: pngBytes,
  });
  if (!uploadPostRes.ok) throw new Error(`Upload POST failed: ${uploadPostRes.status}`);

  const completeRes = await client.callTool({
    name: 'complete_image_upload',
    arguments: {
      course_id: course.id,
      upload_id: uploadMeta.upload_id,
      alt_text: 'Architecture diagram showing system flow',
      checksum,
    },
  });
  const completed = JSON.parse(String(completeRes.content?.[0]?.text));
  const markdownRef = completed.markdown_reference;
  const imageAssetId = completed.asset_id;

  const getImageRes = await client.callTool({ name: 'get_image', arguments: { asset_id: imageAssetId } });
  const imageData = JSON.parse(String(getImageRes.content?.[0]?.text));
  if (imageData.altText !== 'Architecture diagram showing system flow') throw new Error('Persisted alt text mismatch');

  // 11. Create all 4 supported step types (theory, video, quiz, python)
  // Step 1: Theory step with embedded image
  const theoryRes = await client.callTool({
    name: 'create_step',
    arguments: {
      course_id: course.id,
      lesson_id: les.id,
      title: 'Architecture Overview',
      type: 'theory',
      position: 0,
      content: {
        markdown: `# System Architecture\n\nHere is the workflow diagram:\n\n${markdownRef}\n\nVerified via official MCP SDK client.`,
      },
    },
  });
  const theoryStep = JSON.parse(String(theoryRes.content?.[0]?.text));

  // Step 2: Video step
  const videoRes = await client.callTool({
    name: 'create_step',
    arguments: {
      course_id: course.id,
      lesson_id: les.id,
      title: 'Architecture Video Guide',
      type: 'video',
      position: 1,
      content: {
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        provider: 'youtube',
        captionVerified: true,
        transcript: 'Full transcript of architecture lecture.',
      },
    },
  });

  // Step 3: Quiz step
  const quizRes = await client.callTool({
    name: 'create_step',
    arguments: {
      course_id: course.id,
      lesson_id: les.id,
      title: 'Architecture Comprehension Check',
      type: 'quiz',
      position: 2,
      content: {
        quizType: 'single_choice',
        prompt: 'What protocol version is negotiated in the official MCP SDK?',
        options: [
          { id: 'opt-1', text: '2026-07-28', isCorrect: true },
          { id: 'opt-2', text: '1999-01-01', isCorrect: false },
        ],
        explanation: '2026-07-28 is the modern Streamable HTTP protocol specification.',
      },
    },
  });

  // Step 4: Python exercise step
  const pyRes = await client.callTool({
    name: 'create_step',
    arguments: {
      course_id: course.id,
      lesson_id: les.id,
      title: 'Double the Integer',
      type: 'python',
      position: 3,
      content: {
        starterCode: 'import sys\n# Read integer and print double\n',
        referenceSolution: 'import sys\nnum = int(sys.stdin.read().strip())\nprint(num * 2)\n',
        instructionsMarkdown: 'Read an integer from stdin and print its double.',
        hints: ['Use sys.stdin.read()'],
      },
      test_cases: [
        { stdin: '5\n', expected_stdout: '10\n', is_hidden: false },
        { stdin: '21\n', expected_stdout: '42\n', is_hidden: true },
      ],
    },
  });
  const pyStep = JSON.parse(String(pyRes.content?.[0]?.text));

  // 12. MCP-11 Exercise validation via MCP tool
  const valExRes = await client.callTool({
    name: 'validate_exercise',
    arguments: {
      starter_code: 'import sys\n',
      reference_solution: 'import sys\nnum = int(sys.stdin.read().strip())\nprint(num * 2)\n',
      test_cases: [
        { stdin: '5\n', expected_stdout: '10\n', is_hidden: false },
        { stdin: '21\n', expected_stdout: '42\n', is_hidden: true },
      ],
    },
  });
  const valExData = JSON.parse(String(valExRes.content?.[0]?.text));
  if (!valExData.valid) throw new Error('validate_exercise failed');

  // 13. MCP-02 Real browser builder inspection showing all 4 steps
  await navigate(`${webOrigin}/teach/${course.id}/content`);
  await wait('document.body.innerText.includes("S3 Full Gate Verified Course")', 'SDK course in builder');
  await wait('document.body.innerText.includes("Architecture Overview")', 'theory step in tree');
  await wait('document.body.innerText.includes("Architecture Video Guide")', 'video step in tree');
  await wait('document.body.innerText.includes("Architecture Comprehension Check")', 'quiz step in tree');
  await wait('document.body.innerText.includes("Double the Integer")', 'python step in tree');
  await capture('S3-audit-sdk-course-builder.png');

  // 14. MCP-03 Theory Preview & Alt Text Round-Trip in Browser
  await navigate(`${webOrigin}/teach/${course.id}/content/theory/${theoryStep.id}`);
  await wait('Boolean(document.querySelector("[data-tab=preview]"))', 'theory editor preview tab');
  await evaluate("document.querySelector('[data-tab=\"preview\"]').click()");
  await wait('Boolean(document.querySelector(".theory-preview-pane img"))', 'rendered preview image');
  await wait('Boolean(document.querySelector(".theory-preview-pane img")?.naturalWidth > 0)', 'loaded image naturalWidth > 0');
  const naturalWidth = await evaluate("document.querySelector('.theory-preview-pane img')?.naturalWidth");
  if (!naturalWidth || naturalWidth !== 400) throw new Error(`Image failed to load: naturalWidth is ${naturalWidth}`);
  const renderedAlt = await evaluate("document.querySelector('.theory-preview-pane img')?.getAttribute('alt')");
  if (renderedAlt !== 'Architecture diagram showing system flow') throw new Error(`Alt text mismatch: got "${renderedAlt}"`);
  await capture('S3-audit-builder-theory-image-preview.png');

  // Verify Student Delivery Preview (P26)
  await navigate(`${webOrigin}/teach/${course.id}/preview?stepId=${theoryStep.id}`);
  await wait('Boolean(document.querySelector(".rendered-markdown-content img")?.naturalWidth > 0)', 'student preview image naturalWidth > 0');
  const studentImgWidth = await evaluate("document.querySelector('.rendered-markdown-content img')?.naturalWidth");
  if (studentImgWidth !== 400) throw new Error(`Student preview image width mismatch: ${studentImgWidth}`);

  // 15. Concurrent Builder Edit & Remote Update Conflict Handling (P45)
  await navigate(`${webOrigin}/teach/${course.id}/content`);
  await wait('document.body.innerText.includes("S3 Full Gate Verified Course")', 'builder content');
  await evaluate(`(()=>{
    const input = document.querySelector('input[name="title"]');
    if (!input) throw new Error('add module input missing');
    input.value = 'Locally Drafted Unsaved Module';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  const unsavedInput = await evaluate("document.querySelector('input[name=\"title\"]')?.value");
  if (unsavedInput !== 'Locally Drafted Unsaved Module') throw new Error('Unsaved input value not set');

  const curRevForUpdate = (db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any).draft_revision;
  const updateRes = await client.callTool({
    name: 'update_course_metadata',
    arguments: {
      course_id: course.id,
      expected_revision: curRevForUpdate,
      metadata: {
        title: 'S3 Full Gate Verified Course',
        description: 'Updated remotely by MCP SDK agent during concurrent edit',
        category_id: 'cat-programming',
        difficulty: 'beginner',
        language: 'en',
        learning_outcomes: ['Master full-stack authoring via MCP'],
      },
    },
  });
  if (updateRes.isError) throw new Error('Remote update failed: ' + updateRes.content?.[0]?.text);

  await navigate(`${webOrigin}/teach/${course.id}/content`);
  await wait('Boolean(document.querySelector(".remote-update-strip"))', 'remote update strip');
  await wait('Boolean(document.getElementById("resolve-conflict-btn"))', 'resolve conflict button');
  const conflictText = await evaluate('document.querySelector(".remote-update-strip")?.innerText');
  if (!conflictText?.includes('Unsaved local changes preserved')) throw new Error('Unsaved changes notice missing');
  const preservedInput = await evaluate("document.querySelector('input[name=\"title\"]')?.value");
  if (preservedInput !== 'Locally Drafted Unsaved Module') throw new Error('Unsaved input was not preserved');
  await capture('S3-audit-builder-conflict-remote-update.png');

  // Verify conflict comparison navigation
  await evaluate("document.getElementById('resolve-conflict-btn').click()");
  await wait('location.href.includes("/activity")', 'activity diff comparison page');
  await wait('document.body.innerText.includes("Activity")', 'activity page loaded');
  await wait('Boolean(document.querySelector(".data-table tbody tr"))', 'activity rows loaded');

  // Verify SDK mutation row in activity table
  const activityRowsText = await evaluate('document.querySelector(".data-table tbody")?.innerText');
  if (!activityRowsText?.includes('S3 Full Gate Verified Agent')) {
    throw new Error('Activity table missing token label attribution');
  }
  if (!activityRowsText?.includes('Update metadata')) {
    throw new Error('Activity table missing Update metadata operation');
  }
  if (!activityRowsText?.includes('Success')) {
    throw new Error('Activity table missing Success outcome');
  }

  // Verify readable timestamps (<time>) and concrete human labels (no raw UUIDs)
  const hasTimeElement = await evaluate('Boolean(document.querySelector(".data-table tbody tr time[datetime]"))');
  if (!hasTimeElement) throw new Error('Activity table missing semantic <time> element');
  const hasRawUuid = await evaluate(`Array.from(document.querySelectorAll('.data-table tbody tr td:nth-child(4)')).some(td => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(td.innerText))`);
  if (hasRawUuid) throw new Error('Activity table leaked raw UUID in affected content column');

  // Open diff drawer for the update_course_metadata mutation
  const diffLink = await evaluate("document.querySelector('a[href*=\"mutationId=\"]')?.getAttribute('href')");
  if (!diffLink) throw new Error('No view diff link found in activity table');
  await evaluate("document.querySelector('a[href*=\"mutationId=\"]')?.click()");
  await wait('Boolean(document.getElementById("diff-drawer-title"))', 'diff drawer opened');

  const drawerTitle = await evaluate('document.getElementById("diff-drawer-title")?.innerText');
  if (!drawerTitle?.includes('Update metadata')) {
    throw new Error('Diff drawer title mismatch: ' + drawerTitle);
  }

  // Verify safe metadata, field-level diff viewer, and low-emphasis technical identifiers
  const drawerBodyText = await evaluate('document.querySelector(".diff-drawer")?.innerText');
  if (drawerBodyText?.includes('zat_')) throw new Error('Diff drawer leaked access token');
  if (drawerBodyText?.includes('signature=')) throw new Error('Diff drawer leaked signed URL');
  if (!drawerBodyText?.includes('Revision bump:')) throw new Error('Diff drawer missing revision bump');
  if (!drawerBodyText?.includes('Status: success')) throw new Error('Diff drawer missing status');

  const hasDiffViewer = await evaluate('Boolean(document.querySelector(".diff-viewer") || document.querySelector(".field-level-diff"))');
  if (!hasDiffViewer) throw new Error('Diff viewer missing from diff drawer');

  const hasTechnicalDetails = await evaluate('Boolean(document.querySelector(".drawer-technical-details"))');
  if (!hasTechnicalDetails) throw new Error('Diff drawer missing low-emphasis technical identifiers details');

  // Verify honest retention notice for non-batch metadata update
  const hasRetentionNotice = await evaluate('Boolean(document.getElementById("recovery-unavailable-msg") || document.querySelector(".recovery-retention-notice"))');
  if (!hasRetentionNotice) throw new Error('Expected honest recovery retention notice for metadata update');

  await capture('S3-audit-activity-diff-drawer.png');

  // Close diff drawer
  await evaluate("document.querySelector('a[aria-label=\"Close diff drawer\"]')?.click()");
  await wait('!document.getElementById("diff-drawer-title")', 'diff drawer closed');

  // Verify connection filter
  const connOptionVal = await evaluate("document.querySelector('#filter-connection option:nth-child(2)')?.value");
  if (connOptionVal) {
    await evaluate(`(()=>{
      const sel = document.getElementById('filter-connection');
      if (sel) {
        sel.value = '${connOptionVal}';
        document.getElementById('apply-filters-btn')?.click();
      }
      return true;
    })()`);
    await wait('location.href.includes("tokenId=")', 'connection filter URL');
    await wait('Boolean(document.querySelector(".data-table tbody tr"))', 'connection filtered rows');
  }

  // Verify date filter
  const todayIso = new Date().toISOString().split('T')[0];
  await evaluate(`(()=>{
    const dateInput = document.getElementById('filter-date');
    if (dateInput) {
      dateInput.value = '${todayIso}';
      document.getElementById('apply-filters-btn')?.click();
    }
    return true;
  })()`);
  await wait('location.href.includes("date=")', 'date filter URL');
  await wait('Boolean(document.querySelector(".data-table tbody tr"))', 'date filtered rows');

  // Verify operation filter
  await evaluate(`(()=>{
    const sel = document.getElementById('filter-tool');
    if (!sel) throw new Error('filter-tool select missing');
    sel.value = 'update_course_metadata';
    document.getElementById('apply-filters-btn')?.click();
    return true;
  })()`);
  await wait('location.href.includes("toolName=update_course_metadata")', 'toolName filter URL');
  await wait('Boolean(document.querySelector(".data-table tbody tr"))', 'filtered rows loaded');
  const nonMatchingOp = await evaluate(`Array.from(document.querySelectorAll('.data-table tbody tr td:nth-child(3)')).some(td => !td.innerText.includes('Update metadata'))`);
  if (nonMatchingOp) throw new Error('Found rows not matching filtered toolName');

  // Verify outcome filter
  await evaluate(`(()=>{
    const sel = document.getElementById('filter-outcome');
    if (!sel) throw new Error('filter-outcome select missing');
    sel.value = 'success';
    document.getElementById('apply-filters-btn')?.click();
    return true;
  })()`);
  await wait('location.href.includes("outcome=success")', 'outcome filter URL');
  await wait('Boolean(document.querySelector(".data-table tbody tr"))', 'outcome filtered rows');
  const failedOutcome = await evaluate(`Array.from(document.querySelectorAll('.data-table tbody tr td:nth-child(6)')).some(td => !td.innerText.includes('Success'))`);
  if (failedOutcome) throw new Error('Found rows not matching outcome=success');

  // Reset filters
  await evaluate("document.getElementById('reset-filters-btn')?.click()");
  await wait('Boolean(document.querySelector(".data-table tbody tr")) && !location.href.includes("toolName=")', 'filters reset');

  // Capture mobile screenshot of Activity page
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await new Promise((r) => setTimeout(r, 200));
  await wait('Boolean(document.querySelector(".activity-mobile-card"))', 'mobile card list');
  const desktopTableHidden = await evaluate('window.getComputedStyle(document.querySelector(".activity-desktop-table")).display === "none"');
  if (!desktopTableHidden) throw new Error('Desktop table should be hidden on mobile');
  const mobileCardVisible = await evaluate('window.getComputedStyle(document.querySelector(".activity-mobile-list")).display !== "none"');
  if (!mobileCardVisible) throw new Error('Mobile card list should be visible on mobile');
  const hasReachableDiffLink = await evaluate('Boolean(document.querySelector(".activity-mobile-card a[href*=\\"mutationId=\\"]"))');
  if (!hasReachableDiffLink) throw new Error('Mobile card missing reachable View diff link');
  await capture('S3-audit-activity-mobile.png');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  // Clear unsaved marker
  await evaluate(`(()=>{
    sessionStorage.removeItem("zur_builder_unsaved_${course.id}");
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith("zur_builder_unsaved_val_${course.id}_")) sessionStorage.removeItem(k);
    });
    return true;
  })()`);

  // 16. MCP-11 Publication Blocker Check (Broken exercise reference solution)
  const brokenCourseRes = await client.callTool({ name: 'create_course', arguments: { title: 'Broken Exercise Course' } });
  if (brokenCourseRes.isError) throw new Error('brokenCourse creation failed');
  const brokenCourse = JSON.parse(String(brokenCourseRes.content?.[0]?.text));
  const brokenMetaRes = await client.callTool({
    name: 'update_course_metadata',
    arguments: {
      course_id: brokenCourse.id,
      expected_revision: brokenCourse.draftRevision,
      metadata: {
        title: 'Broken Exercise Course',
        description: 'Broken course description',
        category_id: 'cat-programming',
        difficulty: 'beginner',
        language: 'en',
        learning_outcomes: ['Broken outcome'],
      },
    },
  });
  if (brokenMetaRes.isError) throw new Error('brokenMeta update failed');
  const brokenModRes = await client.callTool({ name: 'create_module', arguments: { course_id: brokenCourse.id, title: 'Mod 1' } });
  if (brokenModRes.isError) throw new Error('brokenMod creation failed');
  const brokenMod = JSON.parse(String(brokenModRes.content?.[0]?.text));
  const brokenLesRes = await client.callTool({ name: 'create_lesson', arguments: { course_id: brokenCourse.id, module_id: brokenMod.id, title: 'Les 1', description: 'Les 1 desc' } });
  if (brokenLesRes.isError) throw new Error('brokenLes creation failed');
  const brokenLes = JSON.parse(String(brokenLesRes.content?.[0]?.text));
  const brokenStepRes = await client.callTool({
    name: 'create_step',
    arguments: {
      course_id: brokenCourse.id,
      lesson_id: brokenLes.id,
      title: 'Broken Exercise',
      type: 'python',
      content: { starterCode: 'pass\n', referenceSolution: 'print(999)\n' },
      test_cases: [{ stdin: '', expected_stdout: '42\n', is_hidden: false }],
    },
  });
  if (brokenStepRes.isError) throw new Error('brokenStep creation failed');
  const brokenRev = (db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(brokenCourse.id) as any).draft_revision;
  const brokenPubRes = await client.callTool({
    name: 'publish_course',
    arguments: { course_id: brokenCourse.id, expected_revision: brokenRev },
  });
  if (!brokenPubRes.isError) throw new Error('Expected broken reference solution to block publication (MCP-11)');

  // 17. MCP-07 Validation and Publication of Valid Course via MCP Full-Control Token
  const valRes = await client.callTool({ name: 'validate_course', arguments: { course_id: course.id } });
  if (valRes.isError) throw new Error('validate_course failed: ' + valRes.content?.[0]?.text);
  const valData = JSON.parse(String(valRes.content?.[0]?.text));
  if (!valData.isValid) throw new Error('Course validation failed: ' + JSON.stringify(valData.errors));

  const curRev = (db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any).draft_revision;
  const pubRes = await client.callTool({
    name: 'publish_course',
    arguments: { course_id: course.id, expected_revision: curRev, change_summary: 'Verified publication via official MCP SDK' },
  });
  if (pubRes.isError) throw new Error('Publication failed: ' + pubRes.content?.[0]?.text);

  // 18. Verify Published State in Browser
  await navigate(`${webOrigin}/teach/${course.id}/content`);
  await wait('document.body.innerText.includes("Published")', 'published status in builder');
  const hasUnpublished = await evaluate('document.body.innerText.includes("Unpublished changes")');
  if (hasUnpublished) {
    throw new Error('Post-publication builder unexpectedly shows Unpublished changes badge');
  }
  await capture('S3-audit-builder-published.png');

  // 19. MCP-08 Batch Authoring & Idempotency Deduplication
  const curBatchRev = (db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any).draft_revision;
  const prepRes = await client.callTool({
    name: 'prepare_course_changes',
    arguments: {
      course_id: course.id,
      expected_revision: curBatchRev,
      operations: [
        { op: 'create_module', title: 'Batch Created Module' },
      ],
    },
  });
  if (prepRes.isError) throw new Error('prepare_course_changes failed: ' + prepRes.content?.[0]?.text);
  const prepData = JSON.parse(String(prepRes.content?.[0]?.text));
  const batchKey = 'batch-idemp-' + Date.now();
  const applyRes1 = await client.callTool({
    name: 'apply_course_changes',
    arguments: {
      course_id: course.id,
      plan_id: prepData.plan_id,
      expected_revision: curBatchRev,
      idempotency_key: batchKey,
    },
  });
  if (applyRes1.isError) throw new Error('apply_course_changes failed: ' + applyRes1.content?.[0]?.text);

  // Matching idempotency key returns original receipt
  const applyRes2 = await client.callTool({
    name: 'apply_course_changes',
    arguments: {
      course_id: course.id,
      plan_id: prepData.plan_id,
      expected_revision: curBatchRev,
      idempotency_key: batchKey,
    },
  });
  if (applyRes2.isError) throw new Error('Idempotent retry failed');

  // Differing payload with same key returns Conflict
  const applyRes3 = await client.callTool({
    name: 'apply_course_changes',
    arguments: {
      course_id: course.id,
      plan_id: 'different-plan-id',
      expected_revision: curBatchRev,
      idempotency_key: batchKey,
    },
  });
  if (!applyRes3.isError) throw new Error('Mismatched idempotency payload should be rejected');

  // 19b. Verify Live P45 Recovery Review & Restore Flow for Retained Batch Snapshot
  await navigate(`${webOrigin}/teach/${course.id}/activity`);
  await wait('Boolean(document.querySelector(".data-table tbody tr"))', 'activity rows for batch authoring');
  const batchRowFound = await evaluate(`Array.from(document.querySelectorAll('.data-table tbody tr')).some(r => r.innerText.includes('Batch authoring'))`);
  if (!batchRowFound) throw new Error('Batch authoring row not found in activity table');

  // Open diff drawer for batch authoring mutation
  await evaluate(`(()=>{
    const row = Array.from(document.querySelectorAll('.data-table tbody tr')).find(r => r.innerText.includes('Batch authoring'));
    row?.querySelector('a[href*="mutationId="]')?.click();
    return true;
  })()`);
  await wait('Boolean(document.getElementById("diff-drawer-title"))', 'batch diff drawer opened');
  const batchDrawerTitle = await evaluate('document.getElementById("diff-drawer-title")?.innerText');
  if (!batchDrawerTitle?.includes('Batch authoring')) throw new Error('Batch diff drawer title mismatch: ' + batchDrawerTitle);

  // Because batch authoring preserves a recoverable draft snapshot, restore-prior-btn must be active!
  await wait('Boolean(document.getElementById("restore-prior-btn"))', 'restore prior button active for retained snapshot');
  await evaluate("document.getElementById('restore-prior-btn')?.click()");

  // Wait for restore confirmation dialog
  await wait('Boolean(document.getElementById("restore-modal-title"))', 'restore confirmation dialog');
  const modalText = await evaluate('document.querySelector(".modal-card")?.innerText');
  if (!modalText?.includes('Restore Previous Draft Revision?')) throw new Error('Restore modal title missing');
  if (!modalText?.includes("Published versions, student progress, and live access settings won't be rolled back.")) {
    throw new Error('Mandatory consequence warning missing from restore modal');
  }
  const hasConfirmRestoreBtn = await evaluate('Boolean(document.getElementById("confirm-restore-btn"))');
  if (!hasConfirmRestoreBtn) throw new Error('Confirm restore button missing from restore modal');

  await capture('S3-audit-activity-restore-modal.png');

  // Verify real recovery ID and expectedRevision in the restore confirmation form
  const formAction = await evaluate('document.querySelector(".modal-card form")?.getAttribute("action")');
  const formExpectedRev = await evaluate('document.querySelector(".modal-card form input[name=\\"expectedRevision\\"]")?.value');
  const preRestoreCourse = db.prepare('SELECT draft_revision, current_version_id, publication_status FROM courses WHERE id = ?').get(course.id) as any;
  const retainedSnapshot = db.prepare('SELECT id, revision_number FROM recovery_revisions WHERE course_id = ? AND revision_number = ?').get(course.id, curBatchRev) as any;
  if (!retainedSnapshot) throw new Error(`Expected retained recovery snapshot for revision ${curBatchRev}`);
  if (!formAction?.includes(`/recovery/${retainedSnapshot.id}/restore`)) {
    throw new Error(`Expected restore action to include real recovery snapshot ID ${retainedSnapshot.id}, got ${formAction}`);
  }
  if (Number(formExpectedRev) !== preRestoreCourse.draft_revision) {
    throw new Error(`Expected form expectedRevision to be ${preRestoreCourse.draft_revision}, got ${formExpectedRev}`);
  }

  // Test 409 Conflict on stale expectedRevision in live UI
  await evaluate(`(()=>{
    const revInput = document.querySelector('.modal-card form input[name="expectedRevision"]');
    if (revInput) revInput.value = '${preRestoreCourse.draft_revision - 1}';
    document.getElementById('confirm-restore-btn')?.click();
    return true;
  })()`);
  await wait('Boolean(document.getElementById("restore-conflict-msg"))', 'restore 409 conflict alert appeared');
  const restoreConflictText = await evaluate('document.getElementById("restore-conflict-msg")?.innerText');
  if (!restoreConflictText?.includes('Revision Conflict') && !restoreConflictText?.includes('modified')) {
    throw new Error('Conflict alert missing expected conflict explanation');
  }
  const isSubmitDisabled = await evaluate('document.getElementById("confirm-restore-btn")?.disabled');
  if (!isSubmitDisabled) throw new Error('Stale restore confirm button should be disabled upon conflict');

  // Reload current draft revision via conflict card action
  await evaluate("document.getElementById('btn-reload-current-revision')?.click()");
  await wait('!document.getElementById("restore-modal-title")', 'restore modal closed / reloaded activity');
  await wait('Boolean(document.querySelector(".data-table tbody tr"))', 'activity reloaded');

  // Re-open diff drawer and restore modal with fresh draft revision
  await evaluate(`(()=>{
    const row = Array.from(document.querySelectorAll('.data-table tbody tr')).find(r => r.innerText.includes('Batch authoring'));
    row?.querySelector('a[href*="mutationId="]')?.click();
    return true;
  })()`);
  await wait('Boolean(document.getElementById("restore-prior-btn"))', 'reopened diff drawer restore button');
  await evaluate("document.getElementById('restore-prior-btn')?.click()");
  await wait('Boolean(document.getElementById("restore-modal-title"))', 'restore confirmation dialog reopened');

  // Submit restoration for retained batch snapshot through the author UI (#confirm-restore-btn)
  await evaluate("document.getElementById('confirm-restore-btn')?.click()");
  await wait('location.pathname.includes("/teach/" + "' + course.id + '" + "/content")', 'course builder redirect after restore');
  await wait('Boolean(document.querySelector(".author-workspace-main"))', 'course builder loaded after restore');

  // Verify DB and UI state post-restore:
  // 1. New draft revision created
  const postRestoreCourse = db.prepare('SELECT draft_revision, current_version_id, publication_status FROM courses WHERE id = ?').get(course.id) as any;
  if (postRestoreCourse.draft_revision !== preRestoreCourse.draft_revision + 1) {
    throw new Error(`Expected new draft revision ${preRestoreCourse.draft_revision + 1}, got ${postRestoreCourse.draft_revision}`);
  }
  // 2. Existing published version (v1) remains intact
  if (postRestoreCourse.publication_status !== 'published') {
    throw new Error(`Expected course publication_status to remain 'published', got ${postRestoreCourse.publication_status}`);
  }
  const publishedVersionRow = db.prepare('SELECT version_number FROM course_versions WHERE id = ?').get(postRestoreCourse.current_version_id) as any;
  if (publishedVersionRow?.version_number !== 1) {
    throw new Error(`Expected published version_number 1 to remain intact, got ${publishedVersionRow?.version_number}`);
  }
  // 3. Content restored: 'Batch Created Module' removed, pre-existing module preserved
  const batchModuleAfterRestore = db.prepare('SELECT id, title FROM modules WHERE course_id = ? AND title = ?').get(course.id, 'Batch Created Module');
  if (batchModuleAfterRestore) {
    throw new Error('Batch Created Module still present in database after restoration');
  }
  const initialModuleAfterRestore = db.prepare('SELECT id, title FROM modules WHERE course_id = ? AND title = ?').get(course.id, 'Module 1: Architecture & Engineering');
  if (!initialModuleAfterRestore) {
    throw new Error('Initial module missing from database after restoration');
  }
  const uiShowsBatchModule = await evaluate('document.body.innerText.includes("Batch Created Module")');
  if (uiShowsBatchModule) {
    throw new Error('Course builder UI unexpectedly shows Batch Created Module after restoration');
  }
  const uiShowsInitialModule = await evaluate('document.body.innerText.includes("Architecture & Engineering")');
  if (!uiShowsInitialModule) {
    throw new Error('Course builder UI missing Architecture & Engineering after restoration');
  }

  // 20. P44 Client Setup & Direct URL Validation
  await navigate(`${webOrigin}/settings/ai-connections`);
  await wait('Boolean(document.querySelector("[data-action=replace-token]"))', 'active connection row');
  const initialTokenId = await evaluate("document.querySelector('[data-action=replace-token]')?.getAttribute('data-token-id')");
  if (!initialTokenId) throw new Error('Initial active token ID not found');

  // Verify non-existent connection ID directly renders safe not-found state without fake data
  await navigate(`${webOrigin}/settings/ai-connections/non-existent-token-id/setup`);
  await wait('document.body.innerText.includes("This page isn\'t available")', 'not-found page for missing token');
  const hasInventedToken = await evaluate('document.body.innerText.includes("Sample Agent") || document.body.innerText.includes("zat_sample")');
  if (hasInventedToken) throw new Error('Setup page leaked fake Sample Agent data for missing token');

  // Verify unapproved client query sanitizes cleanly to official_sdk
  await navigate(`${webOrigin}/settings/ai-connections/${initialTokenId}/setup?client=claude_desktop`);
  await wait('Boolean(document.querySelector(".client-tab-btn.active[data-client=official_sdk]"))', 'sanitized active official_sdk tab');
  const renderedSnippet = await evaluate("document.querySelector('.setup-code-block code')?.innerText");
  if (!renderedSnippet?.includes('@modelcontextprotocol/client')) {
    throw new Error('Expected official_sdk snippet with @modelcontextprotocol/client');
  }

  // Visit P44 real browser setup for the valid token with ?client=oauth_client
  await navigate(`${webOrigin}/settings/ai-connections/${initialTokenId}/setup?client=oauth_client`);
  await wait('document.body.innerText.includes("OAuth Limitation Notice")', 'OAuth limitation notice');
  await wait('document.body.innerText.includes("This client requires OAuth")', 'OAuth explanation');
  const falseConnectAction = await evaluate("Boolean(document.querySelector('button[data-action=connect]') || document.getElementById('btn-connect') || Array.from(document.querySelectorAll('button')).some(b => b.innerText.toLowerCase().trim() === 'connect'))");
  if (falseConnectAction) throw new Error('Setup unexpectedly rendered false Connect action for OAuth-only client');
  const falseConnectedBadge = await evaluate("Boolean(document.querySelector('.status-badge.success') || Array.from(document.querySelectorAll('.status-badge')).some(b => b.innerText.toLowerCase().includes('connected')))");
  if (falseConnectedBadge) throw new Error('Setup unexpectedly rendered Connected badge for OAuth-only client');
  const hasNonfunctionalControls = await evaluate("Boolean(document.getElementById('btn-copy-endpoint') || document.getElementById('btn-copy-snippet'))");
  if (hasNonfunctionalControls) throw new Error('Setup rendered nonfunctional copy controls for OAuth-only client');
  await capture('S3-audit-oauth-only-notice.png');

  // 21. P43 Live Token Replacement via Dedicated Reauth Modal
  await navigate(`${webOrigin}/settings/ai-connections`);
  await wait('Boolean(document.querySelector("[data-action=replace-token]"))', 'replace button');
  await capture('S3-audit-connections-active.png');
  await evaluate("document.querySelector('[data-action=replace-token]').click()");
  await wait('Boolean(document.getElementById("replace-token-modal"))', 'replace token modal');
  await wait('Boolean(document.getElementById("replace-scopes-checklist"))', 'narrowing scope checklist');
  await capture('S3-audit-token-replace-modal.png');

  // Fill reauthentication password and submit
  await evaluate(`(()=>{
    const form = document.getElementById('replace-token-form');
    form.querySelector('#replace-connection-password').value = 'AuthorPass123!';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  })()`);

  // Wait for token reveal modal
  await wait('Boolean(document.getElementById("token-reveal-modal"))', 'replacement token reveal modal');
  const isReplacedMasked = await evaluate('document.getElementById("revealed-token-value")?.type === "password"');
  if (!isReplacedMasked) throw new Error('Replacement one-time secret was not masked');
  await capture('S3-audit-token-replaced-masked.png');

  const replacedRawToken = await evaluate('document.getElementById("revealed-token-value")?.value');
  if (!replacedRawToken || replacedRawToken === rawToken) throw new Error('Replaced raw token is missing or identical to old token');

  // Verify old official SDK client is denied immediately
  let oldClientDenied = false;
  try {
    const oldRes = await client.callTool({ name: 'get_author_context', arguments: {} });
    oldClientDenied = Boolean(oldRes.isError);
  } catch {
    oldClientDenied = true;
  }
  if (!oldClientDenied) throw new Error('Old SDK client was not denied after replacement');

  // Connect new official SDK client with replaced token and verify success
  const replacedTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${apiPort}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${replacedRawToken}` } },
  });
  replacedClient = new Client({ name: 's3-browser-audit-replaced-client', version: '2.1.0' }, { capabilities: {}, versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await replacedClient.connect(replacedTransport);
  const newContext = await replacedClient.callTool({ name: 'get_author_context', arguments: {} });
  if (newContext.isError) throw new Error('New replaced SDK client failed: ' + newContext.content?.[0]?.text);

  // 22. Revoke the new replaced token and verify mobile card layout
  await navigate(`${webOrigin}/settings/ai-connections`);
  await wait('Boolean(document.querySelector("[data-action=revoke-token]"))', 'active revoke button');
  await evaluate("document.querySelector('[data-action=revoke-token]').click()");
  await wait('Boolean(document.getElementById("revoke-token-modal"))', 'revocation confirmation');
  await capture('S3-audit-revoke-confirmation.png');
  await evaluate("document.getElementById('btn-confirm-revoke').click()");
  await wait('document.body.innerText.includes("Revoked")', 'revoked status');
  await capture('S3-audit-connections-revoked.png');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await capture('S3-audit-connections-revoked-mobile.png');
  await evaluate("document.querySelector('.connections-mobile-list')?.scrollIntoView({block:'start'})");
  await capture('S3-audit-connections-revoked-mobile-cards.png');

  // Replaced token fails subsequent call immediately
  let replacedRevoked = false;
  try {
    const revCall = await replacedClient.callTool({ name: 'get_author_context', arguments: {} });
    replacedRevoked = Boolean(revCall.isError);
  } catch {
    replacedRevoked = true;
  }
  if (!replacedRevoked) throw new Error('Revoked replaced MCP token still worked');

  console.log(JSON.stringify({
    passed: true,
    sdkClient: true,
    protocolVersion: '2026-07-28',
    browserTokenIssue: true,
    allStepTypesCreated: true,
    imageUploadAndAltTextRoundTrip: true,
    exerciseValidated: true,
    builderVisible: true,
    builderConflictPreserved: true,
    p45ActivityAndRecoveryVerified: true,
    exerciseFailureBlocksPublish: true,
    mcpPublishSucceeded: true,
    batchIdempotencyVerified: true,
    p44OAuthNoticeVerified: true,
    p43TokenReplacementVerified: true,
    browserRevocationVerified: true,
    screenshots: [
      'screenshots/S3-audit-connections-initial.png',
      'screenshots/S3-audit-grant-form.png',
      'screenshots/S3-audit-grant-form-mobile.png',
      'screenshots/S3-audit-token-masked.png',
      'screenshots/S3-audit-sdk-course-builder.png',
      'screenshots/S3-audit-builder-theory-image-preview.png',
      'screenshots/S3-audit-builder-conflict-remote-update.png',
      'screenshots/S3-audit-activity-diff-drawer.png',
      'screenshots/S3-audit-activity-mobile.png',
      'screenshots/S3-audit-activity-restore-modal.png',
      'screenshots/S3-audit-builder-published.png',
      'screenshots/S3-audit-oauth-only-notice.png',
      'screenshots/S3-audit-connections-active.png',
      'screenshots/S3-audit-token-replace-modal.png',
      'screenshots/S3-audit-token-replaced-masked.png',
      'screenshots/S3-audit-revoke-confirmation.png',
      'screenshots/S3-audit-connections-revoked.png',
      'screenshots/S3-audit-connections-revoked-mobile.png',
      'screenshots/S3-audit-connections-revoked-mobile-cards.png',
    ],
  }, null, 2));
} finally {
  await client?.close().catch(() => {});
  await replacedClient?.close().catch(() => {});
  socket?.close();
  await stop(chrome);
  await stop(vite);
  await new Promise<void>((resolve) => api.close(() => resolve()));
  closeDatabase(dbPath);
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}

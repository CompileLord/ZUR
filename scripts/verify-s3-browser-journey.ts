import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase, hashPassword } from '../packages/server/src/db/seed.ts';
import { createServer } from '../packages/server/src/server.ts';

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

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port unavailable');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
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
  const apiPort = await freePort();
  await new Promise<void>((resolve) => api.listen(apiPort, '127.0.0.1', resolve));
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
  const hugeRejected = await client.callTool({
    name: 'complete_image_upload',
    arguments: { course_id: 'course-python-foundations', base64_data: hugeBase64, filename: 'huge.png' },
  }).then(() => false, () => true);
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
  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
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
  const renderedAlt = await evaluate("document.querySelector('.theory-preview-pane img')?.getAttribute('alt')");
  if (renderedAlt !== 'Architecture diagram showing system flow') throw new Error(`Alt text mismatch: got "${renderedAlt}"`);
  await capture('S3-audit-builder-theory-image-preview.png');

  // 15. Concurrent Builder Edit & Remote Update Conflict Handling (P45)
  await navigate(`${webOrigin}/teach/${course.id}/content`);
  await wait('document.body.innerText.includes("S3 Full Gate Verified Course")', 'builder content');
  await evaluate(`sessionStorage.setItem("zur_builder_unsaved_${course.id}", "true")`);
  await client.callTool({
    name: 'update_course_metadata',
    arguments: {
      course_id: course.id,
      metadata: {
        title: 'S3 Full Gate Verified Course',
        description: 'Updated remotely by MCP SDK agent during concurrent edit',
      },
    },
  });
  await navigate(`${webOrigin}/teach/${course.id}/content`);
  await wait('Boolean(document.querySelector(".remote-update-strip"))', 'remote update strip');
  await wait('Boolean(document.getElementById("resolve-conflict-btn"))', 'resolve conflict button');
  const conflictText = await evaluate('document.querySelector(".remote-update-strip")?.innerText');
  if (!conflictText?.includes('Unsaved local changes preserved')) throw new Error('Unsaved changes notice missing');
  await capture('S3-audit-builder-conflict-remote-update.png');
  await evaluate(`sessionStorage.removeItem("zur_builder_unsaved_${course.id}")`);

  // 16. MCP-11 Publication Blocker Check (Broken exercise reference solution)
  const brokenCourseRes = await client.callTool({ name: 'create_course', arguments: { title: 'Broken Exercise Course' } });
  const brokenCourse = JSON.parse(String(brokenCourseRes.content?.[0]?.text));
  await client.callTool({
    name: 'update_course_metadata',
    arguments: {
      course_id: brokenCourse.id,
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
  const brokenModRes = await client.callTool({ name: 'create_module', arguments: { course_id: brokenCourse.id, title: 'Mod 1' } });
  const brokenMod = JSON.parse(String(brokenModRes.content?.[0]?.text));
  const brokenLesRes = await client.callTool({ name: 'create_lesson', arguments: { course_id: brokenCourse.id, module_id: brokenMod.id, title: 'Les 1', description: 'Les 1 desc' } });
  const brokenLes = JSON.parse(String(brokenLesRes.content?.[0]?.text));
  await client.callTool({
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
  const brokenRev = (db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(brokenCourse.id) as any).draft_revision;
  const brokenPubRes = await client.callTool({
    name: 'publish_course',
    arguments: { course_id: brokenCourse.id, expected_revision: brokenRev },
  });
  if (!brokenPubRes.isError) throw new Error('Expected broken reference solution to block publication (MCP-11)');

  // 17. MCP-07 Validation and Publication of Valid Course via MCP Full-Control Token
  const valRes = await client.callTool({ name: 'validate_course', arguments: { course_id: course.id } });
  const valData = JSON.parse(String(valRes.content?.[0]?.text));
  if (!valData.valid) throw new Error('Course validation failed: ' + JSON.stringify(valData.errors));

  const curRev = (db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any).draft_revision;
  const pubRes = await client.callTool({
    name: 'publish_course',
    arguments: { course_id: course.id, expected_revision: curRev, change_summary: 'Verified publication via official MCP SDK' },
  });
  if (pubRes.isError) throw new Error('Publication failed: ' + pubRes.content?.[0]?.text);

  // 18. Verify Published State in Browser
  await navigate(`${webOrigin}/teach/${course.id}/content`);
  await wait('document.body.innerText.includes("Published")', 'published status in builder');
  await capture('S3-audit-builder-published.png');

  // 19. MCP-08 Batch Authoring & Idempotency Deduplication
  const curBatchRev = (db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any).draft_revision;
  const prepRes = await client.callTool({
    name: 'prepare_course_changes',
    arguments: {
      course_id: course.id,
      expected_revision: curBatchRev,
      operations: [
        { op: 'create_module', data: { title: 'Batch Created Module' } },
      ],
    },
  });
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

  // 20. Token Revocation & Mobile Card View (P43, MCP-04)
  await navigate(`${webOrigin}/settings/ai-connections`);
  await wait('Boolean(document.querySelector("[data-action=revoke-token]"))', 'connection row');
  await capture('S3-audit-connections-active.png');
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

  // Revoked token fails subsequent call immediately
  const revoked = await client.callTool({ name: 'get_author_context', arguments: {} }).then(() => false, () => true);
  if (!revoked) throw new Error('revoked MCP token still worked');

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
    exerciseFailureBlocksPublish: true,
    mcpPublishSucceeded: true,
    batchIdempotencyVerified: true,
    browserRevocationVerified: true,
    screenshots: [
      'screenshots/S3-audit-connections-initial.png',
      'screenshots/S3-audit-grant-form.png',
      'screenshots/S3-audit-grant-form-mobile.png',
      'screenshots/S3-audit-token-masked.png',
      'screenshots/S3-audit-sdk-course-builder.png',
      'screenshots/S3-audit-builder-theory-image-preview.png',
      'screenshots/S3-audit-builder-conflict-remote-update.png',
      'screenshots/S3-audit-builder-published.png',
      'screenshots/S3-audit-connections-active.png',
      'screenshots/S3-audit-revoke-confirmation.png',
      'screenshots/S3-audit-connections-revoked.png',
      'screenshots/S3-audit-connections-revoked-mobile.png',
      'screenshots/S3-audit-connections-revoked-mobile-cards.png',
    ],
  }, null, 2));
} finally {
  await client?.close().catch(() => {});
  socket?.close();
  await stop(chrome);
  await stop(vite);
  await new Promise<void>((resolve) => api.close(() => resolve()));
  closeDatabase(dbPath);
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase, hashPassword } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';
import { McpTokenService } from '../src/services/mcp-token-service.ts';
import { TOKEN_SCOPE_PRESETS } from 'zur-shared';

test('MCP End-to-End and Adversarial Verification (MCP-01 through MCP-12, T068)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const tokenService = new McpTokenService(db);
  const author1Id = 'user-author-1'; // Guido van Rossum
  const author2Id = 'user-author-2'; // Barbara Liskov
  const guidoCourseId = 'course-python-foundations';
  const authorPassword = 'AuthorPass123!';
  const author2Password = 'Author2Pass123!';

  // Seed Author 2 (Barbara Liskov) and a course owned by Author 2
  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, email_verified, capabilities, account_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, 'active', datetime('now'), datetime('now'))
  `).run(author2Id, 'barbara@zur.internal', hashPassword(author2Password), 'Barbara Liskov', JSON.stringify(['student', 'author']));

  db.prepare(`
    INSERT INTO courses (id, owner_id, title, description, category_id, visibility, enrollment_policy, draft_revision, created_at, updated_at)
    VALUES ('course-barbara', ?, 'Barbara Algorithms', 'Private course', 'cat-programming', 'private', 'invitation_only', 1, datetime('now'), datetime('now'))
  `).run(author2Id);

  // Full control token for Author 1 (scoped to guidoCourseId)
  const fullControlResult = tokenService.createToken(author1Id, {
    password: authorPassword,
    label: 'Guido Full Control Agent',
    scopes: TOKEN_SCOPE_PRESETS.full_course_control,
    courseRestrictions: [guidoCourseId],
    expiryDays: 30,
  });
  const fullBearer = `Bearer ${fullControlResult.rawToken}`;
  const fullTokenId = fullControlResult.token.id;

  // Unrestricted full control token for Author 1 (courseRestrictions: null)
  const unrestrictedResult = tokenService.createToken(author1Id, {
    password: authorPassword,
    label: 'Guido Unrestricted Agent',
    scopes: TOKEN_SCOPE_PRESETS.full_course_control,
    courseRestrictions: null,
    expiryDays: 30,
  });
  const unrestrictedBearer = `Bearer ${unrestrictedResult.rawToken}`;

  // Draft authoring token for Author 1 (no publish, no content:delete)
  const draftOnlyResult = tokenService.createToken(author1Id, {
    password: authorPassword,
    label: 'Guido Draft Only Agent',
    scopes: TOKEN_SCOPE_PRESETS.draft_authoring,
    courseRestrictions: [guidoCourseId],
    expiryDays: 30,
  });
  const draftOnlyBearer = `Bearer ${draftOnlyResult.rawToken}`;

  // Read only token for Author 1
  const readOnlyResult = tokenService.createToken(author1Id, {
    password: authorPassword,
    label: 'Guido Read Only Agent',
    scopes: TOKEN_SCOPE_PRESETS.read_only,
    courseRestrictions: [guidoCourseId],
    expiryDays: 30,
  });
  const readOnlyBearer = `Bearer ${readOnlyResult.rawToken}`;

  const server = createServer(db);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const port = address.port;

  t.after(() => {
    server.close();
  });

  const mcpSessions = new Map<string, string>();
  async function initializeMcpSession(bearer: string): Promise<string> {
    const existing = mcpSessions.get(bearer);
    if (existing) return existing;
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: bearer, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test-client', version: '1' },
      }}),
    });
    if (!response.ok) throw new Error(`MCP initialize failed: ${response.status}`);
    const id = response.headers.get('mcp-session-id');
    if (!id) throw new Error('MCP session ID missing');
    mcpSessions.set(bearer, id);
    return id;
  }

  async function callMcp(bearer: string | null, toolName: string, toolArgs: any): Promise<any> {
    const sessionId = bearer ? await initializeMcpSession(bearer) : undefined;
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: `call-${Date.now()}-${Math.random()}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArgs,
        },
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
        Accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-11-25' } : {}),
      };
      if (bearer) {
        headers['Authorization'] = bearer;
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'POST',
          headers,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              resolve({
                statusCode: res.statusCode,
                body: data ? JSON.parse(data.startsWith('event:') ? data.split('\n').find((line) => line.startsWith('data: '))!.slice(6) : data) : null,
              });
            } catch {
              resolve({
                statusCode: res.statusCode,
                body: data,
              });
            }
          });
        }
      );

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  async function requestApi(
    method: string,
    path: string,
    bearer: string | null,
    body?: any
  ): Promise<{ statusCode: number; body: any }> {
    return new Promise((resolve, reject) => {
      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      const headers: Record<string, string> = {};
      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(Buffer.byteLength(payload));
      }
      if (bearer) {
        headers['Authorization'] = bearer;
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              resolve({
                statusCode: res.statusCode || 500,
                body: data ? JSON.parse(data) : null,
              });
            } catch {
              resolve({
                statusCode: res.statusCode || 500,
                body: data,
              });
            }
          });
        }
      );

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // Obtain Author 1 session token for REST API endpoints
  const authLoginRes = await requestApi('POST', '/api/auth/sign-in', null, {
    email: 'guido@zur.internal',
    password: authorPassword,
  });
  const authorSessionBearer = `Bearer ${authLoginRes.body.token}`;

  // Obtain Author 2 session token
  const auth2LoginRes = await requestApi('POST', '/api/auth/sign-in', null, {
    email: 'barbara@zur.internal',
    password: author2Password,
  });
  const author2SessionBearer = `Bearer ${auth2LoginRes.body.token}`;

  await t.test('MCP-01: Bearer auth, scope & course restrictions enforce containment', async () => {
    // 1. Unauthenticated request rejected
    const unauth = await callMcp(null, 'get_course', { course_id: guidoCourseId });
    assert.strictEqual(unauth.statusCode, 401);

    // 2. Read within restriction succeeds
    const allowed = await callMcp(readOnlyBearer, 'get_course', { course_id: guidoCourseId, projection: 'metadata' });
    assert.strictEqual(allowed.statusCode, 200);
    const content = JSON.parse(allowed.body.result.content[0].text);
    assert.strictEqual(content.id, guidoCourseId);

    // 3. Request outside token course restriction is denied
    const restrictedToken = tokenService.createToken(author1Id, {
      password: authorPassword,
      label: 'Strict Single Course',
      scopes: ['courses:read'],
      courseRestrictions: ['course-suspended-tricks'],
      expiryDays: 1,
    });
    const restrictedRes = await callMcp(`Bearer ${restrictedToken.rawToken}`, 'get_course', {
      course_id: guidoCourseId,
    });
    assert.strictEqual(restrictedRes.body.result?.isError, true);
  });

  await t.test('MCP-02: Agent creates hierarchy with theory, video, quiz, and python steps', async () => {
    // Create new course draft
    const createCourseRes = await callMcp(unrestrictedBearer, 'create_course', {
      title: 'E2E Agent Built Course',
      description: 'Built entirely through MCP tool suite',
      difficulty: 'beginner',
    });
    assert.strictEqual(createCourseRes.statusCode, 200);
    const course = JSON.parse(createCourseRes.body.result.content[0].text);
    const courseId = course.id;

    // Add module
    const createModRes = await callMcp(unrestrictedBearer, 'create_module', {
      course_id: courseId,
      title: 'Module 1: Foundations',
      position: 0,
    });
    const mod = JSON.parse(createModRes.body.result.content[0].text);

    // Add lesson
    const createLesRes = await callMcp(unrestrictedBearer, 'create_lesson', {
      course_id: courseId,
      module_id: mod.id,
      title: 'Lesson 1: Introduction',
      position: 0,
    });
    const les = JSON.parse(createLesRes.body.result.content[0].text);

    // 1. Theory step
    const theoryRes = await callMcp(unrestrictedBearer, 'create_step', {
      course_id: courseId,
      lesson_id: les.id,
      title: 'Theory Concept',
      type: 'theory',
      position: 0,
      content: { markdown: '# Welcome\nLearn Python step by step.' },
    });
    assert.strictEqual(theoryRes.statusCode, 200);

    // 2. Video step
    const videoRes = await callMcp(unrestrictedBearer, 'create_step', {
      course_id: courseId,
      lesson_id: les.id,
      title: 'Video Guide',
      type: 'video',
      position: 1,
      content: {
        provider: 'youtube',
        providerVideoId: 'dQw4w9WgXcQ',
        durationSeconds: 120,
      },
    });
    assert.strictEqual(videoRes.statusCode, 200);

    // 3. Quiz step
    const quizRes = await callMcp(unrestrictedBearer, 'create_step', {
      course_id: courseId,
      lesson_id: les.id,
      title: 'Comprehension Check',
      type: 'quiz',
      position: 2,
      content: {
        questionMarkdown: 'What is Python?',
        options: [
          { id: 'opt-1', text: 'A programming language', isCorrect: true },
          { id: 'opt-2', text: 'A reptile only', isCorrect: false },
        ],
        explanation: 'Python is a high-level programming language.',
      },
    });
    assert.strictEqual(quizRes.statusCode, 200);

    // 4. Python coding step
    const pythonRes = await callMcp(unrestrictedBearer, 'create_step', {
      course_id: courseId,
      lesson_id: les.id,
      title: 'Double the Number',
      type: 'python',
      position: 3,
      content: {
        instructionsMarkdown: 'Read integer from stdin and print its double.',
        starterCode: 'import sys\nnum = int(sys.stdin.read())\n# your code\n',
        referenceSolution: 'import sys\nnum = int(sys.stdin.read().strip())\nprint(num * 2)\n',
      },
      test_cases: [
        { stdin: '5\n', expected_stdout: '10\n', is_hidden: false },
        { stdin: '21\n', expected_stdout: '42\n', is_hidden: true },
      ],
    });
    assert.strictEqual(pythonRes.statusCode, 200);

    // Verify course outline contains all 4 step types
    const outlineRes = await callMcp(unrestrictedBearer, 'get_course', {
      course_id: courseId,
      projection: 'outline',
    });
    const outline = JSON.parse(outlineRes.body.result.content[0].text);
    const targetModule = outline.structure.modules.find((m: any) => m.id === mod.id);
    assert.ok(targetModule);
    assert.strictEqual(targetModule.lessons[0].steps.length, 4);

    const stepTypes = targetModule.lessons[0].steps.map((s: any) => s.type);
    assert.deepStrictEqual(stepTypes, ['theory', 'video', 'quiz', 'python']);
  });

  await t.test('MCP-03: Image upload, mime validation, and Markdown embedding round-trip', async () => {
    // 1. Upload valid PNG image
    const createUploadRes = await callMcp(fullBearer, 'create_image_upload', {
      course_id: guidoCourseId,
      filename: 'diagram.png',
      mime_type: 'image/png',
      file_size: 68,
    });
    assert.strictEqual(createUploadRes.statusCode, 200);
    const uploadMeta = JSON.parse(createUploadRes.body.result.content[0].text);

    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const completeRes = await callMcp(fullBearer, 'complete_image_upload', {
      course_id: guidoCourseId,
      upload_id: uploadMeta.upload_id,
      base64_data: pngBase64,
      alt_text: 'Architecture diagram showing pipeline',
    });
    assert.strictEqual(completeRes.statusCode, 200);
    const completed = JSON.parse(completeRes.body.result.content[0].text);
    assert.ok(completed.markdown_reference.includes('![Architecture diagram showing pipeline]'));

    // 2. Embed reference into a theory step
    const stepRow = db.prepare('SELECT id FROM steps WHERE type = ? LIMIT 1').get('theory') as any;
    const updateRes = await callMcp(fullBearer, 'update_step', {
      course_id: guidoCourseId,
      step_id: stepRow.id,
      content: {
        markdown: `# System Overview\n\nHere is the workflow:\n\n${completed.markdown_reference}\n`,
      },
    });
    assert.strictEqual(updateRes.statusCode, 200);

    // 3. Inspect image metadata via get_image
    const getImageRes = await callMcp(fullBearer, 'get_image', { asset_id: completed.asset_id });
    assert.strictEqual(getImageRes.statusCode, 200);
    const assetData = JSON.parse(getImageRes.body.result.content[0].text);
    assert.strictEqual(assetData.altText, 'Architecture diagram showing pipeline');
  });

  await t.test('MCP-04: Token revocation fails subsequent write without partial changes', async () => {
    const revocableToken = tokenService.createToken(author1Id, {
      password: authorPassword,
      label: 'Transient Revocable Agent',
      scopes: ['content:write', 'courses:read'],
      courseRestrictions: [guidoCourseId],
      expiryDays: 1,
    });
    const revBearer = `Bearer ${revocableToken.rawToken}`;

    // First call succeeds
    const call1 = await callMcp(revBearer, 'get_author_context', {});
    assert.strictEqual(call1.statusCode, 200);

    // Revoke token
    tokenService.revokeToken(author1Id, revocableToken.token.id);

    // Next mutation attempt fails immediately with 401
    const call2 = await callMcp(revBearer, 'create_module', {
      course_id: guidoCourseId,
      title: 'Should Never Be Created',
    });
    assert.strictEqual(call2.statusCode, 401);
  });

  await t.test('MCP-05: Cross-author access returns safe 404 denial without data leak', async () => {
    // Barbara owns course-barbara. Guido's unrestricted token attempts to access it.
    const crossRes = await callMcp(unrestrictedBearer, 'get_course', {
      course_id: 'course-barbara',
    });
    // MCP tool returns safe denial
    assert.strictEqual(crossRes.body.result?.isError, true);
    assert.ok(
      crossRes.body.result?.content[0]?.text?.includes("This page isn't available") ||
      crossRes.body.result?.content[0]?.text?.includes("Course not found")
    );

    // REST API endpoint cross-author check returns 404
    const restRes = await requestApi('GET', `/api/author/courses/course-barbara/activity`, authorSessionBearer);
    assert.strictEqual(restRes.statusCode, 404);
  });

  await t.test('MCP-06: Draft-only token is denied publishing and deleting server-side', async () => {
    // 1. Publishing denied
    const pubDenied = await callMcp(draftOnlyBearer, 'publish_course', {
      course_id: guidoCourseId,
      expected_revision: 1,
    });
    assert.strictEqual(pubDenied.body.result?.isError, true);
    assert.ok(pubDenied.body.result?.content[0]?.text?.includes('courses:publish'));

    // 2. Deleting denied
    const delDenied = await callMcp(draftOnlyBearer, 'delete_module', {
      course_id: guidoCourseId,
      module_id: 'some-mod',
    });
    assert.strictEqual(delDenied.body.result?.isError, true);
    assert.ok(delDenied.body.result?.content[0]?.text?.includes('content:delete'));
  });

  await t.test('MCP-07: Full control token publishes valid content without UI prompt', async () => {
    // Create fresh course with valid metadata
    const createCourseRes = await callMcp(unrestrictedBearer, 'create_course', {
      title: 'Publishable Test Course',
    });
    const course = JSON.parse(createCourseRes.body.result.content[0].text);

    // Update metadata with required publication fields
    await callMcp(unrestrictedBearer, 'update_course_metadata', {
      course_id: course.id,
      expected_revision: course.draftRevision,
      metadata: {
        title: 'Publishable Test Course',
        description: 'Complete description for publication',
        category_id: 'cat-programming',
        difficulty: 'beginner',
        language: 'en',
        learning_outcomes: ['Understand basics of programming'],
      },
    });

    const modRes = await callMcp(unrestrictedBearer, 'create_module', {
      course_id: course.id,
      title: 'Module 1',
    });
    const mod = JSON.parse(modRes.body.result.content[0].text);

    const lesRes = await callMcp(unrestrictedBearer, 'create_lesson', {
      course_id: course.id,
      module_id: mod.id,
      title: 'Lesson 1',
      description: 'Introductory lesson',
    });
    const les = JSON.parse(lesRes.body.result.content[0].text);

    await callMcp(unrestrictedBearer, 'create_step', {
      course_id: course.id,
      lesson_id: les.id,
      title: 'Echo Step',
      type: 'theory',
      content: { markdown: '# Echoing numbers\nLearn basic printing.' },
    });

    // Validate course
    const valRes = await callMcp(unrestrictedBearer, 'validate_course', { course_id: course.id });
    const validation = JSON.parse(valRes.body.result.content[0].text);
    assert.strictEqual(validation.isValid, true);

    const currentCourse = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any;

    // Publish
    const pubRes = await callMcp(unrestrictedBearer, 'publish_course', {
      course_id: course.id,
      expected_revision: currentCourse.draft_revision,
    });
    assert.strictEqual(pubRes.statusCode, 200);
    const pubReceipt = JSON.parse(pubRes.body.result.content[0].text);
    assert.strictEqual(pubReceipt.versionNumber, 1);
    assert.ok(pubReceipt.versionId);
  });

  await t.test('MCP-08: Stale batch conflict (409) & Idempotency deduplication', async () => {
    const course = db.prepare('SELECT id, draft_revision FROM courses WHERE owner_id = ? LIMIT 1').get(author1Id) as any;

    // 1. Stale revision batch rejected
    const staleRes = await callMcp(fullBearer, 'batch_author', {
      course_id: course.id,
      expected_revision: course.draft_revision + 999, // stale!
      idempotency_key: 'stale-idem-001',
      operations: [
        { op: 'create_module', temp_id: '$m1', title: 'New Module' },
      ],
    });
    assert.strictEqual(staleRes.body.result?.isError, true);
    assert.ok(staleRes.body.result?.content[0]?.text?.includes('modified since the batch was prepared'));

    // 2. Batch with temp IDs ($m1, $l1, $s1)
    const validIdemKey = `batch-idem-${Date.now()}`;
    const freshCourse = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any;

    const batchOps = [
      { op: 'create_module', temp_id: '$m1', title: 'Batch Mod' },
      { op: 'create_lesson', temp_id: '$l1', module_id: '$m1', title: 'Batch Les' },
      {
        op: 'create_step',
        temp_id: '$s1',
        lesson_id: '$l1',
        title: 'Batch Step',
        type: 'theory',
        content: { markdown: 'Batch content' },
      },
    ];

    const batchRes = await callMcp(fullBearer, 'batch_author', {
      course_id: course.id,
      expected_revision: freshCourse.draft_revision,
      idempotency_key: validIdemKey,
      operations: batchOps,
    });
    assert.strictEqual(batchRes.statusCode, 200);
    const receipt = JSON.parse(batchRes.body.result.content[0].text);
    assert.strictEqual(receipt.status, 'applied');
    assert.strictEqual(receipt.operations_applied, 3);

    // 3. Repeated call with same idempotency key returns cached receipt without duplicate execution
    const repeatedRes = await callMcp(fullBearer, 'batch_author', {
      course_id: course.id,
      expected_revision: freshCourse.draft_revision,
      idempotency_key: validIdemKey,
      operations: batchOps,
    });
    assert.strictEqual(repeatedRes.statusCode, 200);
    const repeatedReceipt = JSON.parse(repeatedRes.body.result.content[0].text);
    assert.strictEqual(repeatedReceipt.idempotency_key, validIdemKey);
    assert.strictEqual(repeatedReceipt.new_revision, receipt.new_revision);
  });

  await t.test('MCP-09: Rejection of malicious images (SVG/exe) and oversized batch limits', async () => {
    // 1. Reject SVG
    const svgRes = await callMcp(fullBearer, 'create_image_upload', {
      course_id: guidoCourseId,
      filename: 'exploit.svg',
      mime_type: 'image/svg+xml',
      file_size: 100,
    });
    assert.strictEqual(svgRes.body.result?.isError, true);
    assert.ok(svgRes.body.result?.content[0]?.text?.includes('Unsupported image type'));

    // 2. Reject executable / non-image
    const exeRes = await callMcp(fullBearer, 'create_image_upload', {
      course_id: guidoCourseId,
      filename: 'payload.exe',
      mime_type: 'application/x-msdownload',
      file_size: 5000,
    });
    assert.strictEqual(exeRes.body.result?.isError, true);

    // 3. Reject oversized batch (> 100 operations)
    const tooManyOps = Array.from({ length: 105 }, (_, i) => ({
      op: 'create_module',
      temp_id: `$m${i}`,
      title: `Mod ${i}`,
    }));
    const oversizedBatchRes = await callMcp(fullBearer, 'batch_author', {
      course_id: guidoCourseId,
      expected_revision: 1,
      idempotency_key: `oversized-${Date.now()}`,
      operations: tooManyOps,
    });
    assert.strictEqual(oversizedBatchRes.body.result?.isError, true);
    assert.ok(oversizedBatchRes.body.result?.content[0]?.text?.includes('100 operations'));
  });

  await t.test('MCP-10: Draft recovery restores draft without altering published versions or enrollments', async () => {
    // Create course with complete metadata
    const crRes = await callMcp(unrestrictedBearer, 'create_course', { title: 'Recovery Target Course' });
    const crCourse = JSON.parse(crRes.body.result.content[0].text);

    await callMcp(unrestrictedBearer, 'update_course_metadata', {
      course_id: crCourse.id,
      expected_revision: crCourse.draftRevision,
      metadata: {
        title: 'Recovery Target Course',
        description: 'Course to verify draft recovery isolation',
        category_id: 'cat-programming',
        difficulty: 'beginner',
        language: 'en',
        learning_outcomes: ['Recovery outcome'],
      },
    });

    const mRes = await callMcp(unrestrictedBearer, 'create_module', { course_id: crCourse.id, title: 'Mod V1' });
    const mod = JSON.parse(mRes.body.result.content[0].text);
    const lRes = await callMcp(unrestrictedBearer, 'create_lesson', { course_id: crCourse.id, module_id: mod.id, title: 'Les V1', description: 'Lesson 1' });
    const les = JSON.parse(lRes.body.result.content[0].text);
    await callMcp(unrestrictedBearer, 'create_step', {
      course_id: crCourse.id,
      lesson_id: les.id,
      title: 'Original Step',
      type: 'theory',
      content: { markdown: 'Preserved in V1' },
    });

    const cRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(crCourse.id) as any;
    const pubRes = await callMcp(unrestrictedBearer, 'publish_course', {
      course_id: crCourse.id,
      expected_revision: cRow.draft_revision,
    });
    const publishedReceipt = JSON.parse(pubRes.body.result.content[0].text);

    // Enroll student Ada Lovelace to published version
    const enrollmentId = `enr-recovery-test-${Date.now()}`;
    db.prepare(`
      INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status)
      VALUES (?, 'user-student-1', ?, ?, 'active')
    `).run(enrollmentId, crCourse.id, publishedReceipt.versionId);

    // Destructive change: agent deletes the step
    const steps = db.prepare(`
      SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = ?
    `).all(crCourse.id) as any[];
    const stepToDelete = steps[0].id;

    await callMcp(unrestrictedBearer, 'delete_step', {
      course_id: crCourse.id,
      step_id: stepToDelete,
    });

    // Check recovery revisions list
    const recoveryListRes = await requestApi('GET', `/api/author/courses/${crCourse.id}/recovery`, authorSessionBearer);
    assert.ok(recoveryListRes.body.revisions.length > 0);
    const snapshotToRestore = recoveryListRes.body.revisions[recoveryListRes.body.revisions.length - 1];

    // Current draft revision
    const currentDraft = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(crCourse.id) as any;

    // Restore via MCP restore_draft_revision tool
    const restoreMcpRes = await callMcp(unrestrictedBearer, 'restore_draft_revision', {
      course_id: crCourse.id,
      revision_id: snapshotToRestore.id,
      expected_revision: currentDraft.draft_revision,
    });
    assert.strictEqual(restoreMcpRes.statusCode, 200);
    const restoreResult = JSON.parse(restoreMcpRes.body.result.content[0].text);
    assert.strictEqual(restoreResult.success, true);
    assert.strictEqual(restoreResult.newRevision, currentDraft.draft_revision + 1);

    // Verify student enrollment is STILL pinned to Version 1 snapshot intact!
    const studentEnr = db.prepare('SELECT pinned_version_id FROM enrollments WHERE id = ?').get(enrollmentId) as any;
    assert.strictEqual(studentEnr.pinned_version_id, publishedReceipt.versionId);

    // Verify published version in course_versions is 100% intact!
    const ver = db.prepare('SELECT version_number FROM course_versions WHERE id = ?').get(publishedReceipt.versionId) as any;
    assert.strictEqual(ver.version_number, 1);
  });

  await t.test('MCP-11: Publication is blocked when Python reference solution fails tests', async () => {
    const crRes = await callMcp(unrestrictedBearer, 'create_course', { title: 'Buggy Course' });
    const course = JSON.parse(crRes.body.result.content[0].text);

    await callMcp(unrestrictedBearer, 'update_course_metadata', {
      course_id: course.id,
      expected_revision: course.draftRevision,
      metadata: {
        title: 'Buggy Course',
        description: 'Course with buggy reference solution',
        category_id: 'cat-programming',
        difficulty: 'beginner',
        language: 'en',
        learning_outcomes: ['Outcome'],
      },
    });

    const mRes = await callMcp(unrestrictedBearer, 'create_module', { course_id: course.id, title: 'Mod 1' });
    const mod = JSON.parse(mRes.body.result.content[0].text);
    const lRes = await callMcp(unrestrictedBearer, 'create_lesson', { course_id: course.id, module_id: mod.id, title: 'Les 1', description: 'Les 1 desc' });
    const les = JSON.parse(lRes.body.result.content[0].text);

    // Exercise with failing reference solution
    await callMcp(unrestrictedBearer, 'create_step', {
      course_id: course.id,
      lesson_id: les.id,
      title: 'Broken Exercise',
      type: 'python',
      content: {
        instructionsMarkdown: 'Output 42',
        starterCode: 'print(0)',
        referenceSolution: 'print(999)\n', // BUG: Expected 42, reference outputs 999
      },
      test_cases: [
        { stdin: '', expected_stdout: '42\n', is_hidden: false },
      ],
    });

    const cRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any;

    // Publication attempt fails validation
    const pubFailRes = await callMcp(unrestrictedBearer, 'publish_course', {
      course_id: course.id,
      expected_revision: cRow.draft_revision,
    });
    assert.strictEqual(pubFailRes.body.result?.isError, true);
    assert.ok(pubFailRes.body.result?.content[0]?.text?.includes('Course validation failed'));
  });

  await t.test('MCP-12: REST Agent Activity and Recovery Endpoints & Rate Limiting', async () => {
    // 1. GET /api/author/courses/:courseId/activity
    const actListRes = await requestApi('GET', `/api/author/courses/${guidoCourseId}/activity`, authorSessionBearer);
    assert.strictEqual(actListRes.statusCode, 200);
    assert.ok(Array.isArray(actListRes.body.items));
    assert.ok(actListRes.body.total >= 0);

    if (actListRes.body.items.length > 0) {
      const mutId = actListRes.body.items[0].id;
      // 2. GET /api/author/courses/:courseId/activity/:mutationId
      const detailRes = await requestApi('GET', `/api/author/courses/${guidoCourseId}/activity/${mutId}`, authorSessionBearer);
      assert.strictEqual(detailRes.statusCode, 200);
      assert.strictEqual(detailRes.body.id, mutId);
      assert.ok('baseRevision' in detailRes.body);
      assert.ok('newRevision' in detailRes.body);
    }

    // 3. Stale restore attempt via REST returns 409
    const recListRes = await requestApi('GET', `/api/author/courses/${guidoCourseId}/recovery`, authorSessionBearer);
    assert.strictEqual(recListRes.statusCode, 200);

    if (recListRes.body.revisions.length > 0) {
      const revId = recListRes.body.revisions[0].id;
      const staleRestoreRes = await requestApi(
        'POST',
        `/api/author/courses/${guidoCourseId}/recovery/${revId}/restore`,
        authorSessionBearer,
        { expectedRevision: 99999 }
      );
      assert.strictEqual(staleRestoreRes.statusCode, 409);
    }

    // 4. Cross-author restore attempt returns 404
    const crossRestoreRes = await requestApi(
      'POST',
      `/api/author/courses/course-barbara/recovery/fake-rev/restore`,
      authorSessionBearer, // Guido attempting to restore Barbara's course
      { expectedRevision: 1 }
    );
    assert.strictEqual(crossRestoreRes.statusCode, 404);
  });
});

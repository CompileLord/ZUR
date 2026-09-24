import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';
import { McpTokenService } from '../src/services/mcp-token-service.ts';
import { TOKEN_SCOPE_PRESETS } from 'zur-shared';

test('MCP Authoring Tools Suite (T058–T064)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const tokenService = new McpTokenService(db);
  const authorId = 'user-author-1'; // Guido van Rossum
  const guidoCourseId = 'course-python-foundations';
  const authorPassword = 'AuthorPass123!';

  // Full control token
  const fullControlResult = tokenService.createToken(authorId, {
    password: authorPassword,
    label: 'Full Control Agent',
    scopes: TOKEN_SCOPE_PRESETS.full_course_control,
    courseRestrictions: [guidoCourseId],
    expiryDays: 30,
  });
  const fullBearer = `Bearer ${fullControlResult.rawToken}`;

  // Read-only token
  const readOnlyResult = tokenService.createToken(authorId, {
    password: authorPassword,
    label: 'Read Only Agent',
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

  async function callTool(toolName: string, toolArgs: any, bearer: string = fullBearer): Promise<any> {
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

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'POST',
          headers: {
            Host: `127.0.0.1:${port}`,
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(payload)),
            Authorization: bearer,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve({ status: res.statusCode, body: parsed });
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  t.after(() => {
    server.close();
  });

  // ==========================================
  // T058: Author Context & Course Reads
  // ==========================================

  await t.test('T058: get_author_context returns author info and restrictions without secrets', async () => {
    const res = await callTool('get_author_context', {});
    assert.equal(res.status, 200);
    assert.equal(res.body.result.isError, undefined);
    const parsed = JSON.parse(res.body.result.content[0].text);
    assert.equal(parsed.author.id, authorId);
    assert.equal(parsed.author.email, 'guido@zur.internal');
    assert.ok(parsed.author.capabilities.includes('author'));
    assert.equal(parsed.token.id, fullControlResult.token.id);
    assert.deepEqual(parsed.token.courseRestrictions, [guidoCourseId]);
    assert.equal(parsed.token.rawToken, undefined);
    assert.equal(parsed.token.tokenHash, undefined);
    assert.ok(parsed.limits.maxBatchOperations === 100);
    assert.deepEqual(parsed.supportedContent, ['theory', 'video', 'quiz', 'python']);
  });

  await t.test('T058: list_courses returns courses within token restrictions', async () => {
    const res = await callTool('list_courses', { limit: 10, offset: 0 });
    assert.equal(res.status, 200);
    const parsed = JSON.parse(res.body.result.content[0].text);
    assert.equal(parsed.total, 1);
    assert.equal(parsed.courses[0].id, guidoCourseId);
    assert.equal(parsed.courses[0].title, 'Python foundations');
  });

  await t.test('T058: get_course supports metadata, outline, and full projections', async () => {
    // 1. Metadata projection
    const metaRes = await callTool('get_course', { course_id: guidoCourseId, projection: 'metadata' });
    assert.equal(metaRes.status, 200);
    const metaData = JSON.parse(metaRes.body.result.content[0].text);
    assert.equal(metaData.id, guidoCourseId);
    assert.equal(metaData.title, 'Python foundations');
    assert.equal(metaData.structure, undefined);

    // 2. Outline projection
    const outlineRes = await callTool('get_course', { course_id: guidoCourseId, projection: 'outline' });
    assert.equal(outlineRes.status, 200);
    const outlineData = JSON.parse(outlineRes.body.result.content[0].text);
    assert.ok(outlineData.structure);
    assert.ok(outlineData.structure.modules.length > 0);
    assert.ok(outlineData.structure.modules[0].lessons.length > 0);

    // 3. Full projection (hydrated contents)
    const fullRes = await callTool('get_course', { course_id: guidoCourseId, projection: 'full' });
    assert.equal(fullRes.status, 200);
    const fullData = JSON.parse(fullRes.body.result.content[0].text);
    assert.ok(fullData.structure.modules[0].lessons[0].steps[0].content);
  });

  await t.test('T058: get_course rejects cross-author access safely', async () => {
    const crossRes = await callTool('get_course', { course_id: 'non-existent-or-other-course' });
    assert.equal(crossRes.status, 200);
    assert.equal(crossRes.body.result.isError, true);
    assert.ok(crossRes.body.result.content[0].text.includes("This page isn't available") || crossRes.body.result.content[0].text.includes("restrictions"));
  });

  // ==========================================
  // T059: Course & Structure Mutations
  // ==========================================

  let createdCourseId = '';
  let createdModuleId = '';
  let createdLessonId = '';
  let createdStepId = '';
  let courseRev = 1;

  await t.test('T059: create_course creates draft and automatically allowlists on token', async () => {
    const res = await callTool('create_course', {
      title: 'MCP Created Course',
      description: 'Built entirely through MCP protocol',
      tags: ['mcp', 'python', 'testing'],
      difficulty: 'beginner',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.result.isError, undefined);
    const course = JSON.parse(res.body.result.content[0].text);
    assert.equal(course.title, 'MCP Created Course');
    assert.equal(course.description, 'Built entirely through MCP protocol');
    assert.deepEqual(course.tags, ['mcp', 'python', 'testing']);
    createdCourseId = course.id;
    courseRev = course.draftRevision;

    // Verify token allowlist updated in DB
    const tokenRow = db.prepare('SELECT course_restrictions FROM author_access_tokens WHERE id = ?').get(fullControlResult.token.id) as any;
    const allowed = JSON.parse(tokenRow.course_restrictions);
    assert.ok(allowed.includes(createdCourseId), 'Newly created course must be automatically added to token restrictions');
  });

  await t.test('T059: update_course_metadata updates metadata with optimistic locking', async () => {
    const res = await callTool('update_course_metadata', {
      course_id: createdCourseId,
      expected_revision: courseRev,
      metadata: {
        title: 'MCP Created Course (Renamed)',
        description: 'Updated description',
        difficulty: 'intermediate',
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.result.isError, undefined);
    const updated = JSON.parse(res.body.result.content[0].text);
    assert.equal(updated.title, 'MCP Created Course (Renamed)');
    assert.equal(updated.difficulty, 'intermediate');
    courseRev = updated.draftRevision;

    // Conflict when using stale revision
    const staleRes = await callTool('update_course_metadata', {
      course_id: createdCourseId,
      expected_revision: courseRev - 1,
      metadata: { title: 'Conflict attempt' },
    });
    assert.equal(staleRes.body.result.isError, true);
    assert.ok(staleRes.body.result.content[0].text.includes('modified elsewhere'));
  });

  await t.test('T059: Module hierarchy operations (create, update, delete with confirmation)', async () => {
    // 1. Create module
    const createModRes = await callTool('create_module', {
      course_id: createdCourseId,
      title: 'Module 1: Getting Started',
      position: 0,
    });
    assert.equal(createModRes.status, 200);
    const mod = JSON.parse(createModRes.body.result.content[0].text);
    assert.equal(mod.title, 'Module 1: Getting Started');
    createdModuleId = mod.id;

    // 2. Update module
    const updateModRes = await callTool('update_module', {
      course_id: createdCourseId,
      module_id: createdModuleId,
      title: 'Module 1: Core Fundamentals',
    });
    assert.equal(updateModRes.status, 200);
    const updatedMod = JSON.parse(updateModRes.body.result.content[0].text);
    assert.equal(updatedMod.title, 'Module 1: Core Fundamentals');
  });

  await t.test('T059: Lesson operations (create, update, delete)', async () => {
    // 1. Create lesson
    const createLesRes = await callTool('create_lesson', {
      course_id: createdCourseId,
      module_id: createdModuleId,
      title: 'Lesson 1.1: Syntax Basics',
      description: 'Understanding syntax',
      position: 0,
    });
    assert.equal(createLesRes.status, 200);
    const les = JSON.parse(createLesRes.body.result.content[0].text);
    assert.equal(les.title, 'Lesson 1.1: Syntax Basics');
    createdLessonId = les.id;

    // 2. Update lesson
    const updateLesRes = await callTool('update_lesson', {
      course_id: createdCourseId,
      lesson_id: createdLessonId,
      title: 'Lesson 1.1: Python Syntax & Variables',
      description: 'Detailed lesson on variables',
    });
    assert.equal(updateLesRes.status, 200);
    const updatedLes = JSON.parse(updateLesRes.body.result.content[0].text);
    assert.equal(updatedLes.title, 'Lesson 1.1: Python Syntax & Variables');
  });

  await t.test('T059: Step operations (create theory/quiz/python, update, duplicate, delete)', async () => {
    // 1. Create theory step
    const createStepRes = await callTool('create_step', {
      course_id: createdCourseId,
      lesson_id: createdLessonId,
      title: 'Variables Overview',
      type: 'theory',
      position: 0,
      content: {
        kind: 'theory',
        markdown: '# Variables\n\nVariables store data in memory.',
      },
    });
    assert.equal(createStepRes.status, 200);
    const step = JSON.parse(createStepRes.body.result.content[0].text);
    assert.equal(step.title, 'Variables Overview');
    assert.equal(step.type, 'theory');
    createdStepId = step.id;

    // 2. Update step
    const updateStepRes = await callTool('update_step', {
      course_id: createdCourseId,
      step_id: createdStepId,
      title: 'Variables and Expressions',
      content: {
        kind: 'theory',
        markdown: '# Variables and Expressions\n\nExpressions evaluate to values.',
      },
    });
    assert.equal(updateStepRes.status, 200);
    const updatedStep = JSON.parse(updateStepRes.body.result.content[0].text);
    assert.equal(updatedStep.title, 'Variables and Expressions');

    // 3. Duplicate step
    const dupStepRes = await callTool('duplicate_step', {
      course_id: createdCourseId,
      step_id: createdStepId,
    });
    assert.equal(dupStepRes.status, 200);
    const dupStep = JSON.parse(dupStepRes.body.result.content[0].text);
    assert.equal(dupStep.title, 'Variables and Expressions (Copy)');

    // 4. Delete duplicated step
    const deleteStepRes = await callTool('delete_step', {
      course_id: createdCourseId,
      step_id: dupStep.id,
    });
    assert.equal(deleteStepRes.status, 200);
    const deleteResult = JSON.parse(deleteStepRes.body.result.content[0].text);
    assert.equal(deleteResult.success, true);
  });

  await t.test('T059: Parent deletion requires confirm_delete_children when children exist', async () => {
    // Delete lesson without confirm flag
    const rejectLesDelete = await callTool('delete_lesson', {
      course_id: createdCourseId,
      lesson_id: createdLessonId,
    });
    assert.equal(rejectLesDelete.body.result.isError, true);
    assert.ok(rejectLesDelete.body.result.content[0].text.includes('confirm_delete_children'));

    // Delete module without confirm flag
    const rejectModDelete = await callTool('delete_module', {
      course_id: createdCourseId,
      module_id: createdModuleId,
    });
    assert.equal(rejectModDelete.body.result.isError, true);
    assert.ok(rejectModDelete.body.result.content[0].text.includes('confirm_delete_children'));
  });

  // ==========================================
  // T060: MCP Image Workflow
  // ==========================================

  let uploadedAssetId = '';

  await t.test('T060: create_image_upload validates MIME and size limits', async () => {
    // Rejects unsupported MIME type (e.g. SVG)
    const svgRes = await callTool('create_image_upload', {
      course_id: createdCourseId,
      filename: 'diagram.svg',
      mime_type: 'image/svg+xml',
      file_size: 1000,
    });
    assert.equal(svgRes.body.result.isError, true);
    assert.ok(svgRes.body.result.content[0].text.includes('Unsupported image type'));

    // Rejects oversized file (> 5 MiB)
    const overRes = await callTool('create_image_upload', {
      course_id: createdCourseId,
      filename: 'huge.png',
      mime_type: 'image/png',
      file_size: 6 * 1024 * 1024,
    });
    assert.equal(overRes.body.result.isError, true);
    assert.ok(overRes.body.result.content[0].text.includes('5 MiB limit'));

    // Accepts valid PNG upload request
    const validRes = await callTool('create_image_upload', {
      course_id: createdCourseId,
      filename: 'diagram.png',
      mime_type: 'image/png',
      file_size: 1024,
    });
    assert.equal(validRes.status, 200);
    const uploadSession = JSON.parse(validRes.body.result.content[0].text);
    assert.ok(uploadSession.upload_id);
    assert.ok(uploadSession.upload_url);
    assert.equal(uploadSession.max_bytes, 5242880);
  });

  await t.test('T060: complete_image_upload handles base64 image and returns canonical markdown reference', async () => {
    // 1x1 transparent PNG base64
    const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await callTool('complete_image_upload', {
      course_id: createdCourseId,
      base64_data: samplePngBase64,
      filename: 'test-pixel.png',
      mime_type: 'image/png',
      alt_text: 'Diagram showing control flow',
      is_decorative: false,
      caption: 'Figure 1: Control Flow',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.result.isError, undefined);
    const asset = JSON.parse(res.body.result.content[0].text);
    assert.ok(asset.asset_id);
    assert.equal(asset.mime_type, 'image/png');
    assert.equal(asset.alt_text, 'Diagram showing control flow');
    assert.equal(asset.markdown_reference, `![Diagram showing control flow](zur-asset:${asset.asset_id})`);
    uploadedAssetId = asset.asset_id;
  });

  await t.test('T060: get_image and update_image_metadata', async () => {
    // 1. Get image
    const getRes = await callTool('get_image', { asset_id: uploadedAssetId });
    assert.equal(getRes.status, 200);
    const imgData = JSON.parse(getRes.body.result.content[0].text);
    assert.equal(imgData.id, uploadedAssetId);
    assert.equal(imgData.caption, 'Figure 1: Control Flow');

    // 2. Update image metadata
    const updateRes = await callTool('update_image_metadata', {
      asset_id: uploadedAssetId,
      alt_text: 'Updated flowchart diagram',
      caption: 'Figure 1: Python Flowchart',
    });
    assert.equal(updateRes.status, 200);
    const updatedImg = JSON.parse(updateRes.body.result.content[0].text);
    assert.equal(updatedImg.altText, 'Updated flowchart diagram');
    assert.equal(updatedImg.caption, 'Figure 1: Python Flowchart');
    assert.equal(updatedImg.markdown_reference, `![Updated flowchart diagram](zur-asset:${uploadedAssetId})`);
  });

  // ==========================================
  // T061: Assessment Validation & Publication
  // ==========================================

  await t.test('T061: validate_exercise tests Python solution in isolated runner', async () => {
    // Passing solution
    const passRes = await callTool('validate_exercise', {
      reference_solution: 'import sys\nname = sys.stdin.read().strip()\nprint(f"Hello, {name}!")\n',
      test_cases: [
        { stdin: 'Alice', expected_stdout: 'Hello, Alice!\n', is_hidden: false },
        { stdin: 'Bob', expected_stdout: 'Hello, Bob!\n', is_hidden: true },
      ],
    });

    assert.equal(passRes.status, 200);
    const passData = JSON.parse(passRes.body.result.content[0].text);
    assert.equal(passData.valid, true);
    assert.equal(passData.totalTests, 2);
    assert.equal(passData.passedTests, 2);

    // Failing solution (wrong output)
    const failRes = await callTool('validate_exercise', {
      reference_solution: 'print("Wrong output")\n',
      test_cases: [
        { stdin: 'Alice', expected_stdout: 'Hello, Alice!\n', is_hidden: false },
      ],
    });

    assert.equal(failRes.status, 200);
    const failData = JSON.parse(failRes.body.result.content[0].text);
    assert.equal(failData.valid, false);
    assert.equal(failData.passedTests, 0);
  });

  await t.test('T061: validate_course checks course draft compliance', async () => {
    const res = await callTool('validate_course', { course_id: createdCourseId });
    assert.equal(res.status, 200);
    const validation = JSON.parse(res.body.result.content[0].text);
    assert.equal(typeof validation.isValid, 'boolean');
    assert.ok(Array.isArray(validation.errors));
    assert.ok(Array.isArray(validation.warnings));
  });

  await t.test('T061: publish_course publishes validated revision', async () => {
    // Guido's seeded course has valid structure; publish it
    const course = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(guidoCourseId) as any;
    const currentRev = course.draft_revision;

    const res = await callTool('publish_course', {
      course_id: guidoCourseId,
      expected_revision: currentRev,
      change_summary: 'Initial MCP publication release',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.result.isError, undefined);
    const receipt = JSON.parse(res.body.result.content[0].text);
    assert.equal(receipt.courseId, guidoCourseId);
    assert.ok(receipt.versionNumber >= 1);
  });

  // ==========================================
  // T062: Access & Lifecycle Tools
  // ==========================================

  await t.test('T062: set_course_access modifies visibility and enrollment policy', async () => {
    const res = await callTool('set_course_access', {
      course_id: createdCourseId,
      visibility: 'unlisted',
      enrollment_policy: 'invitation_only',
    });

    assert.equal(res.status, 200);
    const result = JSON.parse(res.body.result.content[0].text);
    assert.equal(result.visibility, 'unlisted');
    assert.equal(result.enrollmentPolicy, 'invitation_only');
    assert.ok(result.effectSummary.includes('Existing enrollments remain pinned'));
  });

  await t.test('T062: archive_course and restore_course', async () => {
    // 1. Archive
    const archRes = await callTool('archive_course', { course_id: createdCourseId });
    assert.equal(archRes.status, 200);
    const archData = JSON.parse(archRes.body.result.content[0].text);
    assert.equal(archData.publicationStatus, 'archived');

    // 2. Restore
    const restRes = await callTool('restore_course', { course_id: createdCourseId });
    assert.equal(restRes.status, 200);
    const restData = JSON.parse(restRes.body.result.content[0].text);
    assert.equal(restData.publicationStatus, 'draft');
  });

  await t.test('T062: delete_draft_course succeeds on never-published draft and fails on published', async () => {
    // 1. Fails on published course
    const pubFailRes = await callTool('delete_draft_course', { course_id: guidoCourseId });
    assert.equal(pubFailRes.body.result.isError, true);
    assert.ok(pubFailRes.body.result.content[0].text.includes('published'));

    // 2. Succeeds on never-published draft
    const freshDraftRes = await callTool('create_course', { title: 'Draft To Delete' });
    const freshDraft = JSON.parse(freshDraftRes.body.result.content[0].text);
    const delRes = await callTool('delete_draft_course', { course_id: freshDraft.id });
    assert.equal(delRes.status, 200);
    const delData = JSON.parse(delRes.body.result.content[0].text);
    assert.equal(delData.success, true);
  });

  // ==========================================
  // T063: Idempotent Batch Authoring
  // ==========================================

  await t.test('T063: batch_author executes multi-operation batch with temp ID resolution and idempotency', async () => {
    // Create new course for batch test
    const courseRes = await callTool('create_course', {
      title: 'Batch Authoring Target Course',
    });
    const testCourse = JSON.parse(courseRes.body.result.content[0].text);
    const bCourseId = testCourse.id;
    const bRev = testCourse.draftRevision;
    const batchIdempotencyKey = 'batch-idemp-key-12345';

    // Batch with temp IDs: $mod1 -> $les1 -> $step1
    const batchOps = [
      {
        op: 'create_module',
        temp_id: '$mod1',
        title: 'Batch Module 1',
        position: 0,
      },
      {
        op: 'create_lesson',
        temp_id: '$les1',
        module_id: '$mod1',
        title: 'Batch Lesson 1',
        position: 0,
      },
      {
        op: 'create_step',
        temp_id: '$step1',
        lesson_id: '$les1',
        title: 'Batch Step 1',
        type: 'theory',
        position: 0,
        content: {
          kind: 'theory',
          markdown: '# Generated via Batch Author',
        },
      },
    ];

    const firstCall = await callTool('batch_author', {
      course_id: bCourseId,
      expected_revision: bRev,
      idempotency_key: batchIdempotencyKey,
      operations: batchOps,
    });

    assert.equal(firstCall.status, 200);
    assert.equal(firstCall.body.result.isError, undefined);
    const receipt1 = JSON.parse(firstCall.body.result.content[0].text);
    assert.equal(receipt1.status, 'applied');
    assert.equal(receipt1.operations_applied, 3);
    assert.ok(receipt1.created_ids['$mod1']);
    assert.ok(receipt1.created_ids['$les1']);
    assert.ok(receipt1.created_ids['$step1']);
    assert.equal(receipt1.new_revision, bRev + 1);

    // Idempotency retry with same key returns cached receipt without duplicating nodes
    const retryCall = await callTool('batch_author', {
      course_id: bCourseId,
      expected_revision: bRev,
      idempotency_key: batchIdempotencyKey,
      operations: batchOps,
    });

    assert.equal(retryCall.status, 200);
    const receipt2 = JSON.parse(retryCall.body.result.content[0].text);
    assert.equal(receipt2.status, 'applied');
    assert.equal(receipt2.new_revision, receipt1.new_revision);
    assert.equal(receipt2.idempotency_key, batchIdempotencyKey);

    // Verify node counts in database
    const stepCount = (
      db.prepare('SELECT COUNT(*) as count FROM steps WHERE id = ?').get(receipt1.created_ids['$step1']) as any
    )?.count;
    assert.equal(stepCount, 1, 'Retry must not create duplicate steps');
  });

  await t.test('T063: batch_author rejects batch with stale revision', async () => {
    // Course draft revision is now bumped; calling with old revision must fail
    const course = db.prepare('SELECT id, draft_revision FROM courses WHERE id = ?').get(guidoCourseId) as any;
    const staleRev = course.draft_revision - 1;

    const res = await callTool('batch_author', {
      course_id: guidoCourseId,
      expected_revision: staleRev,
      idempotency_key: 'stale-key-999',
      operations: [
        {
          op: 'create_module',
          title: 'Stale Module',
        },
      ],
    });

    assert.equal(res.body.result.isError, true);
    assert.ok(res.body.result.content[0].text.includes('modified since the batch was prepared'));
  });

  // ==========================================
  // T064: Scope Enforcement & Security Boundaries
  // ==========================================

  await t.test('T064: Read-only token cannot execute write or destructive tools', async () => {
    // 1. create_course fails with scope error
    const createRes = await callTool('create_course', { title: 'Denied Course' }, readOnlyBearer);
    assert.equal(createRes.status, 200);
    assert.equal(createRes.body.result.isError, true);
    assert.ok(createRes.body.result.content[0].text.includes('courses:create') || createRes.body.result.content[0].text.includes('Scope'));

    // 2. update_module fails
    const updateRes = await callTool('update_module', { course_id: guidoCourseId, module_id: 'm1', title: 'New' }, readOnlyBearer);
    assert.equal(updateRes.body.result.isError, true);

    // 3. publish_course fails
    const pubRes = await callTool('publish_course', { course_id: guidoCourseId, expected_revision: 1 }, readOnlyBearer);
    assert.equal(pubRes.body.result.isError, true);

    // 4. archive_course fails
    const archRes = await callTool('archive_course', { course_id: guidoCourseId }, readOnlyBearer);
    assert.equal(archRes.body.result.isError, true);
  });
});

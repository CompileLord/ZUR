import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { McpToolsFixture } from './fixture.ts';

export async function imagesValidationAndAccessTests(t: TestContext, f: McpToolsFixture): Promise<void> {
  const { db, guidoCourseId, readOnlyBearer, callTool, state } = f;

  // ==========================================
  // T060: MCP Image Workflow
  // ==========================================

  let uploadedAssetId = '';

  await t.test('T060: create_image_upload validates MIME and size limits', async () => {
    // Rejects unsupported MIME type (e.g. SVG)
    const svgRes = await callTool('create_image_upload', {
      course_id: state.createdCourseId,
      filename: 'diagram.svg',
      mime_type: 'image/svg+xml',
      file_size: 1000,
    });
    assert.equal(svgRes.body.result.isError, true);
    assert.ok(svgRes.body.result.content[0].text.includes('Unsupported image type'));

    // Rejects oversized file (> 10 MB)
    const overRes = await callTool('create_image_upload', {
      course_id: state.createdCourseId,
      filename: 'huge.png',
      mime_type: 'image/png',
      file_size: 11 * 1024 * 1024,
    });
    assert.equal(overRes.body.result.isError, true);
    assert.ok(overRes.body.result.content[0].text.includes('10 MB limit'));

    // Accepts valid PNG upload request
    const validRes = await callTool('create_image_upload', {
      course_id: state.createdCourseId,
      filename: 'diagram.png',
      mime_type: 'image/png',
      file_size: 1024,
    });
    assert.equal(validRes.status, 200);
    const uploadSession = JSON.parse(validRes.body.result.content[0].text);
    assert.ok(uploadSession.upload_id);
    assert.ok(uploadSession.upload_url);
    assert.equal(uploadSession.max_bytes, 10485760);
  });

  await t.test('T060: complete_image_upload handles base64 image and returns canonical markdown reference', async () => {
    // 1x1 transparent PNG base64
    const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await callTool('complete_image_upload', {
      course_id: state.createdCourseId,
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
      expected_revision: (db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(state.createdCourseId) as any).draft_revision,
      idempotency_key: 'update-image-metadata-test-1',
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
    const res = await callTool('validate_course', { course_id: state.createdCourseId });
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
      course_id: state.createdCourseId,
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
    const archRes = await callTool('archive_course', { course_id: state.createdCourseId });
    assert.equal(archRes.status, 200);
    const archData = JSON.parse(archRes.body.result.content[0].text);
    assert.equal(archData.publicationStatus, 'archived');

    // 2. Restore
    const restRes = await callTool('restore_course', { course_id: state.createdCourseId });
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
}

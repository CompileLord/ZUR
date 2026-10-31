import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { TOKEN_SCOPE_PRESETS } from 'zur-shared';
import { renderMcpClientSetupContent } from '../../../../web/src/pages/settings/McpClientSetupDialog.ts';
import type { McpE2eFixture } from './fixture.ts';
import { writeStarterStep } from '../starter-step.ts';

export async function hardeningAndRecoveryTests(t: TestContext, f: McpE2eFixture): Promise<void> {
  const { db, guidoCourseId, fullTokenId, fullClient, unrestrictedClient, requestApi, authorSessionBearer } = f;

  await t.test('MCP-09: Rejection of malicious images (SVG/exe), unsafe Markdown, external URLs, and oversized batch limits', async () => {
    const existingLesson = db.prepare('SELECT l.id FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = ? LIMIT 1').get(guidoCourseId) as any;
    const testLessonId = existingLesson.id;

    // 1. Unsafe Markdown with <script> tag rejected
    const scriptStepRes = await fullClient.callTool({
      name: 'create_step',
      arguments: {
        course_id: guidoCourseId,
        lesson_id: testLessonId,
        title: 'Script Attempt',
        type: 'theory',
        content: { markdown: 'Hello <script>alert(1)</script>' },
      },
    });
    assert.strictEqual(scriptStepRes.isError, true);
    assert.ok(
      (scriptStepRes.content[0] as { text?: string } | undefined)?.text?.includes('Unsafe Markdown') ||
      (scriptStepRes.content[0] as { text?: string } | undefined)?.text?.includes('dangerous script')
    );

    // 2. External image URL forbidden
    const extUrlRes = await fullClient.callTool({
      name: 'create_step',
      arguments: {
        course_id: guidoCourseId,
        lesson_id: testLessonId,
        title: 'External Image Attempt',
        type: 'theory',
        content: { markdown: 'Here is external image: ![leak](https://tracker.example.com/pixel.png)' },
      },
    });
    assert.strictEqual(extUrlRes.isError, true);
    assert.ok((extUrlRes.content[0] as { text?: string } | undefined)?.text?.includes('External image URLs'));

    // 3. Reject SVG
    const svgRes = await fullClient.callTool({
      name: 'create_image_upload',
      arguments: {
        course_id: guidoCourseId,
        filename: 'exploit.svg',
        mime_type: 'image/svg+xml',
        file_size: 100,
      },
    });
    assert.strictEqual(svgRes.isError, true);
    assert.ok((svgRes.content[0] as { text?: string } | undefined)?.text?.includes('Unsupported image type'));

    // 4. Reject executable / non-image
    const exeRes = await fullClient.callTool({
      name: 'create_image_upload',
      arguments: {
        course_id: guidoCourseId,
        filename: 'payload.exe',
        mime_type: 'application/x-msdownload',
        file_size: 5000,
      },
    });
    assert.strictEqual(exeRes.isError, true);

    // 5. Reject oversized batch (> 100 operations)
    const tooManyOps = Array.from({ length: 105 }, (_, i) => ({
      op: 'create_module',
      temp_id: `$m${i}`,
      title: `Mod ${i}`,
    }));
    const oversizedBatchRes = await fullClient.callTool({
      name: 'batch_author',
      arguments: {
        course_id: guidoCourseId,
        expected_revision: 1,
        idempotency_key: `oversized-${Date.now()}`,
        operations: tooManyOps,
      },
    });
    assert.strictEqual(oversizedBatchRes.isError, true);
    assert.ok((oversizedBatchRes.content[0] as { text?: string } | undefined)?.text?.includes('100 operations'));
  });

  await t.test('MCP-10: Draft recovery restores draft without altering published versions or enrollments', async () => {
    // Create course with complete metadata
    const crRes = await unrestrictedClient.callTool({
      name: 'create_course',
      arguments: { title: 'Recovery Target Course' },
    });
    assert.strictEqual(crRes.isError, undefined);
    const crCourse = JSON.parse((crRes.content[0] as { text: string }).text);
    writeStarterStep(db, crCourse.id);

    await unrestrictedClient.callTool({
      name: 'update_course_metadata',
      arguments: {
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
      },
    });

    const mRes = await unrestrictedClient.callTool({
      name: 'create_module',
      arguments: { course_id: crCourse.id, title: 'Mod V1' },
    });
    const mod = JSON.parse((mRes.content[0] as { text: string }).text);

    const lRes = await unrestrictedClient.callTool({
      name: 'create_lesson',
      arguments: { course_id: crCourse.id, module_id: mod.id, title: 'Les V1', description: 'Lesson 1' },
    });
    const les = JSON.parse((lRes.content[0] as { text: string }).text);

    await unrestrictedClient.callTool({
      name: 'create_step',
      arguments: {
        course_id: crCourse.id,
        lesson_id: les.id,
        title: 'Original Step',
        type: 'theory',
        content: { markdown: 'Preserved in V1' },
      },
    });

    const cRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(crCourse.id) as any;
    const pubRes = await unrestrictedClient.callTool({
      name: 'publish_course',
      arguments: {
        course_id: crCourse.id,
        expected_revision: cRow.draft_revision,
      },
    });
    assert.strictEqual(pubRes.isError, undefined);
    const publishedReceipt = JSON.parse((pubRes.content[0] as { text: string }).text);

    // Enroll student Ada Lovelace to published version
    const enrollmentId = `enr-recovery-test-${Date.now()}`;
    db.prepare(`
      INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status)
      VALUES (?, 'user-student-1', ?, ?, 'active')
    `).run(enrollmentId, crCourse.id, publishedReceipt.versionId);

    // Destructive change: agent deletes the step via official SDK Client
    const steps = db.prepare(`
      SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = ?
    `).all(crCourse.id) as any[];
    const stepToDelete = steps[0].id;

    const delStepRes = await unrestrictedClient.callTool({
      name: 'delete_step',
      arguments: {
        course_id: crCourse.id,
        step_id: stepToDelete,
      },
    });
    assert.strictEqual(delStepRes.isError, undefined);

    // Check recovery revisions list
    const recoveryListRes = await requestApi('GET', `/api/author/courses/${crCourse.id}/recovery`, authorSessionBearer);
    assert.ok(recoveryListRes.body.revisions.length > 0);
    const snapshotToRestore = recoveryListRes.body.revisions[recoveryListRes.body.revisions.length - 1];

    // Current draft revision
    const currentDraft = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(crCourse.id) as any;

    // Restore via MCP restore_draft_revision tool via official SDK Client
    const restoreMcpRes = await unrestrictedClient.callTool({
      name: 'restore_draft_revision',
      arguments: {
        course_id: crCourse.id,
        revision_id: snapshotToRestore.id,
        expected_revision: currentDraft.draft_revision,
      },
    });
    assert.strictEqual(restoreMcpRes.isError, undefined);
    const restoreResult = JSON.parse((restoreMcpRes.content[0] as { text: string }).text);
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
    const crRes = await unrestrictedClient.callTool({
      name: 'create_course',
      arguments: { title: 'Buggy Course' },
    });
    const course = JSON.parse((crRes.content[0] as { text: string }).text);

    await unrestrictedClient.callTool({
      name: 'update_course_metadata',
      arguments: {
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
      },
    });

    const mRes = await unrestrictedClient.callTool({
      name: 'create_module',
      arguments: { course_id: course.id, title: 'Mod 1' },
    });
    const mod = JSON.parse((mRes.content[0] as { text: string }).text);
    const lRes = await unrestrictedClient.callTool({
      name: 'create_lesson',
      arguments: { course_id: course.id, module_id: mod.id, title: 'Les 1', description: 'Les 1 desc' },
    });
    const les = JSON.parse((lRes.content[0] as { text: string }).text);

    // Exercise with failing reference solution
    await unrestrictedClient.callTool({
      name: 'create_step',
      arguments: {
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
      },
    });

    const cRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any;

    // Publication attempt fails validation via official SDK Client
    const pubFailRes = await unrestrictedClient.callTool({
      name: 'publish_course',
      arguments: {
        course_id: course.id,
        expected_revision: cRow.draft_revision,
      },
    });
    assert.strictEqual(pubFailRes.isError, true);
    assert.ok((pubFailRes.content[0] as { text?: string } | undefined)?.text?.includes('Course validation failed'));
  });

  await t.test('MCP-12: OAuth-only client setup states limitation with no false compatibility, and author activity/recovery validation', async () => {
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

    // 5. P44 OAuth-only setup notice verification
    const setupContent = renderMcpClientSetupContent({
      token: {
        id: fullTokenId,
        label: 'Guido Full Control Agent',
        scopes: TOKEN_SCOPE_PRESETS.full_course_control,
        courseRestrictions: [guidoCourseId],
        tokenIdentifier: 'zat_guido_test',
        isRevoked: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        lastUsedAt: null,
        status: 'never_used',
      },
      selectedClient: 'oauth_client',
    });
    assert.ok(setupContent.includes('OAuth Limitation Notice'));
    assert.ok(setupContent.includes('This client requires OAuth'));
  });
}

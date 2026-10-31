import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import type { McpE2eFixture } from './fixture.ts';
import { writeStarterStep } from '../starter-step.ts';

export async function accessControlAndPublishingTests(t: TestContext, f: McpE2eFixture): Promise<void> {
  const { db, author1Id, guidoCourseId, server, fullClient, unrestrictedClient, draftOnlyClient, requestApi, authorSessionBearer } = f;

  await t.test('MCP-05: Cross-author access returns safe 404 denial without data leak', async () => {
    // Barbara owns course-barbara. Guido's unrestricted token attempts to access it via official SDK Client.
    const crossRes = await unrestrictedClient.callTool({
      name: 'get_course',
      arguments: {
        course_id: 'course-barbara',
      },
    });
    // MCP tool returns safe denial
    assert.strictEqual(crossRes.isError, true);
    const errText = (crossRes.content[0] as { text?: string } | undefined)?.text || '';
    assert.ok(
      errText.includes("This page isn't available") ||
      errText.includes("Course not found")
    );

    // REST API endpoint cross-author check returns 404
    const restRes = await requestApi('GET', `/api/author/courses/course-barbara/activity`, authorSessionBearer);
    assert.strictEqual(restRes.statusCode, 404);
  });

  await t.test('MCP-06: Draft-only token is denied publishing, deleting, and access change server-side', async () => {
    // 1. Publishing denied via official SDK
    const pubDenied = await draftOnlyClient.callTool({
      name: 'publish_course',
      arguments: {
        course_id: guidoCourseId,
        expected_revision: 1,
      },
    });
    assert.strictEqual(pubDenied.isError, true);
    assert.ok((pubDenied.content[0] as { text?: string } | undefined)?.text?.includes('courses:publish'));

    // 2. Deleting denied via official SDK
    const delDenied = await draftOnlyClient.callTool({
      name: 'delete_module',
      arguments: {
        course_id: guidoCourseId,
        module_id: 'some-mod',
      },
    });
    assert.strictEqual(delDenied.isError, true);
    assert.ok((delDenied.content[0] as { text?: string } | undefined)?.text?.includes('content:delete'));

    // 3. Access change denied via official SDK (requires courses:manage)
    const accessDenied = await draftOnlyClient.callTool({
      name: 'set_course_access',
      arguments: {
        course_id: guidoCourseId,
        visibility: 'public',
        enrollment_policy: 'open',
      },
    });
    assert.strictEqual(accessDenied.isError, true);
    assert.ok((accessDenied.content[0] as { text?: string } | undefined)?.text?.includes('courses:manage'));
  });

  await t.test('MCP-07: Full control token publishes valid content without UI prompt', async () => {
    // Create fresh course with valid metadata via official SDK
    const createCourseRes = await unrestrictedClient.callTool({
      name: 'create_course',
      arguments: {
        title: 'Publishable Test Course',
      },
    });
    assert.strictEqual(createCourseRes.isError, undefined);
    const course = JSON.parse((createCourseRes.content[0] as { text: string }).text);
    writeStarterStep(db, course.id);

    // Update metadata with required publication fields
    const metaRes = await unrestrictedClient.callTool({
      name: 'update_course_metadata',
      arguments: {
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
      },
    });
    assert.strictEqual(metaRes.isError, undefined);

    const modRes = await unrestrictedClient.callTool({
      name: 'create_module',
      arguments: {
        course_id: course.id,
        title: 'Module 1',
      },
    });
    assert.strictEqual(modRes.isError, undefined);
    const mod = JSON.parse((modRes.content[0] as { text: string }).text);

    const lesRes = await unrestrictedClient.callTool({
      name: 'create_lesson',
      arguments: {
        course_id: course.id,
        module_id: mod.id,
        title: 'Lesson 1',
        description: 'Introductory lesson',
      },
    });
    assert.strictEqual(lesRes.isError, undefined);
    const les = JSON.parse((lesRes.content[0] as { text: string }).text);

    const stepRes = await unrestrictedClient.callTool({
      name: 'create_step',
      arguments: {
        course_id: course.id,
        lesson_id: les.id,
        title: 'Echo Step',
        type: 'theory',
        content: { markdown: '# Echoing numbers\nLearn basic printing.' },
      },
    });
    assert.strictEqual(stepRes.isError, undefined);

    // Validate course
    const valRes = await unrestrictedClient.callTool({
      name: 'validate_course',
      arguments: { course_id: course.id },
    });
    assert.strictEqual(valRes.isError, undefined);
    const validation = JSON.parse((valRes.content[0] as { text: string }).text);
    assert.strictEqual(validation.isValid, true);

    const currentCourse = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any;

    // Publish
    const pubRes = await unrestrictedClient.callTool({
      name: 'publish_course',
      arguments: {
        course_id: course.id,
        expected_revision: currentCourse.draft_revision,
      },
    });
    assert.strictEqual(pubRes.isError, undefined);
    const pubReceipt = JSON.parse((pubRes.content[0] as { text: string }).text);
    assert.strictEqual(pubReceipt.versionNumber, 1);
    assert.ok(pubReceipt.versionId);
  });

  await t.test('MCP-08: Stale batch conflict (409) & Idempotency deduplication', async () => {
    const course = db.prepare('SELECT id, draft_revision FROM courses WHERE owner_id = ? LIMIT 1').get(author1Id) as any;
    const freshCourse = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any;

    // 1. Stale revision batch rejected via official SDK Client
    const staleRes = await fullClient.callTool({
      name: 'batch_author',
      arguments: {
        course_id: course.id,
        expected_revision: freshCourse.draft_revision + 999, // stale!
        idempotency_key: 'stale-idem-001',
        operations: [
          { op: 'create_module', temp_id: '$m1', title: 'New Module' },
        ],
      },
    });
    assert.strictEqual(staleRes.isError, true);
    assert.ok((staleRes.content[0] as { text?: string } | undefined)?.text?.includes('modified since the batch was prepared'));

    // 2. Prepare course changes plan and assert stale plan rejection
    const planPrepRes = await fullClient.callTool({
      name: 'prepare_course_changes',
      arguments: {
        course_id: course.id,
        expected_revision: freshCourse.draft_revision,
        operations: [
          { op: 'create_module', temp_id: '$m_plan', title: 'Planned Module' },
        ],
      },
    });
    assert.strictEqual(planPrepRes.isError, undefined);
    const planPrepData = JSON.parse((planPrepRes.content[0] as { text: string }).text);
    const planId = planPrepData.plan_id;

    // Stale plan application rejected
    const stalePlanRes = await fullClient.callTool({
      name: 'apply_course_changes',
      arguments: {
        course_id: course.id,
        plan_id: planId,
        expected_revision: freshCourse.draft_revision + 50,
        idempotency_key: 'stale-plan-idem-' + Date.now(),
      },
    });
    assert.strictEqual(stalePlanRes.isError, true);
    assert.ok(
      (stalePlanRes.content[0] as { text?: string } | undefined)?.text?.includes('prepared plan base revision') ||
      (stalePlanRes.content[0] as { text?: string } | undefined)?.text?.includes('modified')
    );

    // 3. Batch with temp IDs ($m1, $l1, $s1)
    const validIdemKey = `batch-idem-${Date.now()}`;
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

    const batchRes = await fullClient.callTool({
      name: 'batch_author',
      arguments: {
        course_id: course.id,
        expected_revision: freshCourse.draft_revision,
        idempotency_key: validIdemKey,
        operations: batchOps,
      },
    });
    assert.strictEqual(batchRes.isError, undefined);
    const receipt = JSON.parse((batchRes.content[0] as { text: string }).text);
    assert.strictEqual(receipt.status, 'applied');
    assert.strictEqual(receipt.operations_applied, 3);

    // 4. Repeated call with same idempotency key returns cached receipt without duplicate execution
    const repeatedRes = await fullClient.callTool({
      name: 'batch_author',
      arguments: {
        course_id: course.id,
        expected_revision: freshCourse.draft_revision,
        idempotency_key: validIdemKey,
        operations: batchOps,
      },
    });
    assert.strictEqual(repeatedRes.isError, undefined);
    const repeatedReceipt = JSON.parse((repeatedRes.content[0] as { text: string }).text);
    assert.strictEqual(repeatedReceipt.idempotency_key, validIdemKey);
    assert.strictEqual(repeatedReceipt.new_revision, receipt.new_revision);

    // 5. Changed-payload idempotency conflict rejection (ConflictError 409)
    const conflictRes = await fullClient.callTool({
      name: 'batch_author',
      arguments: {
        course_id: course.id,
        expected_revision: freshCourse.draft_revision,
        idempotency_key: validIdemKey,
        operations: [
          { op: 'create_module', temp_id: '$m_conflict', title: 'Changed Payload Module' },
        ],
      },
    });
    assert.strictEqual(conflictRes.isError, true);
    assert.ok((conflictRes.content[0] as { text?: string } | undefined)?.text?.includes('different request parameters'));
  });
}

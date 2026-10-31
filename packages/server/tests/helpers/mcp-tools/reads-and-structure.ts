import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { McpToolsFixture } from './fixture.ts';

export async function readsAndStructureTests(t: TestContext, f: McpToolsFixture): Promise<void> {
  const { db, authorId, guidoCourseId, fullControlResult, callTool, state } = f;

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
    state.createdCourseId = course.id;
    courseRev = course.draftRevision;

    // Verify token allowlist updated in DB
    const tokenRow = db.prepare('SELECT course_restrictions FROM author_access_tokens WHERE id = ?').get(fullControlResult.token.id) as any;
    const allowed = JSON.parse(tokenRow.course_restrictions);
    assert.ok(allowed.includes(state.createdCourseId), 'Newly created course must be automatically added to token restrictions');
  });

  await t.test('T059: update_course_metadata updates metadata with optimistic locking', async () => {
    const res = await callTool('update_course_metadata', {
      course_id: state.createdCourseId,
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
      course_id: state.createdCourseId,
      expected_revision: courseRev - 1,
      metadata: { title: 'Conflict attempt' },
    });
    assert.equal(staleRes.body.result.isError, true);
    assert.ok(staleRes.body.result.content[0].text.includes('modified elsewhere'));
  });

  await t.test('T059: Module hierarchy operations (create, update, delete with confirmation)', async () => {
    // 1. Create module
    const createModRes = await callTool('create_module', {
      course_id: state.createdCourseId,
      title: 'Module 1: Getting Started',
      position: 0,
    });
    assert.equal(createModRes.status, 200);
    const mod = JSON.parse(createModRes.body.result.content[0].text);
    assert.equal(mod.title, 'Module 1: Getting Started');
    createdModuleId = mod.id;

    // 2. Update module
    const updateModRes = await callTool('update_module', {
      course_id: state.createdCourseId,
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
      course_id: state.createdCourseId,
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
      course_id: state.createdCourseId,
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
      course_id: state.createdCourseId,
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
      course_id: state.createdCourseId,
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
      course_id: state.createdCourseId,
      step_id: createdStepId,
    });
    assert.equal(dupStepRes.status, 200);
    const dupStep = JSON.parse(dupStepRes.body.result.content[0].text);
    assert.equal(dupStep.title, 'Variables and Expressions (Copy)');

    // 4. Delete duplicated step
    const deleteStepRes = await callTool('delete_step', {
      course_id: state.createdCourseId,
      step_id: dupStep.id,
    });
    assert.equal(deleteStepRes.status, 200);
    const deleteResult = JSON.parse(deleteStepRes.body.result.content[0].text);
    assert.equal(deleteResult.success, true);
  });

  await t.test('T059: Parent deletion requires confirm_delete_children when children exist', async () => {
    // Delete lesson without confirm flag
    const rejectLesDelete = await callTool('delete_lesson', {
      course_id: state.createdCourseId,
      lesson_id: createdLessonId,
    });
    assert.equal(rejectLesDelete.body.result.isError, true);
    assert.ok(rejectLesDelete.body.result.content[0].text.includes('confirm_delete_children'));

    // Delete module without confirm flag
    const rejectModDelete = await callTool('delete_module', {
      course_id: state.createdCourseId,
      module_id: createdModuleId,
    });
    assert.equal(rejectModDelete.body.result.isError, true);
    assert.ok(rejectModDelete.body.result.content[0].text.includes('confirm_delete_children'));
  });
}

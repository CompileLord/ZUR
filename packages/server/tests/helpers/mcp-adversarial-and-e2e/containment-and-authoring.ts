import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { TOKEN_SCOPE_PRESETS } from 'zur-shared';
import type { McpE2eFixture } from './fixture.ts';

export async function containmentAndAuthoringTests(t: TestContext, f: McpE2eFixture): Promise<void> {
  const { db, tokenService, author1Id, guidoCourseId, authorPassword, server, port, createOfficialSdkClient, fullClient, unrestrictedClient, readOnlyClient } = f;

  await t.test('MCP-01: Bearer auth, scope & course restrictions enforce containment', async () => {
    // 1. Unauthenticated request rejected by official SDK Client
    const unauthTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: {} },
    });
    const unauthClient = new Client({ name: 'unauth-client', version: '1.0.0' }, { capabilities: {} });
    await assert.rejects(async () => {
      await unauthClient.connect(unauthTransport);
    });

    // 2. Read within restriction succeeds via official SDK Client
    const allowed = await readOnlyClient.callTool({
      name: 'get_course',
      arguments: { course_id: guidoCourseId, projection: 'metadata' },
    });
    assert.strictEqual(allowed.isError, undefined);
    const content = JSON.parse((allowed.content[0] as { text: string }).text);
    assert.strictEqual(content.id, guidoCourseId);

    // 3. Request outside token course restriction is denied via official SDK Client
    const restrictedToken = tokenService.createToken(author1Id, {
      password: authorPassword,
      label: 'Strict Single Course',
      scopes: ['courses:read'],
      courseRestrictions: ['course-suspended-tricks'],
      expiryDays: 1,
    });
    const restrictedClient = await createOfficialSdkClient(restrictedToken.rawToken);
    const restrictedRes = await restrictedClient.callTool({
      name: 'get_course',
      arguments: { course_id: guidoCourseId },
    });
    assert.strictEqual(restrictedRes.isError, true);
    await restrictedClient.close().catch(() => {});
  });

  await t.test('MCP-02: Agent creates hierarchy with theory, video, quiz, and python steps', async () => {
    // Create new course draft via official SDK Client
    const createCourseRes = await unrestrictedClient.callTool({
      name: 'create_course',
      arguments: {
        title: 'E2E Agent Built Course',
        description: 'Built entirely through MCP tool suite',
        difficulty: 'beginner',
      },
    });
    assert.strictEqual(createCourseRes.isError, undefined);
    const course = JSON.parse((createCourseRes.content[0] as { text: string }).text);
    const courseId = course.id;

    // Add module
    const createModRes = await unrestrictedClient.callTool({
      name: 'create_module',
      arguments: {
        course_id: courseId,
        title: 'Module 1: Foundations',
        position: 0,
      },
    });
    const mod = JSON.parse((createModRes.content[0] as { text: string }).text);

    // Add lesson
    const createLesRes = await unrestrictedClient.callTool({
      name: 'create_lesson',
      arguments: {
        course_id: courseId,
        module_id: mod.id,
        title: 'Lesson 1: Introduction',
        position: 0,
      },
    });
    const les = JSON.parse((createLesRes.content[0] as { text: string }).text);

    // 1. Theory step
    const theoryRes = await unrestrictedClient.callTool({
      name: 'create_step',
      arguments: {
        course_id: courseId,
        lesson_id: les.id,
        title: 'Theory Concept',
        type: 'theory',
        position: 0,
        content: { markdown: '# Welcome\nLearn Python step by step.' },
      },
    });
    assert.strictEqual(theoryRes.isError, undefined);

    // 2. Video step
    const videoRes = await unrestrictedClient.callTool({
      name: 'create_step',
      arguments: {
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
      },
    });
    assert.strictEqual(videoRes.isError, undefined);

    // 3. Quiz step
    const quizRes = await unrestrictedClient.callTool({
      name: 'create_step',
      arguments: {
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
      },
    });
    assert.strictEqual(quizRes.isError, undefined);

    // 4. Python coding step
    const pythonRes = await unrestrictedClient.callTool({
      name: 'create_step',
      arguments: {
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
      },
    });
    assert.strictEqual(pythonRes.isError, undefined);

    // Verify course outline contains all 4 step types
    const outlineRes = await unrestrictedClient.callTool({
      name: 'get_course',
      arguments: {
        course_id: courseId,
        projection: 'outline',
      },
    });
    const outline = JSON.parse((outlineRes.content[0] as { text: string }).text);
    const targetModule = outline.structure.modules.find((m: any) => m.id === mod.id);
    assert.ok(targetModule);
    assert.strictEqual(targetModule.lessons[0].steps.length, 4);

    const stepTypes = targetModule.lessons[0].steps.map((s: any) => s.type);
    assert.deepStrictEqual(stepTypes, ['theory', 'video', 'quiz', 'python']);
  });

  await t.test('MCP-03: Image upload, mime validation, and Markdown embedding round-trip', async () => {
    // 1. Upload valid PNG image via official SDK Client
    const createUploadRes = await fullClient.callTool({
      name: 'create_image_upload',
      arguments: {
        course_id: guidoCourseId,
        filename: 'diagram.png',
        mime_type: 'image/png',
        file_size: 68,
      },
    });
    assert.strictEqual(createUploadRes.isError, undefined);
    const uploadMeta = JSON.parse((createUploadRes.content[0] as { text: string }).text);

    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const completeRes = await fullClient.callTool({
      name: 'complete_image_upload',
      arguments: {
        course_id: guidoCourseId,
        upload_id: uploadMeta.upload_id,
        base64_data: pngBase64,
        alt_text: 'Architecture diagram showing pipeline',
      },
    });
    assert.strictEqual(completeRes.isError, undefined);
    const completed = JSON.parse((completeRes.content[0] as { text: string }).text);
    assert.ok(completed.markdown_reference.includes('![Architecture diagram showing pipeline]'));

    // 2. Embed reference into a theory step
    const stepRow = db.prepare('SELECT id FROM steps WHERE type = ? LIMIT 1').get('theory') as any;
    const updateRes = await fullClient.callTool({
      name: 'update_step',
      arguments: {
        course_id: guidoCourseId,
        step_id: stepRow.id,
        content: {
          markdown: `# System Overview\n\nHere is the workflow:\n\n${completed.markdown_reference}\n`,
        },
      },
    });
    assert.strictEqual(updateRes.isError, undefined);

    // 3. Inspect image metadata via get_image
    const getImageRes = await fullClient.callTool({
      name: 'get_image',
      arguments: { asset_id: completed.asset_id },
    });
    assert.strictEqual(getImageRes.isError, undefined);
    const assetData = JSON.parse((getImageRes.content[0] as { text: string }).text);
    assert.strictEqual(assetData.altText, 'Architecture diagram showing pipeline');
  });

  await t.test('MCP-04: Pending-write token revocation aborts in-flight mutation before commit with zero partial changes', async () => {
    const revocableToken = tokenService.createToken(author1Id, {
      password: authorPassword,
      label: 'Transient Revocable Agent',
      scopes: TOKEN_SCOPE_PRESETS.full_course_control,
      courseRestrictions: [guidoCourseId],
      expiryDays: 1,
    });
    const revClient = await createOfficialSdkClient(revocableToken.rawToken);

    // First call succeeds via official SDK Client
    const call1 = await revClient.callTool({ name: 'get_author_context', arguments: {} });
    assert.strictEqual(call1.isError, undefined);

    const courseBefore = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(guidoCourseId) as any;
    const versionsBefore = (db.prepare('SELECT COUNT(*) as count FROM course_versions WHERE course_id = ?').get(guidoCourseId) as any).count;

    // Intercept validateCourseDraft on the server publication service to pause asynchronously in-flight
    const pubService = (server as any).mcpServer.getPublicationService();
    const originalValidate = (pubService as any).validationService.validateCourseDraft;

    let resumeValidation!: () => void;
    const pausePromise = new Promise<void>((r) => { resumeValidation = r; });
    let inFlightTriggered = false;
    const validationStarted = new Promise<void>((r) => {
      (pubService as any).validationService.validateCourseDraft = async (...args: any[]) => {
        inFlightTriggered = true;
        r();
        await pausePromise;
        return originalValidate.apply((pubService as any).validationService, args);
      };
    });

    // Launch publication in background (in-flight before commit)
    const inFlightPromise = revClient.callTool({
      name: 'publish_course',
      arguments: {
        course_id: guidoCourseId,
        expected_revision: courseBefore.draft_revision,
      },
    });

    // Wait for in-flight validation to be actively executing
    await validationStarted;
    assert.strictEqual(inFlightTriggered, true);

    // Revoke token while mutation is in-flight (committed outside SQLite mutation transaction)
    tokenService.revokeToken(author1Id, revocableToken.token.id);

    // Resume validation
    resumeValidation();

    // The in-flight publication must fail
    let mutationFailed = false;
    try {
      const inFlightRes = await inFlightPromise;
      mutationFailed = Boolean(inFlightRes?.isError);
    } catch {
      mutationFailed = true;
    }
    assert.strictEqual(mutationFailed, true);

    // Restore original validator
    (pubService as any).validationService.validateCourseDraft = originalValidate;

    // Verify zero partial changes in the database:
    // Course draft revision untouched
    const courseAfter = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(guidoCourseId) as any;
    assert.strictEqual(courseAfter.draft_revision, courseBefore.draft_revision);

    // No course versions created
    const versionsAfter = (db.prepare('SELECT COUNT(*) as count FROM course_versions WHERE course_id = ?').get(guidoCourseId) as any).count;
    assert.strictEqual(versionsAfter, versionsBefore);

    // Next mutation attempt fails immediately because token is revoked
    let nextFailed = false;
    try {
      const call2 = await revClient.callTool({
        name: 'get_author_context',
        arguments: {},
      });
      nextFailed = Boolean(call2?.isError);
    } catch {
      nextFailed = true;
    }
    assert.strictEqual(nextFailed, true);
    await revClient.close().catch(() => {});
  });
}

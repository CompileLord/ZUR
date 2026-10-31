import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { S3AuditFixture } from './fixture.ts';

export async function imagesContentAndOriginTests(t: TestContext, f: S3AuditFixture): Promise<void> {
  const { db, port, callMcp, samplePngBase64, state } = f;

  // --------------------------------------------------------------------------
  // S3-07: Image Attach, Detach, and Update
  // --------------------------------------------------------------------------
  await t.test('S3-07: attach_image, detach_image, and update_image tools', async () => {
    // Upload image inline
    const upRes = await callMcp({
      jsonrpc: '2.0',
      id: 50,
      method: 'tools/call',
      params: {
        name: 'complete_image_upload',
        arguments: {
          course_id: state.testCourseId,
          base64_data: samplePngBase64,
          filename: 'banner.png',
          alt_text: 'Original Banner',
        },
      },
    });
    const upData = JSON.parse(upRes.body.result.content[0].text);
    const imageId = upData.image_id;
    assert.ok(imageId);

    // Find a step in the course
    const stepRow = db.prepare("SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = ? LIMIT 1").get(state.testCourseId) as any;
    const stepId = stepRow.id;

    // 1. attach_image
    const attachRes = await callMcp({
      jsonrpc: '2.0',
      id: 51,
      method: 'tools/call',
      params: {
        name: 'attach_image',
        arguments: {
          course_id: state.testCourseId,
          asset_id: imageId,
          step_id: stepId,
          expected_revision: state.testCourseRevision,
          idempotency_key: 'image-attach-1',
        },
      },
    });
    assert.equal(attachRes.status, 200);
    const attachData = JSON.parse(attachRes.body.result.content[0].text);
    assert.equal(attachData.attached, true);
    const attachRetry = await callMcp({ jsonrpc: '2.0', id: 511, method: 'tools/call', params: {
      name: 'attach_image', arguments: { course_id: state.testCourseId, asset_id: imageId,
        step_id: stepId, expected_revision: state.testCourseRevision, idempotency_key: 'image-attach-1' },
    }});
    assert.deepEqual(JSON.parse(attachRetry.body.result.content[0].text), attachData);
    const changedRetry = await callMcp({ jsonrpc: '2.0', id: 512, method: 'tools/call', params: {
      name: 'attach_image', arguments: { course_id: state.testCourseId, asset_id: imageId,
        step_id: stepId, expected_revision: state.testCourseRevision, idempotency_key: 'image-attach-1', alt_text: 'Different' },
    }});
    assert.equal(changedRetry.body.result.isError, true);
    assert.match(changedRetry.body.result.content[0].text, /different request parameters/i);

    assert.ok(attachData.draft_revision > state.testCourseRevision);
    state.testCourseRevision = attachData.draft_revision;

    // 2. update_image
    const updateRes = await callMcp({
      jsonrpc: '2.0',
      id: 52,
      method: 'tools/call',
      params: {
        name: 'update_image',
        arguments: {
          course_id: state.testCourseId,
          asset_id: imageId,
          alt_text: 'Updated Alt Text',
          caption: 'Updated Caption',
          expected_revision: state.testCourseRevision,
          idempotency_key: 'image-update-1',
        },
      },
    });
    assert.equal(updateRes.status, 200);
    const updateData = JSON.parse(updateRes.body.result.content[0].text);
    assert.equal(updateData.alt_text, 'Updated Alt Text');
    assert.equal(updateData.caption, 'Updated Caption');
    assert.ok(updateData.draft_revision > state.testCourseRevision);
    state.testCourseRevision = updateData.draft_revision;

    // 3. detach_image
    const detachRes = await callMcp({
      jsonrpc: '2.0',
      id: 53,
      method: 'tools/call',
      params: {
        name: 'detach_image',
        arguments: {
          course_id: state.testCourseId,
          asset_id: imageId,
          step_id: stepId,
          expected_revision: state.testCourseRevision,
          idempotency_key: 'image-detach-1',
        },
      },
    });
    assert.equal(detachRes.status, 200);
    const detachData = JSON.parse(detachRes.body.result.content[0].text);
    assert.equal(detachData.detached, true);
    state.testCourseRevision = detachData.draft_revision;

    // 4. Missing required expected_revision or idempotency_key is rejected with ValidationError
    const missingRevUpdate = await callMcp({
      jsonrpc: '2.0',
      id: 54,
      method: 'tools/call',
      params: {
        name: 'update_image',
        arguments: {
          asset_id: imageId,
          alt_text: 'Missing Revision',
          idempotency_key: 'missing-rev-key',
        },
      },
    });
    assert.equal(missingRevUpdate.body.result.isError, true);
    assert.match(missingRevUpdate.body.result.content[0].text, /expected_revision integer is required/i);

    const missingKeyUpdate = await callMcp({
      jsonrpc: '2.0',
      id: 55,
      method: 'tools/call',
      params: {
        name: 'update_image',
        arguments: {
          asset_id: imageId,
          alt_text: 'Missing Key',
          expected_revision: state.testCourseRevision,
        },
      },
    });
    assert.equal(missingKeyUpdate.body.result.isError, true);
    assert.match(missingKeyUpdate.body.result.content[0].text, /idempotency_key is required/i);

    const missingRevAttach = await callMcp({
      jsonrpc: '2.0',
      id: 56,
      method: 'tools/call',
      params: {
        name: 'attach_image',
        arguments: {
          course_id: state.testCourseId,
          asset_id: imageId,
          step_id: stepId,
          idempotency_key: 'missing-rev-key',
        },
      },
    });
    assert.equal(missingRevAttach.body.result.isError, true);
    assert.match(missingRevAttach.body.result.content[0].text, /expected_revision integer is required/i);

    const missingRevDetach = await callMcp({
      jsonrpc: '2.0',
      id: 57,
      method: 'tools/call',
      params: {
        name: 'detach_image',
        arguments: {
          course_id: state.testCourseId,
          asset_id: imageId,
          step_id: stepId,
          idempotency_key: 'missing-rev-key',
        },
      },
    });
    assert.equal(missingRevDetach.body.result.isError, true);
    assert.match(missingRevDetach.body.result.content[0].text, /expected_revision integer is required/i);
  });

  // --------------------------------------------------------------------------
  // S3-08: Hierarchy Move and Duplicate
  // --------------------------------------------------------------------------
  await t.test('S3-08: move_content and duplicate_content for modules, lessons, and steps', async () => {
    // Create second module and lesson to move between
    const batchRes = await callMcp({
      jsonrpc: '2.0',
      id: 60,
      method: 'tools/call',
      params: {
        name: 'batch_author',
        arguments: {
          course_id: state.testCourseId,
          base_revision: state.testCourseRevision,
          idempotency_key: 'batch-test-move-dest',
          operations: [
            { type: 'create_module', temp_id: 'mod_dst', title: 'Destination Module' },
            { type: 'create_lesson', temp_id: 'les_dst', parent_temp_id: 'mod_dst', title: 'Destination Lesson' },
          ],
        },
      },
    });
    const batchData = JSON.parse(batchRes.body.result.content[0].text);
    state.testCourseRevision = batchData.draft_revision;
    const destModuleId = batchData.created_nodes.mod_dst;
    const destLessonId = batchData.created_nodes.les_dst;

    const sourceStep = db.prepare("SELECT s.id, s.title, s.lesson_id FROM steps s JOIN lessons l ON s.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = ? AND l.id != ? LIMIT 1").get(state.testCourseId, destLessonId) as any;

    // 1. move_content (step)
    const moveStepRes = await callMcp({
      jsonrpc: '2.0',
      id: 61,
      method: 'tools/call',
      params: {
        name: 'move_content',
        arguments: {
          course_id: state.testCourseId,
          content_type: 'step',
          id: sourceStep.id,
          target_parent_id: destLessonId,
          new_position: 0,
          expected_revision: state.testCourseRevision,
        },
      },
    });
    assert.equal(moveStepRes.status, 200);
    const moveData = JSON.parse(moveStepRes.body.result.content[0].text);
    assert.equal(moveData.content_type, 'step');
    assert.equal(moveData.new_parent_id, destLessonId);
    state.testCourseRevision = moveData.draft_revision;

    // 2. duplicate_content (lesson)
    const dupLessonRes = await callMcp({
      jsonrpc: '2.0',
      id: 62,
      method: 'tools/call',
      params: {
        name: 'duplicate_content',
        arguments: {
          course_id: state.testCourseId,
          content_type: 'lesson',
          id: destLessonId,
          target_parent_id: destModuleId,
          expected_revision: state.testCourseRevision,
        },
      },
    });
    assert.equal(dupLessonRes.status, 200);
    const dupData = JSON.parse(dupLessonRes.body.result.content[0].text);
    assert.equal(dupData.content_type, 'lesson');
    assert.ok(dupData.duplicate_id);
    assert.notEqual(dupData.duplicate_id, destLessonId);
    state.testCourseRevision = dupData.draft_revision;

    // 3. duplicate_content (module)
    const dupModRes = await callMcp({
      jsonrpc: '2.0',
      id: 63,
      method: 'tools/call',
      params: {
        name: 'duplicate_content',
        arguments: {
          course_id: state.testCourseId,
          content_type: 'module',
          id: destModuleId,
          expected_revision: state.testCourseRevision,
        },
      },
    });
    assert.equal(dupModRes.status, 200);
    const dupModData = JSON.parse(dupModRes.body.result.content[0].text);
    assert.equal(dupModData.content_type, 'module');
    assert.ok(dupModData.duplicate_id);
    state.testCourseRevision = dupModData.draft_revision;
  });

  // --------------------------------------------------------------------------
  // S3-09: list_agent_activity and get_change
  // --------------------------------------------------------------------------
  await t.test('S3-09: list_agent_activity and get_change detail view with diffs', async () => {
    // 1. list_agent_activity
    const listActRes = await callMcp({
      jsonrpc: '2.0',
      id: 70,
      method: 'tools/call',
      params: {
        name: 'list_agent_activity',
        arguments: {
          course_id: state.testCourseId,
          limit: 10,
        },
      },
    });
    assert.equal(listActRes.status, 200);
    const actData = JSON.parse(listActRes.body.result.content[0].text);
    assert.ok(Array.isArray(actData.mutations));
    assert.ok(actData.mutations.length > 0);
    assert.equal(actData.mutations[0].token_id, undefined); // secrets stripped

    const mutationId = actData.mutations[0].id;
    assert.ok(mutationId);

    // 2. get_change
    const getChangeRes = await callMcp({
      jsonrpc: '2.0',
      id: 71,
      method: 'tools/call',
      params: {
        name: 'get_change',
        arguments: {
          mutation_id: mutationId,
        },
      },
    });
    assert.equal(getChangeRes.status, 200);
    const changeData = JSON.parse(getChangeRes.body.result.content[0].text);
    assert.equal(changeData.id, mutationId);
    assert.equal(changeData.course_id, state.testCourseId);
    assert.ok(changeData.tool_name);
    assert.ok(changeData.diff !== undefined);
  });

  // --------------------------------------------------------------------------
  // S3-10: Strict Host and Restricted Origin Validation
  // --------------------------------------------------------------------------
  await t.test('S3-10: Strict Host header and restricted Origin validation', async () => {
    // 1. Untrusted Host header is rejected with 400
    const badHostRes = await callMcp(
      { jsonrpc: '2.0', id: 80, method: 'ping' },
      { Host: 'evil-attacker.com' }
    );
    assert.equal(badHostRes.status, 400);
    assert.equal(badHostRes.body.error.code, -32600);
    assert.ok(badHostRes.body.error.message.includes('Host'));

    // 2. Untrusted Origin header is rejected with 403
    const badOriginRes = await callMcp(
      { jsonrpc: '2.0', id: 81, method: 'ping' },
      { Origin: 'https://malicious-phishing.org' }
    );
    assert.equal(badOriginRes.status, 403);
    assert.equal(badOriginRes.body.error.code, -32003);

    // 3. CORS Preflight OPTIONS with trusted origin returns matching origin, NEVER '*'
    const optRes = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'OPTIONS',
          headers: {
            Host: `127.0.0.1:${port}`,
            Origin: `http://127.0.0.1:${port}`,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type, Authorization',
          },
        },
        (res) => {
          resolve({ status: res.statusCode || 500, headers: res.headers });
        }
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers['access-control-allow-origin'], `http://127.0.0.1:${port}`);
    assert.notEqual(optRes.headers['access-control-allow-origin'], '*');

    // 4. CORS Preflight OPTIONS with untrusted origin returns 403
    const badOptRes = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'OPTIONS',
          headers: {
            Host: `127.0.0.1:${port}`,
            Origin: 'https://evil.org',
          },
        },
        (res) => {
          resolve({ status: res.statusCode || 500, headers: res.headers });
        }
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(badOptRes.status, 403);
  });
}

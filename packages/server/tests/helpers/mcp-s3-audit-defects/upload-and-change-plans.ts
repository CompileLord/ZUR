import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { McpServer } from '../../../src/mcp/mcp-server.ts';
import type { S3AuditFixture } from './fixture.ts';

export async function uploadAndChangePlanTests(t: TestContext, f: S3AuditFixture): Promise<void> {
  const { db, tokenResult, port, callMcp, samplePngBuffer, samplePngChecksum, state } = f;

  // --------------------------------------------------------------------------
  // S3-02 & S3-05: Real Bounded Byte Upload Endpoint & Checksum Verification
  // --------------------------------------------------------------------------
  await t.test('S3-02 & S3-05: Authenticated byte upload endpoint, checksum validation, and 10 MB limit', async () => {
    // 1. Create upload session with checksum
    const initRes = await callMcp({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'create_image_upload',
        arguments: {
          course_id: state.testCourseId,
          filename: 'pixel.png',
          mime_type: 'image/png',
          file_size: samplePngBuffer.length,
          checksum: samplePngChecksum,
        },
      },
    });
    assert.equal(initRes.status, 200);
    const session = JSON.parse(initRes.body.result.content[0].text);
    assert.ok(session.upload_id);
    assert.ok(session.upload_token);
    assert.equal(session.max_bytes, 10 * 1024 * 1024);

    // 2. Upload with checksum mismatch should be rejected
    const badUploadRes = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const corruptBytes = Buffer.from(samplePngBuffer);
      corruptBytes[0] = corruptBytes[0] ^ 0xff;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/author/courses/${state.testCourseId}/assets/upload-session/${session.upload_id}`,
          method: 'POST',
          headers: {
            Host: `127.0.0.1:${port}`,
            'Content-Type': 'image/png',
            'Content-Length': String(corruptBytes.length),
            'X-Upload-Token': session.upload_token,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (d) => (data += d));
          res.on('end', () => resolve({ status: res.statusCode || 500, body: data }));
        }
      );
      req.on('error', reject);
      req.write(corruptBytes);
      req.end();
    });
    assert.equal(badUploadRes.status, 400);
    assert.ok(badUploadRes.body.includes('checksum mismatch'));

    // 3. Upload with correct bytes and token succeeds
    const goodUploadRes = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: `/api/author/courses/${state.testCourseId}/assets/upload-session/${session.upload_id}`,
          method: 'POST',
          headers: {
            Host: `127.0.0.1:${port}`,
            'Content-Type': 'image/png',
            'Content-Length': String(samplePngBuffer.length),
            'X-Upload-Token': session.upload_token,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (d) => (data += d));
          res.on('end', () => resolve({ status: res.statusCode || 500, body: data }));
        }
      );
      req.on('error', reject);
      req.write(samplePngBuffer);
      req.end();
    });
    assert.equal(goodUploadRes.status, 200);
    const uploadReceipt = JSON.parse(goodUploadRes.body);
    assert.equal(uploadReceipt.bytes_received, samplePngBuffer.length);
    assert.equal(uploadReceipt.status, 'uploaded');

    // 4. Complete upload verifies staged bytes from disk
    const completeRes = await callMcp({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'complete_image_upload',
        arguments: {
          course_id: state.testCourseId,
          upload_id: session.upload_id,
          expected_checksum: samplePngChecksum,
        },
      },
    });
    assert.equal(completeRes.status, 200);
    const completeData = JSON.parse(completeRes.body.result.content[0].text);
    assert.ok(completeData.image_id);
    assert.ok(completeData.markdown_reference);

    // 5. Test 10 MB vs 1 MiB inline base64 limit
    // Rejects creation over 10 MB
    const overLimitRes = await callMcp({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'create_image_upload',
        arguments: {
          course_id: state.testCourseId,
          filename: 'huge.png',
          mime_type: 'image/png',
          file_size: 11 * 1024 * 1024,
        },
      },
    });
    assert.equal(overLimitRes.body.result.isError, true);
    assert.ok(overLimitRes.body.result.content[0].text.includes('10 MB'));

    // Rejects inline base64 > 1 MiB decoded
    const hugeBase64 = Buffer.alloc(1024 * 1024 + 10, 'A').toString('base64');
    const inlineOverRes = await callMcp({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'complete_image_upload',
        arguments: {
          course_id: state.testCourseId,
          base64_data: hugeBase64,
        },
      },
    });
    if (inlineOverRes.status === 413) {
      assert.equal(inlineOverRes.status, 413);
      assert.ok(inlineOverRes.body.error.message.includes('1 MiB'));
    } else {
      assert.equal(inlineOverRes.body.result.isError, true);
      assert.ok(inlineOverRes.body.result.content[0].text.includes('1 MiB'));
    }

    // Direct tool dispatch check for decoded 1 MiB guard
    const directMcp = new McpServer(db);
    const directToolRes = await directMcp.dispatchTool(
      'complete_image_upload',
      {
        course_id: state.testCourseId,
        base64_data: hugeBase64,
      },
      tokenResult.token
    );
    assert.equal(directToolRes.isError, true);
    assert.ok((directToolRes.content[0] as { text: string }).text.includes('1 MiB'));
  });

  // --------------------------------------------------------------------------
  // S3-03: Prepare and Apply Course Changes
  // --------------------------------------------------------------------------
  let batchPlanId = '';
  let batchPlanDigest = '';
  await t.test('S3-03: prepare_course_changes and apply_course_changes with short-lived plan', async () => {
    // 1. Prepare course changes
    const prepRes = await callMcp({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: {
        name: 'prepare_course_changes',
        arguments: {
          course_id: state.testCourseId,
          base_revision: state.testCourseRevision,
          operations: [
            {
              type: 'create_module',
              temp_id: 'mod_1',
              title: 'Module 1: Foundations',
            },
            {
              type: 'create_lesson',
              temp_id: 'les_1',
              parent_temp_id: 'mod_1',
              title: 'Lesson 1.1: Getting Started',
            },
            {
              type: 'create_step',
              temp_id: 'stp_1',
              parent_temp_id: 'les_1',
              title: 'Step 1: Introduction Theory',
              step_type: 'theory',
              content: {
                markdown: '# Welcome to the Course\n\nThis is introductory theory.',
              },
            },
          ],
        },
      },
    });

    assert.equal(prepRes.status, 200);
    const plan = JSON.parse(prepRes.body.result.content[0].text);
    assert.ok(plan.plan_id);
    assert.ok(plan.canonical_digest);
    assert.equal(plan.operation_count, 3);
    assert.ok(plan.expires_at);

    batchPlanId = plan.plan_id;
    batchPlanDigest = plan.canonical_digest;

    // Verify stored plan in DB
    const planRow = db.prepare('SELECT * FROM course_change_plans WHERE id = ?').get(batchPlanId) as any;
    assert.ok(planRow);
    assert.equal(planRow.status, 'prepared');
    assert.equal(planRow.course_id, state.testCourseId);

    // 2. Apply course changes
    const applyRes = await callMcp({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'apply_course_changes',
        arguments: {
          plan_id: batchPlanId,
          course_id: state.testCourseId,
          idempotency_key: 'batch-test-idemp-1',
        },
      },
    });

    assert.equal(applyRes.status, 200);
    const applyData = JSON.parse(applyRes.body.result.content[0].text);
    assert.equal(applyData.status, 'applied');
    assert.ok(applyData.created_nodes.mod_1);
    assert.ok(applyData.created_nodes.les_1);
    assert.ok(applyData.created_nodes.stp_1);
    assert.ok(applyData.draft_revision > state.testCourseRevision);
    state.testCourseRevision = applyData.draft_revision;

    // Exact retry after a successful apply returns the original receipt.
    const retryRes = await callMcp({ jsonrpc: '2.0', id: 211, method: 'tools/call', params: {
      name: 'apply_course_changes', arguments: {
        plan_id: batchPlanId, course_id: state.testCourseId, idempotency_key: 'batch-test-idemp-1',
      },
    }});
    assert.equal(retryRes.status, 200);
    assert.deepEqual(JSON.parse(retryRes.body.result.content[0].text), applyData);

    // 3. Stale plan or re-apply rejection
    const reapplyRes = await callMcp({
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'apply_course_changes',
        arguments: {
          plan_id: batchPlanId,
          course_id: state.testCourseId,
          idempotency_key: 'different-key-for-applied-plan',
        },
      },
    });
    assert.equal(reapplyRes.body.result.isError, true);
    assert.ok(reapplyRes.body.result.content[0].text.includes('already applied'));

    // 3b. Differing request with SAME idempotency key is rejected with Conflict
    const prepSecond = await callMcp({
      jsonrpc: '2.0',
      id: 212,
      method: 'tools/call',
      params: {
        name: 'prepare_course_changes',
        arguments: {
          course_id: state.testCourseId,
          base_revision: state.testCourseRevision,
          operations: [{ type: 'create_module', temp_id: 'mod_conflict', title: 'Conflict Plan' }],
        },
      },
    });
    const plan2 = JSON.parse(prepSecond.body.result.content[0].text);
    const conflictApplyRes = await callMcp({
      jsonrpc: '2.0',
      id: 213,
      method: 'tools/call',
      params: {
        name: 'apply_course_changes',
        arguments: {
          plan_id: plan2.plan_id,
          course_id: state.testCourseId,
          idempotency_key: 'batch-test-idemp-1',
        },
      },
    });
    assert.equal(conflictApplyRes.body.result.isError, true);
    assert.match(conflictApplyRes.body.result.content[0].text, /different request parameters/i);

    // 4. Bound checks: > 100 operations rejected
    const hundredOps = Array.from({ length: 101 }, (_, i) => ({
      type: 'create_module',
      temp_id: `mod_${i}`,
      title: `Mod ${i}`,
    }));
    const over100Res = await callMcp({
      jsonrpc: '2.0',
      id: 23,
      method: 'tools/call',
      params: {
        name: 'prepare_course_changes',
        arguments: {
          course_id: state.testCourseId,
          base_revision: state.testCourseRevision,
          operations: hundredOps,
        },
      },
    });
    assert.equal(over100Res.body.result.isError, true);
    assert.ok(over100Res.body.result.content[0].text.includes('Maximum 100 operations'));
  });
}

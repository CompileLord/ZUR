import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client as V2Client, StreamableHTTPClientTransport as V2StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { SUPPORTED_PROTOCOL_VERSIONS, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';
import { McpServer } from '../src/mcp/mcp-server.ts';
import { McpTokenService } from '../src/services/mcp-token-service.ts';
import { TOKEN_SCOPE_PRESETS } from 'zur-shared';

test('S3 Audit Defects Verification Suite (S3-01 through S3-10)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const tokenService = new McpTokenService(db);
  const authorId = 'user-author-1';
  const authorPassword = 'AuthorPass123!';

  // Create full course control token
  const tokenResult = tokenService.createToken(authorId, {
    password: authorPassword,
    label: 'S3 Audit Agent',
    scopes: TOKEN_SCOPE_PRESETS.full_course_control,
    expiryDays: 30,
  });
  const validRawToken = tokenResult.rawToken;
  const tokenId = tokenResult.token.id;

  const server = createServer(db);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const port = address.port;

  t.after(() => {
    server.close();
  });

  // Raw protocol helper for security probes and revision negotiation.
  const rawSessions = new Map<string, string>();
  async function callMcp(body: any, customHeaders: Record<string, string> = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
    const credential = customHeaders.Authorization || `Bearer ${validRawToken}`;
    if (body.method !== 'initialize' && !rawSessions.has(credential)) {
      await callMcp({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'raw-test', version: '1' } } }, { Authorization: credential });
    }
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'POST',
          headers: {
            Host: `127.0.0.1:${port}`,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...(rawSessions.has(credential) && body.method !== 'initialize' ? { 'mcp-session-id': rawSessions.get(credential)!, 'mcp-protocol-version': LATEST_PROTOCOL_VERSION } : {}),
            'Content-Length': String(Buffer.byteLength(payload)),
            Authorization: `Bearer ${validRawToken}`,
            ...customHeaders,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.headers['mcp-session-id']) rawSessions.set(credential, String(res.headers['mcp-session-id']));
            try {
              resolve({
                status: res.statusCode || 500,
                headers: res.headers,
                body: data ? JSON.parse(data.startsWith('event:') ? data.split('\n').find((line) => line.startsWith('data: '))!.slice(6) : data) : null,
              });
            } catch {
              resolve({
                status: res.statusCode || 500,
                headers: res.headers,
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

  // 1x1 transparent PNG fixture
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const samplePngBuffer = Buffer.from(samplePngBase64, 'base64');
  const samplePngChecksum = crypto.createHash('sha256').update(samplePngBuffer).digest('hex');

  // Shared created course ID for tests
  let testCourseId = '';
  let testCourseRevision = 1;

  // --------------------------------------------------------------------------
  // S3-01: Official MCP SDK Streamable HTTP transport and client
  // --------------------------------------------------------------------------
  await t.test('S3-01: Official MCP SDK Client over Streamable HTTP transport with explicit revisions', async () => {
    const clientTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${validRawToken}`,
        },
      },
    });

    const client = new Client({ name: 'official-sdk-test-client', version: '1.0.0' }, { capabilities: {} });
    await client.connect(clientTransport);

    // Verify tools/list over official SDK client
    const toolList = await client.listTools();
    assert.ok(toolList.tools.length >= 20);

    const toolNames = toolList.tools.map((t) => t.name);
    assert.ok(toolNames.includes('prepare_course_changes'));
    assert.ok(toolNames.includes('apply_course_changes'));
    assert.ok(toolNames.includes('move_content'));
    assert.ok(toolNames.includes('duplicate_content'));
    assert.ok(toolNames.includes('update_image'));
    assert.ok(toolNames.includes('attach_image'));
    assert.ok(toolNames.includes('detach_image'));
    assert.ok(toolNames.includes('list_agent_activity'));
    assert.ok(toolNames.includes('get_change'));

    // Execute create_course over official SDK client
    const createRes = await client.callTool({
      name: 'create_course',
      arguments: {
        title: 'Course Created by Official MCP SDK',
        description: 'Demonstrating official MCP SDK streamable HTTP transport',
      },
    });

    assert.ok(createRes.content);
    const parsed = JSON.parse((createRes.content[0] as any).text);
    assert.ok(parsed.id);
    testCourseId = parsed.id;
    testCourseRevision = parsed.draftRevision || 1;

    const prepared = await client.callTool({ name: 'prepare_course_changes', arguments: {
      course_id: testCourseId, base_revision: testCourseRevision,
      operations: [{ type: 'create_module', temp_id: 'sdk_retry_module', title: 'SDK Retry Module' }],
    }});
    const sdkPlan = JSON.parse((prepared.content[0] as any).text);
    const applyArgs = { plan_id: sdkPlan.plan_id, course_id: testCourseId, idempotency_key: 'sdk-apply-retry-1' };
    const firstApply = await client.callTool({ name: 'apply_course_changes', arguments: applyArgs });
    const repeatApply = await client.callTool({ name: 'apply_course_changes', arguments: applyArgs });
    assert.deepEqual(JSON.parse((repeatApply.content[0] as any).text), JSON.parse((firstApply.content[0] as any).text));
    testCourseRevision = JSON.parse((firstApply.content[0] as any).text).new_revision;

    // Verify prepare_course_changes rejects >20 steps in a lesson
    const twentyOneSteps = Array.from({ length: 21 }, (_, i) => ({
      type: 'create_step',
      temp_id: `over_step_${i}`,
      parent_temp_id: 'limit_les',
      title: `Step ${i + 1}`,
      step_type: 'theory',
      content: { markdown: `Step content ${i + 1}` },
    }));
    const limitRes = await client.callTool({
      name: 'prepare_course_changes',
      arguments: {
        course_id: testCourseId,
        base_revision: testCourseRevision,
        operations: [
          { type: 'create_module', temp_id: 'limit_mod', title: 'Limit Module' },
          { type: 'create_lesson', temp_id: 'limit_les', parent_temp_id: 'limit_mod', title: 'Limit Lesson' },
          ...twentyOneSteps,
        ],
      },
    });
    assert.equal((limitRes as any).isError, true);
    assert.match((limitRes.content[0] as any).text, /exceed 20 steps/i);

    // Verify prepare_course_changes validates quiz options schema (< 2 options or no correct option)
    const badQuizRes = await client.callTool({
      name: 'prepare_course_changes',
      arguments: {
        course_id: testCourseId,
        base_revision: testCourseRevision,
        operations: [
          { type: 'create_module', temp_id: 'quiz_mod', title: 'Quiz Module' },
          { type: 'create_lesson', temp_id: 'quiz_les', parent_temp_id: 'quiz_mod', title: 'Quiz Lesson' },
          {
            type: 'create_step',
            temp_id: 'quiz_step_bad',
            parent_temp_id: 'quiz_les',
            title: 'Quiz Step',
            step_type: 'quiz',
            content: { options: [{ text: 'Only one option', isCorrect: true }] },
          },
        ],
      },
    });
    assert.equal((badQuizRes as any).isError, true);
    assert.match((badQuizRes.content[0] as any).text, /between 2 and 6 options/i);

    // Verify prepare_course_changes rejects operations under deleted nodes
    const delParentRes = await client.callTool({
      name: 'prepare_course_changes',
      arguments: {
        course_id: testCourseId,
        base_revision: testCourseRevision,
        operations: [
          { type: 'create_module', temp_id: 'del_mod', title: 'Deleted Module' },
          { type: 'delete_module', module_id: 'del_mod' },
          { type: 'create_lesson', module_id: 'del_mod', title: 'Lesson under deleted' },
        ],
      },
    });
    assert.equal((delParentRes as any).isError, true);
    assert.match((delParentRes.content[0] as any).text, /cannot add lesson to deleted module/i);

    // Verify image workflows over official SDK client: complete_image_upload, attach_image, update_image, detach_image
    const sdkUploadRes = await client.callTool({
      name: 'complete_image_upload',
      arguments: {
        course_id: testCourseId,
        base64_data: samplePngBase64,
        filename: 'sdk-banner.png',
        alt_text: 'SDK Banner Image',
      },
    });
    assert.equal((sdkUploadRes as any).isError, undefined);
    const sdkImage = JSON.parse((sdkUploadRes.content[0] as any).text);
    assert.ok(sdkImage.image_id);

    // Prepare and apply a step to attach to
    const sdkStepPrep = await client.callTool({
      name: 'prepare_course_changes',
      arguments: {
        course_id: testCourseId,
        base_revision: testCourseRevision,
        operations: [
          { type: 'create_module', temp_id: 'm_img', title: 'Image Test Module' },
          { type: 'create_lesson', temp_id: 'l_img', parent_temp_id: 'm_img', title: 'Image Test Lesson' },
          { type: 'create_step', temp_id: 's_img', parent_temp_id: 'l_img', title: 'Image Theory Step', step_type: 'theory', content: { markdown: '# Intro' } },
        ],
      },
    });
    const sdkStepPlan = JSON.parse((sdkStepPrep.content[0] as any).text);
    const sdkStepApply = await client.callTool({
      name: 'apply_course_changes',
      arguments: {
        plan_id: sdkStepPlan.plan_id,
        course_id: testCourseId,
        idempotency_key: 'sdk-img-step-apply',
      },
    });
    const sdkStepApplyData = JSON.parse((sdkStepApply.content[0] as any).text);
    testCourseRevision = sdkStepApplyData.draft_revision;
    const targetStepId = sdkStepApplyData.created_nodes.s_img;
    assert.ok(targetStepId);

    // SDK client attach_image
    const sdkAttach = await client.callTool({
      name: 'attach_image',
      arguments: {
        course_id: testCourseId,
        step_id: targetStepId,
        asset_id: sdkImage.image_id,
        expected_revision: testCourseRevision,
        idempotency_key: 'sdk-attach-key-1',
      },
    });
    assert.equal((sdkAttach as any).isError, undefined);
    const sdkAttachData = JSON.parse((sdkAttach.content[0] as any).text);
    assert.equal(sdkAttachData.attached, true);
    testCourseRevision = sdkAttachData.draft_revision;

    // SDK client update_image
    const sdkUpdate = await client.callTool({
      name: 'update_image',
      arguments: {
        asset_id: sdkImage.image_id,
        alt_text: 'SDK Updated Banner',
        caption: 'SDK Image Caption',
        expected_revision: testCourseRevision,
        idempotency_key: 'sdk-update-key-1',
      },
    });
    assert.equal((sdkUpdate as any).isError, undefined);
    const sdkUpdateData = JSON.parse((sdkUpdate.content[0] as any).text);
    assert.equal(sdkUpdateData.alt_text, 'SDK Updated Banner');
    testCourseRevision = sdkUpdateData.draft_revision;

    // SDK client detach_image
    const sdkDetach = await client.callTool({
      name: 'detach_image',
      arguments: {
        course_id: testCourseId,
        step_id: targetStepId,
        asset_id: sdkImage.image_id,
        expected_revision: testCourseRevision,
        idempotency_key: 'sdk-detach-key-1',
      },
    });
    assert.equal((sdkDetach as any).isError, undefined);
    const sdkDetachData = JSON.parse((sdkDetach.content[0] as any).text);
    assert.equal(sdkDetachData.detached, true);
    testCourseRevision = sdkDetachData.draft_revision;

    await client.close();

    // Official MCP SDK v2 Client pinned to modern 2026-07-28 over HTTP
    const modernClient = new V2Client(
      { name: 's3-v2-client', version: '2.0.0' },
      {
        capabilities: {},
        versionNegotiation: { mode: { pin: '2026-07-28' } },
      }
    );
    const modernTransport = new V2StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: {
        headers: {
          Host: `127.0.0.1:${port}`,
          Authorization: `Bearer ${validRawToken}`,
        },
      },
    });
    await modernClient.connect(modernTransport);
    assert.equal(modernClient.getNegotiatedProtocolVersion(), '2026-07-28');
    const modernTools = await modernClient.listTools();
    assert.ok(modernTools.tools.length >= 10);
    const modernCall = await modernClient.callTool({
      name: 'list_courses',
      arguments: {},
    });
    assert.ok(modernCall.content);
    await modernClient.close();

    // Direct stateless modern 2026-07-28 request with meta envelope
    const modernDirectRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: 101,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
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
            'mcp-protocol-version': '2026-07-28',
            'mcp-method': 'tools/list',
            Authorization: `Bearer ${validRawToken}`,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            resolve({
              status: res.statusCode || 500,
              body: data ? JSON.parse(data) : null,
            });
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    assert.equal(modernDirectRes.status, 200);
    assert.ok(modernDirectRes.body.result.tools.length >= 10);

    // Verify protocol version negotiation does NOT blindly echo arbitrary versions
    const arbitraryRes = await callMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2099-99-99',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    });
    assert.equal(arbitraryRes.status, 200);
    assert.equal(arbitraryRes.body.result.protocolVersion, LATEST_PROTOCOL_VERSION);
    assert.notEqual(arbitraryRes.body.result.protocolVersion, '2099-99-99');

    // Tested revision negotiation for 2026-07-28 via server/discover probe
    const discoverRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: 201,
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
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
            'mcp-protocol-version': '2026-07-28',
            'mcp-method': 'server/discover',
            Authorization: `Bearer ${validRawToken}`,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            resolve({
              status: res.statusCode || 500,
              body: data ? JSON.parse(data) : null,
            });
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    assert.equal(discoverRes.status, 200);
    assert.deepEqual(discoverRes.body.result.supportedVersions, ['2026-07-28']);

    // Tested revision negotiation for 2024-11-05
    const explicitRes = await callMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    });
    assert.equal(explicitRes.status, 200);
    assert.equal(explicitRes.body.result.protocolVersion, '2024-11-05');
  });

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
          course_id: testCourseId,
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
          path: `/api/author/courses/${testCourseId}/assets/upload-session/${session.upload_id}`,
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
          path: `/api/author/courses/${testCourseId}/assets/upload-session/${session.upload_id}`,
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
          course_id: testCourseId,
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
          course_id: testCourseId,
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
          course_id: testCourseId,
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
        course_id: testCourseId,
        base64_data: hugeBase64,
      },
      tokenResult.token
    );
    assert.equal(directToolRes.isError, true);
    assert.ok(directToolRes.content[0].text.includes('1 MiB'));
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
          course_id: testCourseId,
          base_revision: testCourseRevision,
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
    assert.equal(planRow.course_id, testCourseId);

    // 2. Apply course changes
    const applyRes = await callMcp({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'apply_course_changes',
        arguments: {
          plan_id: batchPlanId,
          course_id: testCourseId,
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
    assert.ok(applyData.draft_revision > testCourseRevision);
    testCourseRevision = applyData.draft_revision;

    // Exact retry after a successful apply returns the original receipt.
    const retryRes = await callMcp({ jsonrpc: '2.0', id: 211, method: 'tools/call', params: {
      name: 'apply_course_changes', arguments: {
        plan_id: batchPlanId, course_id: testCourseId, idempotency_key: 'batch-test-idemp-1',
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
          course_id: testCourseId,
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
          course_id: testCourseId,
          base_revision: testCourseRevision,
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
          course_id: testCourseId,
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
          course_id: testCourseId,
          base_revision: testCourseRevision,
          operations: hundredOps,
        },
      },
    });
    assert.equal(over100Res.body.result.isError, true);
    assert.ok(over100Res.body.result.content[0].text.includes('Maximum 100 operations'));
  });

  await t.test('S3-03 security: batch cannot reference another course hierarchy', async () => {
    const foreignModule = db.prepare("SELECT id FROM modules WHERE course_id = 'course-python-foundations' LIMIT 1").get() as { id: string };
    assert.ok(foreignModule?.id);
    const before = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(testCourseId) as { draft_revision: number };
    const response = await callMcp({ jsonrpc: '2.0', id: 24, method: 'tools/call', params: {
      name: 'prepare_course_changes', arguments: { course_id: testCourseId, base_revision: before.draft_revision,
        operations: [{ type: 'create_lesson', module_id: foreignModule.id, title: 'Injected lesson' }] },
    }});
    assert.equal(response.body.result.isError, true);
    assert.match(response.body.result.content[0].text, /not found in authorized course/i);
    const after = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(testCourseId) as { draft_revision: number };
    assert.equal(after.draft_revision, before.draft_revision);
  });

  // --------------------------------------------------------------------------
  // S3-04: Pre-commit revocation check
  // --------------------------------------------------------------------------
  await t.test('S3-04: Pending-write revocation aborts mutation before commit', async () => {
    // Issue a short-lived token to revoke
    const tempTokenResult = tokenService.createToken(authorId, {
      password: authorPassword,
      label: 'Revocation Test Agent',
      scopes: TOKEN_SCOPE_PRESETS.full_course_control,
      expiryDays: 1,
    });

    // Prepare changes using temp token
    const prepRes = await callMcp(
      {
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: {
          name: 'prepare_course_changes',
          arguments: {
            course_id: testCourseId,
            base_revision: testCourseRevision,
            operations: [
              {
                type: 'create_module',
                temp_id: 'mod_revoked',
                title: 'Should never commit',
              },
            ],
          },
        },
      },
      { Authorization: `Bearer ${tempTokenResult.rawToken}` }
    );
    const plan = JSON.parse(prepRes.body.result.content[0].text);

    // Revoke token immediately before apply commit
    tokenService.revokeToken(authorId, tempTokenResult.token.id);

    // Apply call fails pre-commit check
    const applyRes = await callMcp(
      {
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'apply_course_changes',
          arguments: {
            plan_id: plan.plan_id,
            course_id: testCourseId,
            idempotency_key: 'revoked-test-idemp',
          },
        },
      },
      { Authorization: `Bearer ${tempTokenResult.rawToken}` }
    );

    // Must be rejected as revoked
    assert.ok(applyRes.status === 401 || applyRes.status === 403 || applyRes.body.result?.isError === true);

    // Verify module was NOT created in DB
    const modCount = db.prepare("SELECT COUNT(*) as count FROM modules WHERE title = 'Should never commit'").get() as any;
    assert.equal(modCount.count, 0);

    // Image mutation revocation check: revoked token aborts update_image before commit
    const imgTempTokenResult = tokenService.createToken(authorId, {
      password: authorPassword,
      label: 'Image Revocation Test Agent',
      scopes: TOKEN_SCOPE_PRESETS.full_course_control,
      expiryDays: 1,
    });
    tokenService.revokeToken(authorId, imgTempTokenResult.token.id);

    const imgRevokedRes = await callMcp(
      {
        jsonrpc: '2.0',
        id: 32,
        method: 'tools/call',
        params: {
          name: 'update_image',
          arguments: {
            asset_id: 'any-asset-id',
            expected_revision: testCourseRevision,
            idempotency_key: 'revoked-img-idemp',
            alt_text: 'Should not commit',
          },
        },
      },
      { Authorization: `Bearer ${imgTempTokenResult.rawToken}` }
    );
    assert.ok(imgRevokedRes.status === 401 || imgRevokedRes.status === 403 || imgRevokedRes.body.result?.isError === true);
  });

  // --------------------------------------------------------------------------
  // S3-06: Conflicting Idempotency Key Reuse
  // --------------------------------------------------------------------------
  await t.test('S3-06: Idempotency reuse with differing payload is rejected with Conflict', async () => {
    const key = 'shared-idemp-key-test';

    // 1. Initial batch_author call
    const firstCall = await callMcp({
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: {
        name: 'batch_author',
        arguments: {
          course_id: testCourseId,
          base_revision: testCourseRevision,
          idempotency_key: key,
          operations: [
            {
              type: 'create_module',
              temp_id: 'mod_idemp',
              title: 'Module Idemp First',
            },
          ],
        },
      },
    });
    assert.equal(firstCall.status, 200);
    const firstData = JSON.parse(firstCall.body.result.content[0].text);
    testCourseRevision = firstData.draft_revision;

    // 2. Exactly matching call returns identical cached receipt
    const matchCall = await callMcp({
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: {
        name: 'batch_author',
        arguments: {
          course_id: testCourseId,
          base_revision: testCourseRevision - 1, // original base revision
          idempotency_key: key,
          operations: [
            {
              type: 'create_module',
              temp_id: 'mod_idemp',
              title: 'Module Idemp First',
            },
          ],
        },
      },
    });
    assert.equal(matchCall.status, 200);
    const matchData = JSON.parse(matchCall.body.result.content[0].text);
    assert.equal(matchData.draft_revision, firstData.draft_revision);

    // 3. Different payload with SAME idempotency key must reject
    const conflictCall = await callMcp({
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: {
        name: 'batch_author',
        arguments: {
          course_id: testCourseId,
          base_revision: testCourseRevision,
          idempotency_key: key,
          operations: [
            {
              type: 'create_module',
              temp_id: 'mod_idemp_different',
              title: 'Completely Different Operations',
            },
          ],
        },
      },
    });
    assert.equal(conflictCall.body.result.isError, true);
    assert.ok(conflictCall.body.result.content[0].text.includes('Idempotency key has already been used with different request parameters'));
  });

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
          course_id: testCourseId,
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
    const stepRow = db.prepare("SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = ? LIMIT 1").get(testCourseId) as any;
    const stepId = stepRow.id;

    // 1. attach_image
    const attachRes = await callMcp({
      jsonrpc: '2.0',
      id: 51,
      method: 'tools/call',
      params: {
        name: 'attach_image',
        arguments: {
          course_id: testCourseId,
          asset_id: imageId,
          step_id: stepId,
          expected_revision: testCourseRevision,
          idempotency_key: 'image-attach-1',
        },
      },
    });
    assert.equal(attachRes.status, 200);
    const attachData = JSON.parse(attachRes.body.result.content[0].text);
    assert.equal(attachData.attached, true);
    const attachRetry = await callMcp({ jsonrpc: '2.0', id: 511, method: 'tools/call', params: {
      name: 'attach_image', arguments: { course_id: testCourseId, asset_id: imageId,
        step_id: stepId, expected_revision: testCourseRevision, idempotency_key: 'image-attach-1' },
    }});
    assert.deepEqual(JSON.parse(attachRetry.body.result.content[0].text), attachData);
    const changedRetry = await callMcp({ jsonrpc: '2.0', id: 512, method: 'tools/call', params: {
      name: 'attach_image', arguments: { course_id: testCourseId, asset_id: imageId,
        step_id: stepId, expected_revision: testCourseRevision, idempotency_key: 'image-attach-1', alt_text: 'Different' },
    }});
    assert.equal(changedRetry.body.result.isError, true);
    assert.match(changedRetry.body.result.content[0].text, /different request parameters/i);

    assert.ok(attachData.draft_revision > testCourseRevision);
    testCourseRevision = attachData.draft_revision;

    // 2. update_image
    const updateRes = await callMcp({
      jsonrpc: '2.0',
      id: 52,
      method: 'tools/call',
      params: {
        name: 'update_image',
        arguments: {
          course_id: testCourseId,
          asset_id: imageId,
          alt_text: 'Updated Alt Text',
          caption: 'Updated Caption',
          expected_revision: testCourseRevision,
          idempotency_key: 'image-update-1',
        },
      },
    });
    assert.equal(updateRes.status, 200);
    const updateData = JSON.parse(updateRes.body.result.content[0].text);
    assert.equal(updateData.alt_text, 'Updated Alt Text');
    assert.equal(updateData.caption, 'Updated Caption');
    assert.ok(updateData.draft_revision > testCourseRevision);
    testCourseRevision = updateData.draft_revision;

    // 3. detach_image
    const detachRes = await callMcp({
      jsonrpc: '2.0',
      id: 53,
      method: 'tools/call',
      params: {
        name: 'detach_image',
        arguments: {
          course_id: testCourseId,
          asset_id: imageId,
          step_id: stepId,
          expected_revision: testCourseRevision,
          idempotency_key: 'image-detach-1',
        },
      },
    });
    assert.equal(detachRes.status, 200);
    const detachData = JSON.parse(detachRes.body.result.content[0].text);
    assert.equal(detachData.detached, true);
    testCourseRevision = detachData.draft_revision;

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
          expected_revision: testCourseRevision,
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
          course_id: testCourseId,
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
          course_id: testCourseId,
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
          course_id: testCourseId,
          base_revision: testCourseRevision,
          idempotency_key: 'batch-test-move-dest',
          operations: [
            { type: 'create_module', temp_id: 'mod_dst', title: 'Destination Module' },
            { type: 'create_lesson', temp_id: 'les_dst', parent_temp_id: 'mod_dst', title: 'Destination Lesson' },
          ],
        },
      },
    });
    const batchData = JSON.parse(batchRes.body.result.content[0].text);
    testCourseRevision = batchData.draft_revision;
    const destModuleId = batchData.created_nodes.mod_dst;
    const destLessonId = batchData.created_nodes.les_dst;

    const sourceStep = db.prepare("SELECT s.id, s.title, s.lesson_id FROM steps s JOIN lessons l ON s.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = ? AND l.id != ? LIMIT 1").get(testCourseId, destLessonId) as any;

    // 1. move_content (step)
    const moveStepRes = await callMcp({
      jsonrpc: '2.0',
      id: 61,
      method: 'tools/call',
      params: {
        name: 'move_content',
        arguments: {
          course_id: testCourseId,
          content_type: 'step',
          id: sourceStep.id,
          target_parent_id: destLessonId,
          new_position: 0,
          expected_revision: testCourseRevision,
        },
      },
    });
    assert.equal(moveStepRes.status, 200);
    const moveData = JSON.parse(moveStepRes.body.result.content[0].text);
    assert.equal(moveData.content_type, 'step');
    assert.equal(moveData.new_parent_id, destLessonId);
    testCourseRevision = moveData.draft_revision;

    // 2. duplicate_content (lesson)
    const dupLessonRes = await callMcp({
      jsonrpc: '2.0',
      id: 62,
      method: 'tools/call',
      params: {
        name: 'duplicate_content',
        arguments: {
          course_id: testCourseId,
          content_type: 'lesson',
          id: destLessonId,
          target_parent_id: destModuleId,
          expected_revision: testCourseRevision,
        },
      },
    });
    assert.equal(dupLessonRes.status, 200);
    const dupData = JSON.parse(dupLessonRes.body.result.content[0].text);
    assert.equal(dupData.content_type, 'lesson');
    assert.ok(dupData.duplicate_id);
    assert.notEqual(dupData.duplicate_id, destLessonId);
    testCourseRevision = dupData.draft_revision;

    // 3. duplicate_content (module)
    const dupModRes = await callMcp({
      jsonrpc: '2.0',
      id: 63,
      method: 'tools/call',
      params: {
        name: 'duplicate_content',
        arguments: {
          course_id: testCourseId,
          content_type: 'module',
          id: destModuleId,
          expected_revision: testCourseRevision,
        },
      },
    });
    assert.equal(dupModRes.status, 200);
    const dupModData = JSON.parse(dupModRes.body.result.content[0].text);
    assert.equal(dupModData.content_type, 'module');
    assert.ok(dupModData.duplicate_id);
    testCourseRevision = dupModData.draft_revision;
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
          course_id: testCourseId,
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
    assert.equal(changeData.course_id, testCourseId);
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
});

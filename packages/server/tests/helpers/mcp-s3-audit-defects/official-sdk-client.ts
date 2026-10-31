import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client as V2Client, StreamableHTTPClientTransport as V2StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import type { S3AuditFixture } from './fixture.ts';

export async function officialSdkClientTests(t: TestContext, f: S3AuditFixture): Promise<void> {
  const { validRawToken, server, port, callMcp, samplePngBase64, state } = f;

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
    const parsed = JSON.parse((createRes.content as Array<{ text: string }>)[0].text);
    assert.ok(parsed.id);
    state.testCourseId = parsed.id;
    state.testCourseRevision = parsed.draftRevision || 1;

    const prepared = await client.callTool({ name: 'prepare_course_changes', arguments: {
      course_id: state.testCourseId, base_revision: state.testCourseRevision,
      operations: [{ type: 'create_module', temp_id: 'sdk_retry_module', title: 'SDK Retry Module' }],
    }});
    const sdkPlan = JSON.parse((prepared.content as Array<{ text: string }>)[0].text);
    const applyArgs = { plan_id: sdkPlan.plan_id, course_id: state.testCourseId, idempotency_key: 'sdk-apply-retry-1' };
    const firstApply = await client.callTool({ name: 'apply_course_changes', arguments: applyArgs });
    const repeatApply = await client.callTool({ name: 'apply_course_changes', arguments: applyArgs });
    assert.deepEqual(JSON.parse((repeatApply.content as Array<{ text: string }>)[0].text), JSON.parse((firstApply.content as Array<{ text: string }>)[0].text));
    state.testCourseRevision = JSON.parse((firstApply.content as Array<{ text: string }>)[0].text).new_revision;

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
        course_id: state.testCourseId,
        base_revision: state.testCourseRevision,
        operations: [
          { type: 'create_module', temp_id: 'limit_mod', title: 'Limit Module' },
          { type: 'create_lesson', temp_id: 'limit_les', parent_temp_id: 'limit_mod', title: 'Limit Lesson' },
          ...twentyOneSteps,
        ],
      },
    });
    assert.equal((limitRes as any).isError, true);
    assert.match((limitRes.content as Array<{ text: string }>)[0].text, /exceed 20 steps/i);

    // Verify prepare_course_changes validates quiz options schema (< 2 options or no correct option)
    const badQuizRes = await client.callTool({
      name: 'prepare_course_changes',
      arguments: {
        course_id: state.testCourseId,
        base_revision: state.testCourseRevision,
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
    assert.match((badQuizRes.content as Array<{ text: string }>)[0].text, /between 2 and 6 options/i);

    // Verify prepare_course_changes rejects operations under deleted nodes
    const delParentRes = await client.callTool({
      name: 'prepare_course_changes',
      arguments: {
        course_id: state.testCourseId,
        base_revision: state.testCourseRevision,
        operations: [
          { type: 'create_module', temp_id: 'del_mod', title: 'Deleted Module' },
          { type: 'delete_module', module_id: 'del_mod' },
          { type: 'create_lesson', module_id: 'del_mod', title: 'Lesson under deleted' },
        ],
      },
    });
    assert.equal((delParentRes as any).isError, true);
    assert.match((delParentRes.content as Array<{ text: string }>)[0].text, /cannot add lesson to deleted module/i);

    // Verify image workflows over official SDK client: complete_image_upload, attach_image, update_image, detach_image
    const sdkUploadRes = await client.callTool({
      name: 'complete_image_upload',
      arguments: {
        course_id: state.testCourseId,
        base64_data: samplePngBase64,
        filename: 'sdk-banner.png',
        alt_text: 'SDK Banner Image',
      },
    });
    assert.equal((sdkUploadRes as any).isError, undefined);
    const sdkImage = JSON.parse((sdkUploadRes.content as Array<{ text: string }>)[0].text);
    assert.ok(sdkImage.image_id);

    // Prepare and apply a step to attach to
    const sdkStepPrep = await client.callTool({
      name: 'prepare_course_changes',
      arguments: {
        course_id: state.testCourseId,
        base_revision: state.testCourseRevision,
        operations: [
          { type: 'create_module', temp_id: 'm_img', title: 'Image Test Module' },
          { type: 'create_lesson', temp_id: 'l_img', parent_temp_id: 'm_img', title: 'Image Test Lesson' },
          { type: 'create_step', temp_id: 's_img', parent_temp_id: 'l_img', title: 'Image Theory Step', step_type: 'theory', content: { markdown: '# Intro' } },
        ],
      },
    });
    const sdkStepPlan = JSON.parse((sdkStepPrep.content as Array<{ text: string }>)[0].text);
    const sdkStepApply = await client.callTool({
      name: 'apply_course_changes',
      arguments: {
        plan_id: sdkStepPlan.plan_id,
        course_id: state.testCourseId,
        idempotency_key: 'sdk-img-step-apply',
      },
    });
    const sdkStepApplyData = JSON.parse((sdkStepApply.content as Array<{ text: string }>)[0].text);
    state.testCourseRevision = sdkStepApplyData.draft_revision;
    const targetStepId = sdkStepApplyData.created_nodes.s_img;
    assert.ok(targetStepId);

    // SDK client attach_image
    const sdkAttach = await client.callTool({
      name: 'attach_image',
      arguments: {
        course_id: state.testCourseId,
        step_id: targetStepId,
        asset_id: sdkImage.image_id,
        expected_revision: state.testCourseRevision,
        idempotency_key: 'sdk-attach-key-1',
      },
    });
    assert.equal((sdkAttach as any).isError, undefined);
    const sdkAttachData = JSON.parse((sdkAttach.content as Array<{ text: string }>)[0].text);
    assert.equal(sdkAttachData.attached, true);
    state.testCourseRevision = sdkAttachData.draft_revision;

    // SDK client update_image
    const sdkUpdate = await client.callTool({
      name: 'update_image',
      arguments: {
        asset_id: sdkImage.image_id,
        alt_text: 'SDK Updated Banner',
        caption: 'SDK Image Caption',
        expected_revision: state.testCourseRevision,
        idempotency_key: 'sdk-update-key-1',
      },
    });
    assert.equal((sdkUpdate as any).isError, undefined);
    const sdkUpdateData = JSON.parse((sdkUpdate.content as Array<{ text: string }>)[0].text);
    assert.equal(sdkUpdateData.alt_text, 'SDK Updated Banner');
    state.testCourseRevision = sdkUpdateData.draft_revision;

    // SDK client detach_image
    const sdkDetach = await client.callTool({
      name: 'detach_image',
      arguments: {
        course_id: state.testCourseId,
        step_id: targetStepId,
        asset_id: sdkImage.image_id,
        expected_revision: state.testCourseRevision,
        idempotency_key: 'sdk-detach-key-1',
      },
    });
    assert.equal((sdkDetach as any).isError, undefined);
    const sdkDetachData = JSON.parse((sdkDetach.content as Array<{ text: string }>)[0].text);
    assert.equal(sdkDetachData.detached, true);
    state.testCourseRevision = sdkDetachData.draft_revision;

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
}

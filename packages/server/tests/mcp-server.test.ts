import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';
import { McpTokenService } from '../src/services/mcp-token-service.ts';
import { TOKEN_SCOPE_PRESETS } from 'zur-shared';

test('MCP Streamable HTTP Server & Protocol (T057, T064)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const tokenService = new McpTokenService(db);
  const authorId = 'user-author-1';
  const guidoCourseId = 'course-python-foundations';
  const authorPassword = 'AuthorPass123!';

  // Create test token
  const tokenResult = tokenService.createToken(authorId, {
    password: authorPassword,
    label: 'Test Server Agent',
    scopes: TOKEN_SCOPE_PRESETS.full_course_control,
    courseRestrictions: [guidoCourseId],
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

  async function request(
    path: string,
    options: http.RequestOptions = {},
    body?: any,
    rawBody?: string | Buffer
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
    return new Promise((resolve, reject) => {
      const payload = rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined;
      const headers: Record<string, string> = {
        Host: `127.0.0.1:${port}`,
        ...(options.headers as any),
      };

      if (payload !== undefined && !headers['Content-Length'] && !headers['content-length']) {
        headers['Content-Length'] = String(Buffer.byteLength(payload));
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          ...options,
          headers,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve({
                status: res.statusCode || 500,
                headers: res.headers,
                body: data ? JSON.parse(data) : null,
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
      if (payload !== undefined) {
        req.write(payload);
      }
      req.end();
    });
  }

  t.after(() => {
    server.close();
  });

  await t.test('T057: Rejects non-POST HTTP methods on /mcp', async () => {
    const res = await request('/mcp', { method: 'GET' });
    assert.equal(res.status, 405);
    assert.equal(res.body.error.code, -32600);
    assert.ok(res.body.error.message.includes('POST'));
  });

  await t.test('T057: Rejects missing Host header', async () => {
    // Send HTTP/1.0 request without Host header via raw socket
    const rawReq = `POST /mcp HTTP/1.0\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`;
    const rawResponse = await new Promise<string>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
        socket.write(rawReq);
      });
      let data = '';
      socket.on('data', (d) => (data += d.toString()));
      socket.on('end', () => resolve(data));
    });
    assert.ok(rawResponse.startsWith('HTTP/1.1 400') || rawResponse.includes('400 Bad Request'));
  });

  await t.test('T057: Rejects untrusted foreign Origin header', async () => {
    const res = await request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-hacker.com',
        Authorization: `Bearer ${validRawToken}`,
      },
    }, { jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, -32003);
  });

  await t.test('T057: Allows loopback or matching Origin header', async () => {
    const res = await request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
        Authorization: `Bearer ${validRawToken}`,
      },
    }, { jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.result, {});
  });

  await t.test('T057: Rejects unsupported Content-Type', async () => {
    const res = await request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Authorization: `Bearer ${validRawToken}`,
      },
    }, 'raw string');
    assert.equal(res.status, 415);
  });

  await t.test('T057: Rejects missing Authorization header', async () => {
    const res = await request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }, { jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, -32001);
  });

  await t.test('T057: Rejects invalid or revoked token', async () => {
    const invalidRes = await request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer zur_at_fake_token',
      },
    }, { jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.equal(invalidRes.status, 401);

    // Revoke test token and test rejection
    tokenService.revokeToken(authorId, tokenId);
    const revokedRes = await request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validRawToken}`,
      },
    }, { jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.equal(revokedRes.status, 401);
    assert.ok(revokedRes.body.error.message.includes('revoked'));
  });

  // Create fresh active token for remaining tests
  const freshToken = tokenService.createToken(authorId, {
    password: authorPassword,
    label: 'Active Agent',
    scopes: TOKEN_SCOPE_PRESETS.full_course_control,
    courseRestrictions: [guidoCourseId],
    expiryDays: 30,
  });
  const activeBearer = `Bearer ${freshToken.rawToken}`;

  await t.test('T057: Enforces 1 MiB body size limit', async () => {
    const largeString = 'x'.repeat(1024 * 1024 + 100);
    const res = await request(
      '/mcp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: activeBearer,
        },
      },
      undefined,
      largeString
    );
    assert.equal(res.status, 413);
  });

  await t.test('T057: Returns parse error for invalid JSON body', async () => {
    const res = await request(
      '/mcp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: activeBearer,
        },
      },
      undefined,
      '{ broken json ...'
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, -32700);
  });

  await t.test('T057: Protocol method initialize', async () => {
    const res = await request(
      '/api/mcp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: activeBearer,
        },
      },
      {
        jsonrpc: '2.0',
        id: 'init-1',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
        },
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.jsonrpc, '2.0');
    assert.equal(res.body.id, 'init-1');
    assert.equal(res.body.result.protocolVersion, '2024-11-05');
    assert.equal(res.body.result.serverInfo.name, 'zur-mcp-server');
    assert.ok(res.body.result.capabilities.tools);
    assert.ok(res.body.result.capabilities.resources);
  });

  await t.test('T057: Protocol notification notifications/initialized', async () => {
    const res = await request(
      '/mcp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: activeBearer,
        },
      },
      {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      }
    );
    assert.equal(res.status, 204);
  });

  await t.test('T057: Protocol method ping', async () => {
    const res = await request(
      '/mcp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: activeBearer,
        },
      },
      {
        jsonrpc: '2.0',
        id: 42,
        method: 'ping',
      }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.id, 42);
    assert.deepEqual(res.body.result, {});
  });

  await t.test('T057: Protocol method resources/list', async () => {
    const res = await request(
      '/mcp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: activeBearer,
        },
      },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list',
      }
    );
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.result.resources));
    const uris = res.body.result.resources.map((r: any) => r.uri);
    assert.ok(uris.includes('zur://schema'));
    assert.ok(uris.includes('zur://markdown-guide'));
    assert.ok(uris.includes('zur://connection-info'));
  });

  await t.test('T057: Protocol method resources/read for all three resources', async () => {
    for (const uri of ['zur://schema', 'zur://markdown-guide', 'zur://connection-info']) {
      const res = await request(
        '/mcp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: activeBearer,
          },
        },
        {
          jsonrpc: '2.0',
          id: uri,
          method: 'resources/read',
          params: { uri },
        }
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.result.contents[0].uri, uri);
      assert.ok(res.body.result.contents[0].text.length > 0);
    }
  });

  await t.test('T057: Protocol method tools/list exposes all tools with schemas', async () => {
    const res = await request(
      '/mcp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: activeBearer,
        },
      },
      {
        jsonrpc: '2.0',
        id: 'tools-list',
        method: 'tools/list',
      }
    );
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.result.tools));
    const toolNames = res.body.result.tools.map((t: any) => t.name);

    // T058 tools
    assert.ok(toolNames.includes('get_author_context'));
    assert.ok(toolNames.includes('list_courses'));
    assert.ok(toolNames.includes('get_course'));

    // T059 tools
    assert.ok(toolNames.includes('create_course'));
    assert.ok(toolNames.includes('update_course_metadata'));
    assert.ok(toolNames.includes('create_module'));
    assert.ok(toolNames.includes('update_module'));
    assert.ok(toolNames.includes('delete_module'));
    assert.ok(toolNames.includes('create_lesson'));
    assert.ok(toolNames.includes('update_lesson'));
    assert.ok(toolNames.includes('delete_lesson'));
    assert.ok(toolNames.includes('create_step'));
    assert.ok(toolNames.includes('update_step'));
    assert.ok(toolNames.includes('delete_step'));
    assert.ok(toolNames.includes('duplicate_step'));

    // T060 tools
    assert.ok(toolNames.includes('create_image_upload'));
    assert.ok(toolNames.includes('complete_image_upload'));
    assert.ok(toolNames.includes('get_image'));
    assert.ok(toolNames.includes('update_image_metadata'));

    // T061 tools
    assert.ok(toolNames.includes('validate_exercise'));
    assert.ok(toolNames.includes('validate_course'));
    assert.ok(toolNames.includes('publish_course'));

    // T062 tools
    assert.ok(toolNames.includes('set_course_access'));
    assert.ok(toolNames.includes('archive_course'));
    assert.ok(toolNames.includes('restore_course'));
    assert.ok(toolNames.includes('delete_draft_course'));

    // T063 tool
    assert.ok(toolNames.includes('batch_author'));
  });

  await t.test('T057: Batch JSON-RPC array request handling', async () => {
    const res = await request(
      '/mcp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: activeBearer,
        },
      },
      [
        { jsonrpc: '2.0', id: 'b1', method: 'ping' },
        { jsonrpc: '2.0', id: 'b2', method: 'resources/list' },
      ]
    );

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].id, 'b1');
    assert.equal(res.body[1].id, 'b2');
  });

  await t.test('T064: Rate limit enforcement (60 calls/minute per token)', async () => {
    // Create dedicated token for rate limit test
    const rlToken = tokenService.createToken(authorId, {
      password: authorPassword,
      label: 'Rate Limit Test Agent',
      scopes: ['courses:read'],
      expiryDays: 1,
    });
    const rlBearer = `Bearer ${rlToken.rawToken}`;

    // Send 60 requests (allowed)
    for (let i = 0; i < 60; i++) {
      const res = await request(
        '/mcp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: rlBearer,
          },
        },
        { jsonrpc: '2.0', id: i, method: 'ping' }
      );
      assert.equal(res.status, 200);
    }

    // 61st request must trigger 429
    const blockedRes = await request(
      '/mcp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: rlBearer,
        },
      },
      { jsonrpc: '2.0', id: 61, method: 'ping' }
    );
    assert.equal(blockedRes.status, 429);
    assert.equal(blockedRes.body.error.code, -32029);
    assert.ok(blockedRes.headers['retry-after']);
  });
});

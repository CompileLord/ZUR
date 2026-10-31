import type { TestContext } from 'node:test';
import http from 'node:http';
import { getDatabase } from '../../../src/db/database.ts';
import { runMigrations } from '../../../src/db/migrate.ts';
import { seedDatabase } from '../../../src/db/seed.ts';
import { createServer } from '../../../src/server.ts';
import { McpTokenService } from '../../../src/services/mcp-token-service.ts';
import { TOKEN_SCOPE_PRESETS } from 'zur-shared';

export async function setupMcpToolsFixture(t: TestContext) {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const tokenService = new McpTokenService(db);
  const authorId = 'user-author-1'; // Guido van Rossum
  const guidoCourseId = 'course-python-foundations';
  const authorPassword = 'AuthorPass123!';

  // Full control token
  const fullControlResult = tokenService.createToken(authorId, {
    password: authorPassword,
    label: 'Full Control Agent',
    scopes: TOKEN_SCOPE_PRESETS.full_course_control,
    courseRestrictions: [guidoCourseId],
    expiryDays: 30,
  });
  const fullBearer = `Bearer ${fullControlResult.rawToken}`;

  // Read-only token
  const readOnlyResult = tokenService.createToken(authorId, {
    password: authorPassword,
    label: 'Read Only Agent',
    scopes: TOKEN_SCOPE_PRESETS.read_only,
    courseRestrictions: [guidoCourseId],
    expiryDays: 30,
  });
  const readOnlyBearer = `Bearer ${readOnlyResult.rawToken}`;

  const server = createServer(db);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const port = address.port;

  const mcpSessions = new Map<string, string>();
  async function initializeMcpSession(bearer: string): Promise<string> {
    const existing = mcpSessions.get(bearer);
    if (existing) return existing;
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { Authorization: bearer, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test-client', version: '1' },
      }}),
    });
    if (!response.ok) throw new Error(`MCP initialize failed: ${response.status}`);
    const id = response.headers.get('mcp-session-id');
    if (!id) throw new Error('MCP session ID missing');
    mcpSessions.set(bearer, id);
    return id;
  }

  async function callTool(toolName: string, toolArgs: any, bearer: string = fullBearer): Promise<any> {
    const sessionId = await initializeMcpSession(bearer);
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        id: `call-${Date.now()}-${Math.random()}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArgs,
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
            Authorization: bearer,
            Accept: 'application/json, text/event-stream',
            'mcp-session-id': sessionId,
            'mcp-protocol-version': '2025-11-25',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data.startsWith('event:') ? data.split('\n').find((line) => line.startsWith('data: '))!.slice(6) : data);
              resolve({ status: res.statusCode, body: parsed });
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  t.after(() => {
    server.close();
  });


  const state = { createdCourseId: '' };

  return { db, tokenService, authorId, guidoCourseId, authorPassword, fullControlResult, fullBearer, readOnlyResult, readOnlyBearer, server, address, port, mcpSessions, initializeMcpSession, callTool, state };
}

export type McpToolsFixture = Awaited<ReturnType<typeof setupMcpToolsFixture>>;

import type { TestContext } from 'node:test';
import http from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { getDatabase } from '../../../src/db/database.ts';
import { runMigrations } from '../../../src/db/migrate.ts';
import { seedDatabase, hashPassword } from '../../../src/db/seed.ts';
import { createServer } from '../../../src/server.ts';
import { McpTokenService } from '../../../src/services/mcp-token-service.ts';
import { TOKEN_SCOPE_PRESETS } from 'zur-shared';

export async function setupMcpE2eFixture(t: TestContext) {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const tokenService = new McpTokenService(db);
  const author1Id = 'user-author-1'; // Guido van Rossum
  const author2Id = 'user-author-2'; // Barbara Liskov
  const guidoCourseId = 'course-python-foundations';
  const authorPassword = 'AuthorPass123!';
  const author2Password = 'Author2Pass123!';

  // Seed Author 2 (Barbara Liskov) and a course owned by Author 2
  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, email_verified, capabilities, account_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, 'active', datetime('now'), datetime('now'))
  `).run(author2Id, 'barbara@zur.internal', hashPassword(author2Password), 'Barbara Liskov', JSON.stringify(['student', 'author']));

  db.prepare(`
    INSERT INTO courses (id, owner_id, title, description, category_id, visibility, enrollment_policy, draft_revision, created_at, updated_at)
    VALUES ('course-barbara', ?, 'Barbara Algorithms', 'Private course', 'cat-programming', 'private', 'invitation_only', 1, datetime('now'), datetime('now'))
  `).run(author2Id);

  // Full control token for Author 1 (scoped to guidoCourseId)
  const fullControlResult = tokenService.createToken(author1Id, {
    password: authorPassword,
    label: 'Guido Full Control Agent',
    scopes: TOKEN_SCOPE_PRESETS.full_course_control,
    courseRestrictions: [guidoCourseId],
    expiryDays: 30,
  });
  const fullBearer = `Bearer ${fullControlResult.rawToken}`;
  const fullTokenId = fullControlResult.token.id;

  // Unrestricted full control token for Author 1 (courseRestrictions: null)
  const unrestrictedResult = tokenService.createToken(author1Id, {
    password: authorPassword,
    label: 'Guido Unrestricted Agent',
    scopes: TOKEN_SCOPE_PRESETS.full_course_control,
    courseRestrictions: null,
    expiryDays: 30,
  });
  const unrestrictedBearer = `Bearer ${unrestrictedResult.rawToken}`;

  // Draft authoring token for Author 1 (no publish, no content:delete)
  const draftOnlyResult = tokenService.createToken(author1Id, {
    password: authorPassword,
    label: 'Guido Draft Only Agent',
    scopes: TOKEN_SCOPE_PRESETS.draft_authoring,
    courseRestrictions: [guidoCourseId],
    expiryDays: 30,
  });
  const draftOnlyBearer = `Bearer ${draftOnlyResult.rawToken}`;

  // Read only token for Author 1
  const readOnlyResult = tokenService.createToken(author1Id, {
    password: authorPassword,
    label: 'Guido Read Only Agent',
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

  const transports: StreamableHTTPClientTransport[] = [];
  const clients: Client[] = [];

  async function createOfficialSdkClient(rawToken?: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: {
        headers: rawToken ? { Authorization: `Bearer ${rawToken}` } : {},
      },
    });
    transports.push(transport);
    const client = new Client({ name: 'mcp-e2e-official-client', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    clients.push(client);
    return client;
  }

  const fullClient = await createOfficialSdkClient(fullControlResult.rawToken);
  const unrestrictedClient = await createOfficialSdkClient(unrestrictedResult.rawToken);
  const draftOnlyClient = await createOfficialSdkClient(draftOnlyResult.rawToken);
  const readOnlyClient = await createOfficialSdkClient(readOnlyResult.rawToken);

  t.after(async () => {
    for (const c of clients) {
      await c.close().catch(() => {});
    }
    for (const tr of transports) {
      await tr.close().catch(() => {});
    }
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

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

  async function callMcp(bearer: string | null, toolName: string, toolArgs: any): Promise<any> {
    const sessionId = bearer ? await initializeMcpSession(bearer) : undefined;
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

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
        Accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId, 'mcp-protocol-version': '2025-11-25' } : {}),
      };
      if (bearer) {
        headers['Authorization'] = bearer;
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'POST',
          headers,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              resolve({
                statusCode: res.statusCode,
                body: data ? JSON.parse(data.startsWith('event:') ? data.split('\n').find((line) => line.startsWith('data: '))!.slice(6) : data) : null,
              });
            } catch {
              resolve({
                statusCode: res.statusCode,
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

  async function requestApi(
    method: string,
    path: string,
    bearer: string | null,
    body?: any
  ): Promise<{ statusCode: number; body: any }> {
    return new Promise((resolve, reject) => {
      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      const headers: Record<string, string> = {};
      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(Buffer.byteLength(payload));
      }
      if (bearer) {
        headers['Authorization'] = bearer;
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              resolve({
                statusCode: res.statusCode || 500,
                body: data ? JSON.parse(data) : null,
              });
            } catch {
              resolve({
                statusCode: res.statusCode || 500,
                body: data,
              });
            }
          });
        }
      );

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // Obtain Author 1 session token for REST API endpoints
  const authLoginRes = await requestApi('POST', '/api/auth/sign-in', null, {
    email: 'guido@zur.internal',
    password: authorPassword,
  });
  const authorSessionBearer = `Bearer ${authLoginRes.body.token}`;

  // Obtain Author 2 session token
  const auth2LoginRes = await requestApi('POST', '/api/auth/sign-in', null, {
    email: 'barbara@zur.internal',
    password: author2Password,
  });
  const author2SessionBearer = `Bearer ${auth2LoginRes.body.token}`;

  return { db, tokenService, author1Id, author2Id, guidoCourseId, authorPassword, author2Password, fullControlResult, fullBearer, fullTokenId, unrestrictedResult, unrestrictedBearer, draftOnlyResult, draftOnlyBearer, readOnlyResult, readOnlyBearer, server, address, port, transports, clients, createOfficialSdkClient, fullClient, unrestrictedClient, draftOnlyClient, readOnlyClient, mcpSessions, initializeMcpSession, callMcp, requestApi, authLoginRes, authorSessionBearer, auth2LoginRes, author2SessionBearer };
}

export type McpE2eFixture = Awaited<ReturnType<typeof setupMcpE2eFixture>>;

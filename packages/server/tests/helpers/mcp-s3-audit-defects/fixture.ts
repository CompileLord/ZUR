import type { TestContext } from 'node:test';
import http from 'node:http';
import crypto from 'node:crypto';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { getDatabase } from '../../../src/db/database.ts';
import { runMigrations } from '../../../src/db/migrate.ts';
import { seedDatabase } from '../../../src/db/seed.ts';
import { createServer } from '../../../src/server.ts';
import { McpTokenService } from '../../../src/services/mcp-token-service.ts';
import { TOKEN_SCOPE_PRESETS } from 'zur-shared';

export async function setupS3AuditFixture(t: TestContext) {
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


  const state = { testCourseId: '', testCourseRevision: 1 };

  return { db, tokenService, authorId, authorPassword, tokenResult, validRawToken, tokenId, server, address, port, rawSessions, callMcp, samplePngBase64, samplePngBuffer, samplePngChecksum, state };
}

export type S3AuditFixture = Awaited<ReturnType<typeof setupS3AuditFixture>>;

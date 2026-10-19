import http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';

export const AUTHOR_EMAIL = 'guido@zur.internal';
export const AUTHOR_PASSWORD = 'AuthorPass123!';
export const FULL_SCOPES = [
  'courses:read', 'courses:create', 'content:write', 'content:delete',
  'media:write', 'exercises:validate', 'courses:publish', 'courses:manage',
];
// 1x1 PNG
export const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  raw: string;
  /** Parsed JSON body or, for SSE, the array/list of data payloads. */
  body: any;
  messages: any[];
}

export function rawRequest(
  port: number,
  path: string,
  method: string,
  headers: Record<string, string>,
  payload?: string | Buffer
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const h: Record<string, string> = { Host: `127.0.0.1:${port}`, ...headers };
    if (payload !== undefined) h['Content-Length'] = String(Buffer.byteLength(payload));
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: h }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let body: any = data;
        let messages: any[] = [];
        try {
          if (data.includes('event:') || data.startsWith('data:')) {
            messages = data
              .split('\n')
              .filter((l) => l.startsWith('data: '))
              .map((l) => JSON.parse(l.slice(6)));
            body = messages.length === 1 ? messages[0] : messages;
          } else if (data) {
            body = JSON.parse(data);
            messages = Array.isArray(body) ? body : [body];
          }
        } catch {
          /* leave raw */
        }
        resolve({ status: res.statusCode || 0, headers: res.headers, raw: data, body, messages });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

export interface Harness {
  db: DatabaseSync;
  port: number;
  server: http.Server;
  close(): Promise<void>;
  api(method: string, path: string, body?: any, sessionToken?: string): Promise<HttpResult>;
  signIn(email?: string, password?: string): Promise<string>;
  createToken(opts?: { label?: string; scopes?: string[]; courseRestrictions?: string[] | null; expiryDays?: number }): Promise<{ id: string; rawToken: string; token: any; session: string }>;
  connect(rawToken: string): Promise<McpHttpClient>;
}

export class McpHttpClient {
  sessionId = '';
  private nextId = 1;
  port: number;
  rawToken: string;
  constructor(port: number, rawToken: string) {
    this.port = port;
    this.rawToken = rawToken;
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.rawToken}`,
      ...(this.sessionId ? { 'mcp-session-id': this.sessionId, 'mcp-protocol-version': '2025-11-25' } : {}),
      ...extra,
    };
  }

  async initialize(): Promise<HttpResult> {
    const res = await rawRequest(this.port, '/mcp', 'POST', this.headers(), JSON.stringify({
      jsonrpc: '2.0', id: this.nextId++, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'w6-test', version: '1' } },
    }));
    const sid = res.headers['mcp-session-id'];
    if (sid) this.sessionId = String(sid);
    if (this.sessionId) {
      await rawRequest(this.port, '/mcp', 'POST', this.headers(), JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    }
    return res;
  }

  post(body: any): Promise<HttpResult> {
    return rawRequest(this.port, '/mcp', 'POST', this.headers(), JSON.stringify(body));
  }

  async rpc(method: string, params?: any): Promise<HttpResult> {
    return this.post({ jsonrpc: '2.0', id: this.nextId++, method, params });
  }

  async call(name: string, args: any = {}): Promise<{ res: HttpResult; isError: boolean; text: string; json: any; rpcError: any }> {
    const res = await this.rpc('tools/call', { name, arguments: args });
    const msg = res.body;
    const rpcError = msg?.error ?? null;
    const result = msg?.result;
    const text: string = result?.content?.[0]?.text ?? rpcError?.message ?? '';
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* plain text */ }
    return { res, isError: Boolean(result?.isError) || Boolean(rpcError), text, json, rpcError };
  }
}

/** Starts the real HTTP server on a random port. Pass a temp-file path for a second, independent DB. */
export async function startHarness(dbPath: string = ':memory:'): Promise<Harness> {
  const db = getDatabase(dbPath);
  runMigrations(dbPath);
  seedDatabase(dbPath);
  const server = createServer(db);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as any).port as number;

  const api = (method: string, path: string, body?: any, sessionToken?: string) =>
    rawRequest(port, path, method, {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    }, body === undefined ? undefined : JSON.stringify(body));

  const signIn = async (email = AUTHOR_EMAIL, password = AUTHOR_PASSWORD) => {
    const r = await api('POST', '/api/auth/sign-in', { email, password });
    if (r.status !== 200) throw new Error(`sign-in failed ${r.status} ${r.raw}`);
    return r.body.token as string;
  };

  return {
    db, port, server, api, signIn,
    async createToken(opts = {}) {
      const session = await signIn();
      const r = await api('POST', '/api/author/tokens', {
        password: AUTHOR_PASSWORD,
        label: opts.label ?? 'w6 agent',
        scopes: opts.scopes ?? FULL_SCOPES,
        expiryDays: opts.expiryDays ?? 30,
        courseRestrictions: opts.courseRestrictions === undefined ? null : opts.courseRestrictions,
      }, session);
      if (r.status !== 201) throw new Error(`create token failed ${r.status} ${r.raw}`);
      return { id: r.body.token.id, rawToken: r.body.rawToken, token: r.body.token, session };
    },
    async connect(rawToken: string) {
      const c = new McpHttpClient(port, rawToken);
      await c.initialize();
      return c;
    },
    async close() {
      (server as any).closeAllConnections?.();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

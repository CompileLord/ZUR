import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDatabase, closeDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { createServer } from '../src/server.ts';
import { getClientIp, isHttpsRequest } from '../src/http/client-ip.ts';
import { validateProductionConfig, checkProductionConfig } from '../src/http/config.ts';
import { assertCsrfSafe, sessionCookie, allowedCorsOrigins } from '../src/http/security.ts';
import { checkReadiness } from '../src/http/observability.ts';

async function start(timeouts?: any) {
  const dbPath = `file-w4s1-${Math.random().toString(36).slice(2)}`;
  void dbPath;
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  const server = createServer(db, timeouts ? { timeouts } : {});
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  return { server, port, db, close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }) };
}

function req(port: number, opts: { method?: string; path: string; headers?: Record<string, string>; body?: string }) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }>((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: opts.method || 'GET', path: opts.path, headers: opts.headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, text }));
    });
    r.on('error', reject);
    if (opts.body !== undefined) r.write(opts.body);
    r.end();
  });
}
const JSON_H = { 'Content-Type': 'application/json' };
const fake = (headers: Record<string, string>, remote = '10.0.0.9') => ({ headers, socket: { remoteAddress: remote }, method: 'POST' }) as any;

test('body parsing: invalid JSON, wrong types, non-object, content type, size', async () => {
  const s = await start();
  try {
    let r = await req(s.port, { method: 'POST', path: '/api/auth/sign-in', headers: JSON_H, body: '{nope' });
    assert.equal(r.status, 400); assert.equal(JSON.parse(r.text).error.code, 'VALIDATION_ERROR');
    r = await req(s.port, { method: 'POST', path: '/api/auth/sign-in', headers: JSON_H, body: '{"email":5,"password":{}}' });
    assert.equal(r.status, 400);
    r = await req(s.port, { method: 'POST', path: '/api/auth/sign-in', headers: JSON_H, body: '[1]' });
    assert.equal(r.status, 400);
    r = await req(s.port, { method: 'POST', path: '/api/auth/sign-in', headers: JSON_H, body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(2000) }) });
    assert.equal(r.status, 400);
    r = await req(s.port, { method: 'POST', path: '/api/auth/sign-in', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(r.status, 415);
    r = await req(s.port, { method: 'POST', path: '/api/auth/sign-in', headers: JSON_H, body: JSON.stringify({ pad: 'x'.repeat(1024 * 1024 + 10) }) }).catch((e) => ({ status: -1, text: String(e) } as any));
    assert.ok(r.status === 413 || r.status === -1, `got ${r.status}`);
    r = await req(s.port, { method: 'POST', path: '/api/auth/sign-out' });
    assert.equal(r.status, 200); // empty body needs no content type
  } finally { await s.close(); }
});

test('security headers on every response, no wildcard CORS, HSTS only for https', async () => {
  const s = await start();
  try {
    const r = await req(s.port, { path: '/healthz', headers: { Origin: 'http://evil.example' } });
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-frame-options'], 'DENY');
    assert.equal(r.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.match(String(r.headers['permissions-policy']), /camera=\(\)/);
    assert.equal(r.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['access-control-allow-origin'], undefined);
    assert.equal(r.headers['strict-transport-security'], undefined);
    assert.ok(r.headers['x-request-id']);
    const ok = await req(s.port, { path: '/healthz', headers: { Origin: 'http://localhost:5173' } });
    assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.match(String(ok.headers.vary), /Origin/);
    const pre = await req(s.port, { method: 'OPTIONS', path: '/api/auth/me', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PUT' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers['access-control-allow-origin'], 'http://localhost:5173');
    const bad = await req(s.port, { method: 'OPTIONS', path: '/api/auth/me', headers: { Origin: 'http://evil.example' } });
    assert.equal(bad.status, 204); assert.equal(bad.headers['access-control-allow-origin'], undefined);
  } finally { await s.close(); }
});

test('HSTS and Secure cookie via trusted forwarded proto / production', () => {
  const env = { ZUR_TRUST_PROXY: '1' };
  assert.equal(isHttpsRequest(fake({ 'x-forwarded-proto': 'https' }), env), true);
  assert.equal(isHttpsRequest(fake({ 'x-forwarded-proto': 'https' }), {}), false);
  assert.match(sessionCookie(fake({ 'x-forwarded-proto': 'https' }), 't', env), /; Secure;/);
  assert.doesNotMatch(sessionCookie(fake({}), 't', {}), /Secure/);
  assert.match(sessionCookie(fake({}), 't', { NODE_ENV: 'production' }), /HttpOnly; SameSite=Lax; Secure/);
});

test('getClientIp honors ZUR_TRUST_PROXY and ignores spoofed headers otherwise', () => {
  const r = fake({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }, '::ffff:10.0.0.2');
  assert.equal(getClientIp(r, {}), '10.0.0.2');
  assert.equal(getClientIp(r, { ZUR_TRUST_PROXY: '0' }), '10.0.0.2');
  assert.equal(getClientIp(r, { ZUR_TRUST_PROXY: '1' }), '203.0.113.7');
  assert.equal(getClientIp(r, { ZUR_TRUST_PROXY: '2' }), '6.6.6.6');
  assert.equal(getClientIp(fake({ 'x-forwarded-for': 'garbage' }), { ZUR_TRUST_PROXY: '1' }), '10.0.0.9');
});

test('CSRF: cookie-authenticated state changes need same-origin; Bearer and cookie-less pass', () => {
  const host = { host: 'zur.example' };
  const cookie = { cookie: 'zur_session=abc', ...host };
  assert.throws(() => assertCsrfSafe(fake({ ...cookie, origin: 'https://evil.example' }), {}));
  assert.throws(() => assertCsrfSafe(fake({ ...cookie, 'sec-fetch-site': 'cross-site' }), {}));
  assertCsrfSafe(fake({ ...cookie, origin: 'https://zur.example' }), {});
  assertCsrfSafe(fake({ ...cookie, 'sec-fetch-site': 'same-origin' }), {});
  assertCsrfSafe(fake({ ...cookie }), {});
  assertCsrfSafe(fake({ ...cookie, origin: 'https://evil.example', authorization: 'Bearer x' }), {});
  assertCsrfSafe(fake({ ...host, origin: 'https://evil.example' }), {});
  assert.deepEqual(allowedCorsOrigins({ NODE_ENV: 'production' }), []);
  assert.deepEqual(allowedCorsOrigins({ CORS_ALLOWED_ORIGINS: 'https://a.example, https://b.example' }), ['https://a.example', 'https://b.example']);
});

test('CSRF enforced over HTTP for cookie sessions', async () => {
  const s = await start();
  try {
    const r = await req(s.port, { method: 'POST', path: '/api/auth/sign-out', headers: { Cookie: 'zur_session=abc', Origin: 'http://evil.example' } });
    assert.equal(r.status, 403);
    const ok = await req(s.port, { method: 'POST', path: '/api/auth/sign-out', headers: { Cookie: 'zur_session=abc', Origin: `http://127.0.0.1:${s.port}` } });
    assert.equal(ok.status, 200);
    assert.match(String(ok.headers['set-cookie']), /Max-Age=0/);
  } finally { await s.close(); }
});

test('readyz reports ready with queue info and 503 when the database is gone', async () => {
  const s = await start();
  try {
    const r = await req(s.port, { path: '/readyz' });
    assert.equal(r.status, 200);
    const body = JSON.parse(r.text);
    assert.equal(body.status, 'ready'); assert.equal(body.queue.queued, 0);
    assert.equal((await req(s.port, { path: '/healthz' })).text, '{"status":"ok"}');
  } finally { await s.close(); }
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  db.exec('DELETE FROM _migrations WHERE id = (SELECT MAX(id) FROM _migrations)');
  const res = checkReadiness(db);
  assert.equal(res.ok, false); assert.equal((res.body as any).reason, 'migrations_pending');
  closeDatabase(':memory:');
  assert.equal((checkReadiness(db).body as any).reason, 'database_unavailable');
});

test('slow-loris: incomplete headers are dropped by headersTimeout', async () => {
  const s = await start({ headersTimeout: 300, requestTimeout: 1000, connectionsCheckingInterval: 100 });
  try {
    const closed = await new Promise<boolean>((resolve) => {
      const sock = net.connect(s.port, '127.0.0.1', () => sock.write('GET /healthz HTTP/1.1\r\nHost: x\r\n'));
      sock.resume();
      sock.on('close', () => resolve(true));
      sock.on('error', () => resolve(true));
      setTimeout(() => resolve(false), 8000);
    });
    assert.equal(closed, true);
  } finally { await s.close(); }
});

test('production config validation aggregates problems without leaking secrets', () => {
  assert.throws(() => validateProductionConfig({ NODE_ENV: 'production' }), (e: Error) => /DATABASE_URL/.test(e.message) && /APP_BASE_URL/.test(e.message) && /POSTMARK_SERVER_TOKEN/.test(e.message) && /MCP_ALLOWED_HOSTS/.test(e.message));
  const bad = { DATABASE_URL: '/d/zur.sqlite', DELETION_REGISTRY_PATH: '/d/reg.json', APP_BASE_URL: 'http://x.example', POSTMARK_SERVER_TOKEN: 'SECRET-TOKEN-VALUE', EMAIL_FROM: 'a@b.c', MCP_ALLOWED_HOSTS: 'x.example' };
  assert.throws(() => validateProductionConfig(bad), (e: Error) => /outside the directory/.test(e.message) && /https/.test(e.message) && !e.message.includes('SECRET-TOKEN-VALUE'));
  const good = { ...bad, DELETION_REGISTRY_PATH: '/r/reg.json', APP_BASE_URL: 'https://x.example' };
  assert.deepEqual(checkProductionConfig(good).errors, []);
  assert.equal(validateProductionConfig(good).length, 1); // ZUR_TRUST_PROXY warning
});

function child(args: string[], env: Record<string, string>) {
  return spawn(process.execPath, ['--experimental-strip-types', ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
}
function collect(p: ReturnType<typeof child>) {
  let out = '';
  p.stdout!.on('data', (d) => (out += d)); p.stderr!.on('data', (d) => (out += d));
  return () => out;
}

test('process: production boot fails readably when misconfigured, boots and shuts down gracefully when valid', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w4s1-'));
  const index = path.resolve(import.meta.dirname, '../src/index.ts');
  const bad = child([index], { NODE_ENV: 'production', DATABASE_URL: path.join(dir, 'db', 'z.sqlite'), PORT: '0' });
  const badOut = collect(bad);
  const code = await new Promise((r) => bad.on('exit', r));
  assert.equal(code, 1); assert.match(badOut(), /Invalid production configuration/);

  fs.mkdirSync(path.join(dir, 'reg'), { recursive: true }); fs.writeFileSync(path.join(dir, 'reg', 'r.json'), '');
  const good = child([index], {
    NODE_ENV: 'production', DATABASE_URL: path.join(dir, 'db', 'z.sqlite'), DELETION_REGISTRY_PATH: path.join(dir, 'reg', 'r.json'),
    APP_BASE_URL: 'https://zur.example', POSTMARK_SERVER_TOKEN: 'tok', EMAIL_FROM: 'noreply@zur.example', MCP_ALLOWED_HOSTS: 'zur.example', PORT: '39871',
  });
  const out = collect(good);
  for (let i = 0; i < 100 && !/listening/.test(out()); i++) await new Promise((r) => setTimeout(r, 100));
  assert.match(out(), /listening/);
  const r = await req(39871, { path: '/readyz', headers: { 'X-Forwarded-Proto': 'https' } });
  assert.equal(r.status, 200);
  good.kill('SIGTERM');
  const exitCode = await new Promise((res) => good.on('exit', res));
  assert.equal(exitCode, 0); assert.match(out(), /shutdown\.complete/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('process: uncaught exception logs structured error and exits non-zero after cleanup', async () => {
  const shutdown = path.resolve(import.meta.dirname, '../src/http/shutdown.ts');
  const script = `import http from 'node:http';import { installShutdownHandlers } from ${JSON.stringify(shutdown)};
const server = http.createServer(); server.listen(0, () => { installShutdownHandlers({ server, cleanup: () => console.log('CLEANED') }); setTimeout(() => { throw new Error('boom'); }, 20); });`;
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'w4s1-')), 'c.mts');
  fs.writeFileSync(f, script);
  const p = child([f], {});
  const out = collect(p);
  const code = await new Promise((r) => p.on('exit', r));
  assert.equal(code, 1); assert.match(out(), /process\.uncaughtException/); assert.match(out(), /CLEANED/);
});

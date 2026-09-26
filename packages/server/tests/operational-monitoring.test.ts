import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { getDatabase, closeDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';
import { OperationalMetricsService } from '../src/services/operational-metrics-service.ts';

function setup() {
  const path = `file:ops-${crypto.randomUUID()}?mode=memory&cache=shared`;
  runMigrations(path);
  seedDatabase(path);
  return { path, db: getDatabase(path), cleanup: () => closeDatabase(path) };
}

test('Operational metrics aggregate safe request families and actionable alerts', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const metrics = new OperationalMetricsService();
  const now = Date.now();
  for (let i = 0; i < 3; i++) metrics.recordRequest('PUT', '/api/drafts', 503, 120 + i, now - 100);
  for (let i = 0; i < 20; i++) metrics.recordRequest('POST', '/api/auth/sign-in', 401, 18, now - 50);
  metrics.recordRequest('GET', '/api/private/course/secret-id', 403, 10, now - 40);
  const enrollment = db.prepare("SELECT id FROM enrollments WHERE user_id='user-student-1' LIMIT 1").get() as any;
  const step = db.prepare('SELECT id FROM steps LIMIT 1').get() as any;
  db.prepare(`INSERT INTO execution_jobs(id,user_id,enrollment_id,step_id,job_type,code,status,created_at,updated_at)
    VALUES('old-queued','user-student-1',?,?, 'submit','print(1)','queued',?,?)`).run(enrollment.id, step.id, new Date(now - 60_000).toISOString(), new Date(now - 60_000).toISOString());
  const snapshot = metrics.snapshot(db, now);
  assert.equal(snapshot.requestMetrics.recentByFamily.autosave.failures, 3);
  assert.equal(snapshot.requestMetrics.recentByFamily.auth.failures, 20);
  assert.equal(snapshot.execution.queueAgeSeconds, 60);
  assert.ok(snapshot.alerts.some((alert) => alert.code === 'autosave.recent_failures'));
  assert.ok(snapshot.alerts.some((alert) => alert.code === 'auth.recent_failures'));
  assert.ok(snapshot.alerts.some((alert) => alert.code === 'execution.queue_age'));
  assert.equal(JSON.stringify(snapshot).includes('secret-id'), false);
  assert.equal(JSON.stringify(snapshot).includes('print(1)'), false);
});

test('Health check and admin metrics expose request IDs without exposing metrics to unauthenticated callers', async (t) => {
  const { db, cleanup } = setup();
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    cleanup();
  });

  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json() as any).status, 'ok');
  assert.match(health.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/i);
  assert.equal(health.headers.get('access-control-expose-headers'), 'X-Request-Id');

  const denied = await fetch(`${base}/api/admin/operations/metrics`);
  assert.equal(denied.status, 401);
  assert.ok(denied.headers.get('x-request-id'));

  const login = await fetch(`${base}/api/auth/sign-in`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'margaret@zur.internal', password: 'AdminPass123!' }),
  });
  assert.equal(login.status, 200);
  const { token } = await login.json() as any;
  const response = await fetch(`${base}/api/admin/operations/metrics`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.ok(body.requestMetrics.recentByFamily.health.requests >= 1);
  assert.ok(body.requestMetrics.recentByFamily.auth.requests >= 1);
  assert.equal(body.execution.separateWorkerHeartbeat, 'Unavailable — this deployment has no separate worker heartbeat.');
  assert.equal(JSON.stringify(body).includes(token), false);
  const overviewResponse = await fetch(`${base}/api/admin/operations`, { headers: { authorization: `Bearer ${token}` } });
  const overview = await overviewResponse.json() as any;
  assert.equal(overviewResponse.status, 200);
  assert.ok(Array.isArray(overview.operational.alerts));
  assert.match(overview.workers.health, /no separate worker heartbeat configured/);
});

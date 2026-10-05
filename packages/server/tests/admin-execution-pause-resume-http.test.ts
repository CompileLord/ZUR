import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { getDatabase, closeDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';
import type { AddressInfo } from 'node:net';

test('HTTP Admin Execution Pause/Resume Endpoint Regression (requireAdmin verification)', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-admin-exec-http-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  runMigrations(dbPath);
  seedDatabase(dbPath);
  const db = getDatabase(dbPath);

  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    closeDatabase(dbPath);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Helper to sign in
  async function signIn(email: string, pass: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json() as any;
    return json.token;
  }

  const adminToken = await signIn('margaret@zur.internal', 'AdminPass123!');
  const studentToken = await signIn('ada@zur.internal', 'StudentPass123!');
  const authorToken = await signIn('guido@zur.internal', 'AuthorPass123!');

  // 1. Unauthenticated requests are rejected with 401
  const unauthStatus = await fetch(`${baseUrl}/api/admin/execution/status`);
  assert.strictEqual(unauthStatus.status, 401);

  const unauthPause = await fetch(`${baseUrl}/api/admin/execution/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Maintenance', currentPassword: 'AdminPass123!' }),
  });
  assert.strictEqual(unauthPause.status, 401);

  // 2. Non-admin users (student & author) receive 404 from requireAdmin boundary
  const studentPause = await fetch(`${baseUrl}/api/admin/execution/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({ reason: 'Student trying to pause', currentPassword: 'StudentPass123!' }),
  });
  assert.strictEqual(studentPause.status, 404);

  const authorResume = await fetch(`${baseUrl}/api/admin/execution/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorToken}` },
    body: JSON.stringify({ reason: 'Author trying to resume', currentPassword: 'AuthorPass123!' }),
  });
  assert.strictEqual(authorResume.status, 404);

  // 3. Admin request with incorrect password fails with 401
  const badPassPause = await fetch(`${baseUrl}/api/admin/execution/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reason: 'Emergency maintenance', currentPassword: 'WrongPassword!' }),
  });
  assert.strictEqual(badPassPause.status, 401);

  // 4. Admin request with missing reason fails with 400
  const noReasonPause = await fetch(`${baseUrl}/api/admin/execution/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reason: '', currentPassword: 'AdminPass123!' }),
  });
  assert.strictEqual(noReasonPause.status, 400);

  // 5. Successful pause transitions state to paused
  const pauseRes = await fetch(`${baseUrl}/api/admin/execution/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reason: 'Scheduled container runtime upgrade', currentPassword: 'AdminPass123!' }),
  });
  assert.strictEqual(pauseRes.status, 200);
  const pauseJson = await pauseRes.json() as any;
  assert.strictEqual(pauseJson.executionPaused, true);

  // Status reflects paused
  const statusRes1 = await fetch(`${baseUrl}/api/admin/execution/status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(statusRes1.status, 200);
  const statusJson1 = await statusRes1.json() as any;
  assert.strictEqual(statusJson1.executionPaused, true);

  // 6. Successful resume transitions state back to unpaused
  const resumeRes = await fetch(`${baseUrl}/api/admin/execution/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reason: 'Upgrade completed and verified', currentPassword: 'AdminPass123!' }),
  });
  assert.strictEqual(resumeRes.status, 200);
  const resumeJson = await resumeRes.json() as any;
  assert.strictEqual(resumeJson.executionPaused, false);

  // Status reflects unpaused
  const statusRes2 = await fetch(`${baseUrl}/api/admin/execution/status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.strictEqual(statusRes2.status, 200);
  const statusJson2 = await statusRes2.json() as any;
  assert.strictEqual(statusJson2.executionPaused, false);
});

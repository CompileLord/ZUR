import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';

// A wrong password in a re-authentication dialog is a form error, not an expired session:
// the browser client signs the user out on any 401, so these must answer 400 and keep the session.
test('wrong re-auth password returns 400 and leaves the session signed in', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const signIn = async (email: string, password: string) => {
    const response = await fetch(`${origin}/api/auth/sign-in`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    return { Authorization: `Bearer ${(await response.json() as any).token}`, 'Content-Type': 'application/json' };
  };
  const stillSignedIn = async (headers: Record<string, string>) => (await fetch(`${origin}/api/auth/me`, { headers })).status === 200;

  const author = await signIn('guido@zur.internal', 'AuthorPass123!');
  const create = await fetch(`${origin}/api/author/tokens`, {
    method: 'POST', headers: author, body: JSON.stringify({ label: 'Claude Desktop', scopes: ['courses:read'], password: 'WrongPassword1!' }),
  });
  assert.equal(create.status, 400);
  assert.equal((await create.json() as any).error.message, 'Password is incorrect.');
  assert.equal(await stillSignedIn(author), true);

  const admin = await signIn('margaret@zur.internal', 'AdminPass123!');
  const pause = await fetch(`${origin}/api/admin/execution/pause`, {
    method: 'POST', headers: admin, body: JSON.stringify({ currentPassword: 'WrongPassword1!', reason: 'maintenance' }),
  });
  assert.equal(pause.status, 400);
  assert.equal((await pause.json() as any).error.message, 'Password is incorrect.');
  assert.equal(await stillSignedIn(admin), true);
});

test('password checks on AI-connection token creation are rate limited per user', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const session = await fetch(`${origin}/api/auth/sign-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'guido@zur.internal', password: 'AuthorPass123!' }),
  });
  const headers = { Authorization: `Bearer ${(await session.json() as any).token}`, 'Content-Type': 'application/json' };
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const response = await fetch(`${origin}/api/author/tokens`, {
      method: 'POST', headers, body: JSON.stringify({ label: 'Guess', scopes: ['courses:read'], password: `Guess${i}xx!` }),
    });
    statuses.push(response.status);
  }
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(400));
  assert.equal(statuses.at(-1), 429);
});

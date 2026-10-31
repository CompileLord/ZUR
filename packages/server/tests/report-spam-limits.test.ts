import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';

async function startServer(t: any) {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const signIn = await fetch(`${origin}/api/auth/sign-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ada@zur.internal', password: 'StudentPass123!' }),
  });
  const headers = { Authorization: `Bearer ${(await signIn.json() as any).token}`, 'Content-Type': 'application/json' };
  const report = (description: string) => fetch(`${origin}/api/reports`, {
    method: 'POST', headers, body: JSON.stringify({ courseId: 'course-python-foundations', stepId: 'step-6-python-evenodd', type: 'broken_exercise', description }),
  });
  return { db, report };
}

// A double-click or retry must not file the same report twice.
test('resubmitting an identical open report returns the existing one', async (t) => {
  const { db, report } = await startServer(t);
  const first = await (await report('The sample test expects "Even" for 0 but the prompt says positive only.')).json() as any;
  const again = await (await report('The sample test expects "Even" for 0 but the prompt says positive only.')).json() as any;
  assert.equal(again.id, first.id);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM reports WHERE reporter_id = 'user-student-1' AND description LIKE 'The sample test%'").get() as any).n, 1);
  const other = await (await report('Hidden test times out on valid input.')).json() as any;
  assert.notEqual(other.id, first.id);
});

test('one account cannot flood the moderation queue', async (t) => {
  const { report } = await startServer(t);
  const statuses: number[] = [];
  for (let i = 0; i < 25; i++) statuses.push((await report(`Distinct problem number ${i} with this exercise.`)).status);
  assert.ok(statuses.slice(0, 20).every((s) => s === 201));
  assert.equal(statuses.at(-1), 429);
});

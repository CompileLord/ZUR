import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';

test('quiz submissions must name listed options; oversized or malformed selections are rejected before grading', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const session = await fetch(`${origin}/api/auth/sign-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ada@zur.internal', password: 'StudentPass123!' }),
  });
  const headers = { Authorization: `Bearer ${(await session.json() as any).token}`, 'Content-Type': 'application/json' };
  const submit = (selectedOptionIds: unknown) => fetch(`${origin}/api/steps/step-3-quiz-single/quiz/submit`, {
    method: 'POST', headers, body: JSON.stringify({ enrollmentId: 'enr-ada', selectedOptionIds }),
  });
  const attempts = () => (db.prepare("SELECT COUNT(*) AS n FROM assessment_attempts WHERE step_id = 'step-3-quiz-single'").get() as any).n;
  const before = attempts();

  for (const bad of [Array.from({ length: 50_000 }, (_, i) => `opt-${i}`), ['not-an-option'], [42], 'opt-1']) {
    const response = await submit(bad);
    assert.equal(response.status, 400, JSON.stringify(bad).slice(0, 40));
  }
  assert.equal(attempts(), before, 'rejected selections are not stored as attempts');

  const ok = await submit(['opt-1']);
  assert.equal(ok.status, 200);
});

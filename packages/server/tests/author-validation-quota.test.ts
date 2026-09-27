import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { AuthorValidationQuota } from '../src/services/author-validation-quota.ts';

test('Author validation quota is shared across requests and active operations', () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const quota = new AuthorValidationQuota(db);
  const release1 = quota.acquire('user-author-1');
  const release2 = quota.acquire('user-author-1');
  assert.throws(() => quota.acquire('user-author-1'));
  release1(); release2();
  for (let index = 0; index < 28; index++) quota.acquire('user-author-1')();
  assert.throws(() => quota.acquire('user-author-1'));
  assert.doesNotThrow(() => quota.acquire('user-admin-1')());
});

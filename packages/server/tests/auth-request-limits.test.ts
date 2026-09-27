import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { IdentityService } from '../src/services/identity-service.ts';
import { RateLimitError } from 'zur-shared';

test('Authentication admission limits persist across service instances and isolate keys', () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  const first = new IdentityService(db);
  const second = new IdentityService(db);
  first.consumeRequestRateLimit('recovery-email', 'person@example.com', 2, 60_000);
  second.consumeRequestRateLimit('recovery-email', 'person@example.com', 2, 60_000);
  assert.throws(() => first.consumeRequestRateLimit('recovery-email', 'person@example.com', 2, 60_000), RateLimitError);
  second.consumeRequestRateLimit('recovery-email', 'other@example.com', 2, 60_000);
  second.consumeRequestRateLimit('resend-email', 'person@example.com', 2, 60_000);
  const stored = db.prepare('SELECT key_hash FROM auth_request_limits').all() as Array<{ key_hash: string }>;
  assert.equal(stored.length, 3);
  assert.ok(stored.every((row) => !row.key_hash.includes('@')));
});

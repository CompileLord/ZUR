import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { IdentityService } from '../src/services/identity-service.ts';
import { ValidationError } from 'zur-shared';

// Request bodies are untyped JSON; a wrong type is the client's mistake (400), not a server crash (500).
test('profile update rejects a non-string display name as a validation error', () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const identity = new IdentityService(db);
  for (const displayName of [42, [], {}, null]) {
    assert.throws(() => identity.updateProfile('user-student-1', { displayName } as any), ValidationError);
  }
  assert.throws(() => identity.updateProfile('user-student-1', null as any), ValidationError);
  identity.dispose();
});

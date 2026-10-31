import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { IdentityService } from '../src/services/identity-service.ts';
import { ValidationError } from 'zur-shared';

// A stolen or unattended session must not be enough to export all personal data or delete the account.
test('data export and account deletion require the current password by default', () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const identity = new IdentityService(db);
  assert.throws(() => identity.requestDataExport('user-student-1'), ValidationError);
  assert.throws(() => identity.requestDataExport('user-student-1', 'Wrong-password-1'), /incorrect/);
  assert.ok(identity.requestDataExport('user-student-1', 'StudentPass123!').requestId);
  assert.throws(() => identity.requestAccountDeletion('user-student-1', true), ValidationError);
  identity.dispose();
});

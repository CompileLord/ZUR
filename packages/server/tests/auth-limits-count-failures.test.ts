import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { IdentityService } from '../src/services/identity-service.ts';
import { RateLimitError } from 'zur-shared';

function setup() {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const admin = db.prepare("SELECT id FROM users WHERE email='margaret@zur.internal'").get() as { id: string };
  return { db, adminId: admin.id };
}

// An admin handling an incident confirms many actions in a row; correct passwords must never lock them out.
test('admin re-auth does not count correct passwords toward the lockout', () => {
  const { db, adminId } = setup();
  const identity = new IdentityService(db);
  for (let i = 0; i < 25; i++) assert.equal(identity.verifyCurrentPassword(adminId, 'AdminPass123!'), true);
  identity.dispose();
});

test('admin re-auth locks after repeated wrong passwords, across service instances', () => {
  const { db, adminId } = setup();
  const first = new IdentityService(db);
  for (let i = 0; i < 5; i++) assert.throws(() => first.verifyCurrentPassword(adminId, 'Wrong-password-1'), /incorrect/);
  first.dispose();
  const second = new IdentityService(db);
  assert.throws(() => second.verifyCurrentPassword(adminId, 'AdminPass123!'), RateLimitError);
  second.dispose();
});

// A classroom or campus shares one public IP; successful sign-ins from it must not lock the room out.
test('successful sign-ins from one shared IP are not capped', () => {
  const { db } = setup();
  const identity = new IdentityService(db);
  for (let i = 0; i < 70; i++) identity.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!', ipAddress: '203.0.113.7' });
  identity.dispose();
});

test('many failed sign-ins from one IP across different emails are capped', () => {
  const { db } = setup();
  const identity = new IdentityService(db);
  let limited = false;
  for (let i = 0; i < 200 && !limited; i++) {
    try { identity.signIn({ email: `nobody${i}@example.com`, password: 'Wrong-password-1', ipAddress: '203.0.113.9' }); }
    catch (error) { limited = error instanceof RateLimitError; }
  }
  assert.equal(limited, true);
  identity.dispose();
});

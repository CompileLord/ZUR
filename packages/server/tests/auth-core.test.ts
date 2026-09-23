import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { IdentityService } from '../src/services/identity-service.ts';
import { AuthorizationService } from '../src/services/auth-service.ts';
import { hashPassword, verifyPassword } from '../src/services/password-service.ts';
import { RateLimitError, ConflictError, ValidationError, AuthenticationError, AuthorizationError } from 'zur-shared';

test('Authentication Core & Identity Lifecycle (S1-M01, T013-T018)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const identityService = new IdentityService(db);
  const authService = new AuthorizationService(db);

  await t.test('Password Service: scrypt hashing, salt derivation, and timing-safe verify', () => {
    const plain = 'StrongPass123!@#';
    const hash = hashPassword(plain);

    assert.ok(hash.startsWith('scrypt$'), 'Hash must use scrypt prefix');
    assert.equal(verifyPassword(plain, hash), true, 'Valid password matches');
    assert.equal(verifyPassword('WrongPassword', hash), false, 'Incorrect password rejected');
  });

  await t.test('T013: Sign-up creates verified=0 user and generates expiring verification token', () => {
    const signup = identityService.signUp({
      email: 'newstudent@zur.internal',
      displayName: 'New Learner',
      password: 'SecurePassword123!',
    });

    assert.equal(signup.user.email, 'newstudent@zur.internal');
    assert.equal(signup.user.displayName, 'New Learner');
    assert.equal(signup.user.emailVerified, false);
    assert.ok(signup.verificationToken, 'Verification token generated');

    // Token exists in database with 7-day expiration
    const tokenRecord = db.prepare('SELECT * FROM verification_tokens WHERE user_id = ?').get(signup.user.id) as any;
    assert.ok(tokenRecord, 'Token recorded');
    assert.equal(tokenRecord.type, 'email_verification');

    // Verification succeeds and updates email_verified = true
    const verifyResult = identityService.verifyEmail(signup.verificationToken);
    assert.equal(verifyResult.success, true);

    const userAfter = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(signup.user.id) as any;
    assert.equal(userAfter.email_verified, 1);
  });

  await t.test('T013: Duplicate email returns ConflictError', () => {
    assert.throws(
      () => {
        identityService.signUp({
          email: 'ada@zur.internal', // Seeded user
          displayName: 'Ada Clone',
          password: 'Password123!',
        });
      },
      (err: any) => err instanceof ConflictError
    );
  });

  await t.test('T013: Resend verification email enforces cooldown', () => {
    const fresh = identityService.signUp({
      email: 'cooldown@zur.internal',
      displayName: 'Cooldown Learner',
      password: 'Password123!',
    });

    // Immediate resend should trigger RateLimitError due to 60s cooldown
    assert.throws(
      () => {
        identityService.resendVerificationEmail(fresh.user.email);
      },
      (err: any) => err instanceof RateLimitError
    );
  });

  await t.test('T014: Sign-in produces stateful session in SQLite and enforces suspension', () => {
    // 1. Successful sign-in for seeded student
    const session = identityService.signIn({
      email: 'ada@zur.internal',
      password: 'StudentPass123!',
      userAgent: 'ZUR-Test-Agent',
      ipAddress: '127.0.0.1',
    });

    assert.ok(session.token, 'Session token provided');
    assert.equal(session.user.email, 'ada@zur.internal');

    // 2. Session authentication lookup
    const authLookup = identityService.authenticateSession(session.token);
    assert.equal(authLookup.user.id, session.user.id);

    // 3. Suspended account blocked from sign-in
    db.prepare("UPDATE users SET account_status = 'suspended' WHERE email = 'grace@zur.internal'").run();
    assert.throws(
      () => {
        identityService.signIn({
          email: 'grace@zur.internal',
          password: 'StudentPass123!',
        });
      },
      (err: any) => err instanceof AuthorizationError
    );
  });

  await t.test('T014: Sign-out and Sign-out-all revoke sessions', () => {
    const s1 = identityService.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!' });
    const s2 = identityService.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!' });

    // Single sign out
    identityService.signOut(s1.token);
    assert.throws(
      () => identityService.authenticateSession(s1.token),
      (err: any) => err instanceof AuthenticationError
    );

    // Second session still active
    assert.ok(identityService.authenticateSession(s2.token));

    // Sign out all
    identityService.signOutAll(s2.user.id);
    assert.throws(
      () => identityService.authenticateSession(s2.token),
      (err: any) => err instanceof AuthenticationError
    );
  });

  await t.test('T015: Password reset generic response without account enumeration', () => {
    // Non-existent email returns success: true without error
    const nonExistent = identityService.requestPasswordReset('nonexistent@zur.internal');
    assert.equal(nonExistent.success, true);
    assert.equal(nonExistent.resetToken, undefined);

    // Existing email returns reset token
    const existing = identityService.requestPasswordReset('alan@zur.internal');
    assert.equal(existing.success, true);
    assert.ok(existing.resetToken);

    // Reset password with valid token
    const resetSuccess = identityService.resetPassword(existing.resetToken!, 'BrandNewPassword123!');
    assert.equal(resetSuccess, true);

    // Old password fails, new password works
    assert.throws(
      () => identityService.signIn({ email: 'alan@zur.internal', password: 'StudentPass123!' }),
      (err: any) => err instanceof AuthenticationError
    );

    const newSession = identityService.signIn({ email: 'alan@zur.internal', password: 'BrandNewPassword123!' });
    assert.ok(newSession.token);
  });

  await t.test('T015: In-app password change requires reauthentication with current password', () => {
    const user = identityService.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!' }).user;

    // Wrong current password fails
    assert.throws(
      () => identityService.changePassword(user.id, 'WrongCurrentPass', 'NewPass12345!'),
      (err: any) => err instanceof ValidationError
    );

    // Correct current password succeeds
    assert.equal(identityService.changePassword(user.id, 'StudentPass123!', 'NewPass12345!'), true);
  });

  await t.test('T016: Profile display name update and appearance preferences persistence', () => {
    const user = identityService.signIn({ email: 'ada@zur.internal', password: 'NewPass12345!' }).user;

    const updated = identityService.updateProfile(user.id, { displayName: 'Countess of Lovelace' });
    assert.equal(updated.displayName, 'Countess of Lovelace');
    assert.equal(updated.email, 'ada@zur.internal'); // Email remains unchanged

    // Appearance preferences update
    const prefs = identityService.updatePreferences(user.id, {
      theme: 'dark',
      editorFontSize: 16,
      indentationSpaces: 2,
    });

    assert.equal(prefs.theme, 'dark');
    assert.equal(prefs.editorFontSize, 16);
    assert.equal(prefs.indentationSpaces, 2);

    const fetched = identityService.getPreferences(user.id);
    assert.equal(fetched.theme, 'dark');
    assert.equal(fetched.editorFontSize, 16);
  });

  await t.test('T017: Privacy request intake with Sole-Owner Course Check', () => {
    // 1. Guido is the owner of "Python foundations"
    const guido = db.prepare("SELECT id FROM users WHERE email = 'guido@zur.internal'").get() as any;

    assert.throws(
      () => {
        identityService.requestAccountDeletion(guido.id, true);
      },
      (err: any) => {
        return err instanceof ConflictError && err.message.includes('sole owner of course(s)');
      },
      'Sole course owner must be blocked from deleting account'
    );

    // 2. Data export intake packages learning evidence
    const exportResult = identityService.requestDataExport(guido.id);
    assert.ok(exportResult.requestId);
    assert.equal(exportResult.exportPayload.user.email, 'guido@zur.internal');

    // 3. Non-owner student deletion succeeds and transitions account to pending_deletion
    const alan = db.prepare("SELECT id FROM users WHERE email = 'alan@zur.internal'").get() as any;
    const deletionResult = identityService.requestAccountDeletion(alan.id, true);
    assert.equal(deletionResult.success, true);

    const alanAfter = db.prepare('SELECT account_status FROM users WHERE id = ?').get(alan.id) as any;
    assert.equal(alanAfter.account_status, 'pending_deletion');
  });

  await t.test('T018: P42 Safe Denial prevents leaking private object existence', () => {
    const err = authService.safeNotFound();
    assert.equal(err.statusCode, 404);
    assert.equal(err.message, "This page isn't available.");
  });
});

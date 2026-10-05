import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { getDatabase, closeDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { IdentityService } from '../src/services/identity-service.ts';
import { AdminService } from '../src/services/admin-service.ts';
import { MediaService } from '../src/services/media-service.ts';
import { OperationalMetricsService } from '../src/services/operational-metrics-service.ts';
import { ConflictError, AuthenticationError, ValidationError } from 'zur-shared';

function setupTestDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-r07-test-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  runMigrations(dbPath);
  seedDatabase(dbPath);
  const db = getDatabase(dbPath);
  return { db, dbPath };
}

function teardownTestDb(dbPath: string) {
  closeDatabase(dbPath);
  try {
    const dir = path.dirname(dbPath);
    if (dir.includes('zur-r07-test-')) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {}
}

test('R07: Account deletion request, sole-owner course guard, session revocation, and admin restoration lifecycle', () => {
  const { db, dbPath } = setupTestDb();
  try {
    const identityService = new IdentityService(db);
    const adminService = new AdminService(db);
    const adminId = 'user-admin-1';
    const authorId = 'user-author-1';
    const studentId = 'user-student-1';

    // 1. Sole owner of active course cannot delete account (ConflictError)
    assert.throws(
      () => identityService.requestAccountDeletion(authorId, true),
      (err: any) => err instanceof ConflictError && err.message.includes('sole owner of course')
    );

    // 2. Student (not owning courses) signs in and has an active session
    const session = identityService.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!' });
    assert.ok(session.token);
    const authedBefore = identityService.authenticateSession(session.token);
    assert.equal(authedBefore.user.id, studentId);

    // 3. Student requests account deletion
    const delResult = identityService.requestAccountDeletion(studentId, true);
    assert.equal(delResult.success, true);
    assert.ok(delResult.requestId);

    // 4. Verification: Session is revoked immediately
    assert.throws(
      () => identityService.authenticateSession(session.token),
      (err: any) => err instanceof AuthenticationError
    );

    // 5. Verification: Account status is pending_deletion
    const userRow = db.prepare('SELECT account_status FROM users WHERE id = ?').get(studentId) as any;
    assert.equal(userRow.account_status, 'pending_deletion');

    // 6. Verification: Admin sees privacy request
    const privacyList = adminService.listPrivacyRequests(adminId, 'pending');
    assert.ok(privacyList.items.some((r) => r.userId === studentId && r.requestType === 'deletion'));

    // 7. Admin restores account
    const restoredUser = adminService.changeUserState(adminId, studentId, 'restore', 'Student requested deletion cancellation');
    assert.equal(restoredUser.user.accountStatus, 'active');

    const restoredRow = db.prepare('SELECT account_status FROM users WHERE id = ?').get(studentId) as any;
    assert.equal(restoredRow.account_status, 'active');
  } finally {
    teardownTestDb(dbPath);
  }
});

test('R07: Session revocation: single-session sign-out and sign-out-all', () => {
  const { db, dbPath } = setupTestDb();
  try {
    const identityService = new IdentityService(db);
    const studentId = 'user-student-1';

    // Create two active sessions
    const s1 = identityService.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!' });
    const s2 = identityService.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!' });

    assert.equal(identityService.authenticateSession(s1.token).user.id, studentId);
    assert.equal(identityService.authenticateSession(s2.token).user.id, studentId);

    // Sign out s1 only
    identityService.signOut(s1.token);
    assert.throws(
      () => identityService.authenticateSession(s1.token),
      (err: any) => err instanceof AuthenticationError
    );
    // s2 remains active
    assert.equal(identityService.authenticateSession(s2.token).user.id, studentId);

    // Sign out all
    identityService.signOutAll(studentId);
    assert.throws(
      () => identityService.authenticateSession(s2.token),
      (err: any) => err instanceof AuthenticationError
    );
  } finally {
    teardownTestDb(dbPath);
  }
});

test('R07: Admin media quarantine, restoration, and safe deletion', () => {
  const { db, dbPath } = setupTestDb();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-r07-media-'));
  try {
    const adminService = new AdminService(db);
    const mediaService = new MediaService(db, tmpDir);
    const adminId = 'user-admin-1';
    const authorId = 'user-author-1';
    const courseId = 'course-python-foundations';

    // Upload an asset
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
    const asset = mediaService.uploadAsset(authorId, courseId, {
      buffer: png,
      filename: 'sample.png',
      mimeType: 'image/png',
      altText: 'Sample diagram',
    });

    // 1. Cannot delete ready asset without quarantine
    assert.throws(
      () => adminService.deleteMedia(adminId, asset.id, 'Routine removal'),
      (err: any) => err instanceof ConflictError && err.message.includes('Quarantine the asset')
    );

    // 2. Quarantine asset
    const qResult = adminService.reviewMedia(adminId, asset.id, 'quarantine', 'Investigating report');
    assert.equal(qResult.processingStatus, 'quarantined');

    // 3. Restore asset from quarantine
    const rResult = adminService.reviewMedia(adminId, asset.id, 'restore', 'Report cleared');
    assert.equal(rResult.processingStatus, 'ready');

    // 4. Re-quarantine and delete unreferenced asset
    adminService.reviewMedia(adminId, asset.id, 'quarantine', 'Confirmed inappropriate');
    const delResult = adminService.deleteMedia(adminId, asset.id, 'Deleted after confirmation');
    assert.equal(delResult.deleted, true);

    const assetRow = db.prepare('SELECT id FROM media_assets WHERE id = ?').get(asset.id);
    assert.equal(assetRow, undefined, 'Media asset should be deleted from DB');
  } finally {
    teardownTestDb(dbPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('R07: Admin execution kill-switch: pause and resume operations', () => {
  const { db, dbPath } = setupTestDb();
  try {
    const adminService = new AdminService(db);
    const adminId = 'user-admin-1';

    // 1. Pause execution
    const paused = adminService.setExecutionPaused(adminId, true, 'Maintenance window for runner updates');
    assert.equal(paused.executionPaused, true);

    const row1 = db.prepare("SELECT value FROM system_settings WHERE key = 'execution_paused'").get() as any;
    assert.equal(row1.value, 'true');

    // Audit logged
    const audit1 = db.prepare("SELECT action FROM audit_events WHERE action = 'execution:disable_new'").get() as any;
    assert.ok(audit1);

    // 2. Resume execution
    const resumed = adminService.setExecutionPaused(adminId, false, 'Maintenance window completed');
    assert.equal(resumed.executionPaused, false);

    const row2 = db.prepare("SELECT value FROM system_settings WHERE key = 'execution_paused'").get() as any;
    assert.equal(row2.value, 'false');

    const audit2 = db.prepare("SELECT action FROM audit_events WHERE action = 'execution:reactivate'").get() as any;
    assert.ok(audit2);
  } finally {
    teardownTestDb(dbPath);
  }
});

test('R07: Local email verification and password reset token lifecycle', () => {
  const { db, dbPath } = setupTestDb();
  try {
    const identityService = new IdentityService(db);

    // 1. Email verification token generation
    const signUpResult = identityService.signUp({
      displayName: 'New Learner',
      email: 'newlearner@zur.test',
      password: 'SecurePassword123!',
      adultConfirmed: true,
    });
    assert.ok(signUpResult.user.id);
    assert.equal(signUpResult.user.emailVerified, false);
    assert.ok(signUpResult.verificationToken);

    // Verify email using token
    const verifySuccess = identityService.verifyEmail(signUpResult.verificationToken!);
    assert.equal(verifySuccess.success, true);
    assert.equal(verifySuccess.userId, signUpResult.user.id);

    const verifiedUser = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(signUpResult.user.id) as any;
    assert.equal(verifiedUser.email_verified, 1);

    // 2. Password reset token generation
    const resetReq = identityService.requestPasswordReset('newlearner@zur.test');
    assert.equal(resetReq.success, true);
    assert.ok(resetReq.resetToken);

    // Reset password
    const resetSuccess = identityService.resetPassword(resetReq.resetToken!, 'BrandNewPassword456!');
    assert.equal(resetSuccess, true);

    // Sign in with new password
    const session = identityService.signIn({ email: 'newlearner@zur.test', password: 'BrandNewPassword456!' });
    assert.ok(session.token);
  } finally {
    closeDatabase(dbPath);
  }
});

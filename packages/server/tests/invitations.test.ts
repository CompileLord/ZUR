import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CoursePublicationService } from '../src/services/course-publication-service.ts';
import { EnrollmentService } from '../src/services/enrollment-service.ts';
import { InvitationService } from '../src/services/invitation-service.ts';
import {
  ValidationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from 'zur-shared';

test('Module S2-M03: Email and Link Invitations (T046, P08, P28)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const courseService = new CourseService(db);
  const publicationService = new CoursePublicationService(db);
  const enrollmentService = new EnrollmentService(db);
  const invitationService = new InvitationService(db, enrollmentService);

  const authorId = 'user-author-1'; // Guido van Rossum
  const student1Id = 'user-student-1'; // Ada Lovelace (ada@zur.internal)
  const student2Id = 'user-student-2'; // Grace Hopper (grace@zur.internal)
  const student3Id = 'user-student-3'; // Alan Turing (alan@zur.internal)

  // Create course and publish
  const course = courseService.createCourseDraft(authorId, {
    title: 'Algorithms with Python',
  });
  const courseId = course.id;

  courseService.updateCourseMetadata(authorId, courseId, 1, {
    description: 'Learn algorithms with Python.',
    difficulty: 'intermediate',
    language: 'en',
    learningOutcomes: ['Sort and search'],
    estimatedDurationMinutes: 45,
  });

  courseService.updateCourseAccessSettings(authorId, courseId, {
    visibility: 'private',
    enrollmentPolicy: 'invitation_only',
  });

  const courseRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
  const pub = await publicationService.publishCourse(authorId, courseId, {
    expectedRevision: courseRow.draft_revision,
    changeSummary: 'Release 1',
  });
  const versionId = pub.versionId;

  // --- Email Invitations ---
  await t.test('T046: Creates single-use email invitation with 7-day default expiry and SHA-256 hash', () => {
    const { invitation, token } = invitationService.createInvitation(authorId, courseId, {
      type: 'email',
      recipientEmail: 'ada@zur.internal',
    });

    assert.ok(token);
    assert.strictEqual(invitation.type, 'email');
    assert.strictEqual(invitation.recipientEmail, 'ada@zur.internal');
    assert.strictEqual(invitation.maxUses, 1);
    assert.strictEqual(invitation.usesCount, 0);
    assert.strictEqual(invitation.isRevoked, false);

    // Verify token is hashed in DB, plain token is not stored
    const dbRow = db.prepare('SELECT * FROM invitations WHERE id = ?').get(invitation.id) as any;
    assert.notStrictEqual(dbRow.token_hash, token);
    assert.strictEqual(dbRow.token_hash.length, 64); // SHA-256 hex length
  });

  await t.test('T046: Preview invitation returns safe course details and masked email', () => {
    const { token } = invitationService.createInvitation(authorId, courseId, {
      type: 'email',
      recipientEmail: 'grace@zur.internal',
    });

    const preview = invitationService.getInvitationPreview(token);
    assert.strictEqual(preview.valid, true);
    assert.strictEqual(preview.course.title, 'Algorithms with Python');
    assert.strictEqual(preview.type, 'email');
    assert.ok(preview.recipientEmailMasked?.includes('*'));
    assert.ok(!preview.recipientEmailMasked?.includes('grace@'));
  });

  await t.test('T046: Email invitation enforces recipient email matching', () => {
    const { token } = invitationService.createInvitation(authorId, courseId, {
      type: 'email',
      recipientEmail: 'grace@zur.internal',
    });

    // Student1 (ada) tries to accept Grace's invite -> rejected
    assert.throws(() => {
      invitationService.acceptInvitation(student1Id, token);
    }, AuthorizationError);

    // Grace accepts -> succeeds
    const result = invitationService.acceptInvitation(student2Id, token);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.enrollment.userId, student2Id);
    assert.strictEqual(result.enrollment.status, 'active');

    // Attempting to consume again fails with ConflictError (max uses reached)
    assert.throws(() => {
      invitationService.acceptInvitation(student2Id, token);
    }, ConflictError);
  });

  // --- Shareable Link Invitations ---
  await t.test('T046: Shareable link with max_uses limit can be accepted until exhausted', () => {
    const { token } = invitationService.createInvitation(authorId, courseId, {
      type: 'shareable_link',
      maxUses: 2,
    });

    // 1st student accepts
    const r1 = invitationService.acceptInvitation(student1Id, token);
    assert.strictEqual(r1.success, true);

    // 2nd student accepts
    const r2 = invitationService.acceptInvitation(student3Id, token);
    assert.strictEqual(r2.success, true);

    // 3rd student attempt fails: limit reached
    assert.throws(() => {
      invitationService.acceptInvitation('user-admin-1', token);
    }, ConflictError);
  });

  // --- Revocation & Expiration ---
  await t.test('T046: Owner can revoke invitation and revoked invitation cannot be accepted', () => {
    const { invitation, token } = invitationService.createInvitation(authorId, courseId, {
      type: 'shareable_link',
    });

    // Revoke
    invitationService.revokeInvitation(authorId, invitation.id);

    // Preview reflects revoked
    const preview = invitationService.getInvitationPreview(token);
    assert.strictEqual(preview.valid, false);
    assert.strictEqual(preview.reason, 'revoked');

    // Accept fails
    assert.throws(() => {
      invitationService.acceptInvitation(student1Id, token);
    }, ConflictError);
  });

  await t.test('T046: Owner can regenerate revoked invitation', () => {
    const { invitation } = invitationService.createInvitation(authorId, courseId, {
      type: 'shareable_link',
    });
    invitationService.revokeInvitation(authorId, invitation.id);

    // Regenerate
    const regenerated = invitationService.resendOrRegenerateInvitation(authorId, invitation.id);
    assert.strictEqual(regenerated.invitation.isRevoked, false);
    assert.ok(regenerated.token);

    // New token preview is valid
    const preview = invitationService.getInvitationPreview(regenerated.token);
    assert.strictEqual(preview.valid, true);
  });

  await t.test('T046: Expired invitation is rejected', () => {
    const { invitation, token } = invitationService.createInvitation(authorId, courseId, {
      type: 'shareable_link',
    });

    // Force expiration in database
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE invitations SET expires_at = ? WHERE id = ?').run(past, invitation.id);

    const preview = invitationService.getInvitationPreview(token);
    assert.strictEqual(preview.valid, false);
    assert.strictEqual(preview.reason, 'expired');

    assert.throws(() => {
      invitationService.acceptInvitation(student1Id, token);
    }, ConflictError);
  });

  await t.test('T046: Invariant: Revoked student CANNOT enroll even with a valid invite token', () => {
    // Revoke student 1 from course
    enrollmentService.revokeStudent(authorId, courseId, student1Id);

    // Generate fresh shareable link
    const { token } = invitationService.createInvitation(authorId, courseId, {
      type: 'shareable_link',
    });

    // Revoked student tries to join with valid invite
    assert.throws(() => {
      invitationService.acceptInvitation(student1Id, token);
    }, AuthorizationError);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CoursePublicationService } from '../src/services/course-publication-service.ts';
import { EnrollmentService } from '../src/services/enrollment-service.ts';
import { InvitationService } from '../src/services/invitation-service.ts';
import { AuthorizationError } from 'zur-shared';
import { writeStarterStep } from './helpers/starter-step.ts';

// PRD_V2: verify email before enrollment, invitation acceptance, or authoring.
async function setup() {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const courses = new CourseService(db);
  const course = courses.createCourseDraft('user-author-1', { title: 'Invite only' });
  writeStarterStep(db, course.id);
  courses.updateCourseMetadata('user-author-1', course.id, 1, {
    description: 'Invitation test.', difficulty: 'beginner', language: 'en', learningOutcomes: ['x'], estimatedDurationMinutes: 10,
  });
  courses.updateCourseAccessSettings('user-author-1', course.id, { visibility: 'private', enrollmentPolicy: 'invitation_only' });
  const { draft_revision } = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any;
  await new CoursePublicationService(db).publishCourse('user-author-1', course.id, { expectedRevision: draft_revision, changeSummary: 'v1' });
  const unverify = (id: string) => db.prepare('UPDATE users SET email_verified = 0 WHERE id = ?').run(id);
  return { db, courses, courseId: course.id, invitations: new InvitationService(db, new EnrollmentService(db)), unverify };
}

test('an unverified account cannot accept an email invitation addressed to that email', async () => {
  const { invitations, courseId, unverify } = await setup();
  unverify('user-student-2');
  const { token } = invitations.createInvitation('user-author-1', courseId, { type: 'email', recipientEmail: 'grace@zur.internal' });
  assert.throws(() => invitations.acceptInvitation('user-student-2', token), /Email verification is required/);
});

test('an unverified account cannot join through a shareable invitation link', async () => {
  const { invitations, courseId, unverify } = await setup();
  unverify('user-student-3');
  const { token } = invitations.createInvitation('user-author-1', courseId, { type: 'shareable_link' });
  assert.throws(() => invitations.acceptInvitation('user-student-3', token), /Email verification is required/);
});

test('an unverified author cannot create a course', async () => {
  const { courses, unverify } = await setup();
  unverify('user-author-1');
  assert.throws(() => courses.createCourseDraft('user-author-1', { title: 'Second course' }), AuthorizationError);
});

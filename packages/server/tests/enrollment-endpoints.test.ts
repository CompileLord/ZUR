import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CoursePublicationService } from '../src/services/course-publication-service.ts';
import type { AddressInfo } from 'node:net';

test('Enrollment, Invitation, and Progress HTTP Endpoints (T045-T048)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const courseService = new CourseService(db);
  const publicationService = new CoursePublicationService(db);

  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  const authorId = 'user-author-1'; // guido@zur.internal (AuthorPass123!)
  const studentId = 'user-student-1'; // ada@zur.internal (StudentPass123!)

  // 1. Author sign in to get session token
  const authorRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'guido@zur.internal',
      password: 'AuthorPass123!',
    }),
  });
  assert.strictEqual(authorRes.status, 200);
  const authorSession = (await authorRes.json()) as any;
  const authorToken = authorSession.token;

  // 2. Student sign in to get session token
  const studentRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'ada@zur.internal',
      password: 'StudentPass123!',
    }),
  });
  assert.strictEqual(studentRes.status, 200);
  const studentSession = (await studentRes.json()) as any;
  const studentToken = studentSession.token;

  // 3. Create and publish a test course
  const course = courseService.createCourseDraft(authorId, {
    title: 'Python REST API Learning',
  });
  courseService.updateCourseMetadata(authorId, course.id, 1, {
    description: 'Learn REST APIs with Python.',
    difficulty: 'beginner',
    language: 'en',
    learningOutcomes: ['Make HTTP requests', 'Parse JSON'],
    estimatedDurationMinutes: 30,
  });
  courseService.updateCourseAccessSettings(authorId, course.id, {
    visibility: 'unlisted',
    enrollmentPolicy: 'invitation_only',
  });

  const draftRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(course.id) as any;
  const pub = await publicationService.publishCourse(authorId, course.id, {
    expectedRevision: draftRow.draft_revision,
    changeSummary: 'Release 1',
  });
  const version1Id = pub.versionId;

  // Find the initial step
  const stepRow = db.prepare('SELECT id FROM steps WHERE lesson_id = (SELECT id FROM lessons WHERE module_id = (SELECT id FROM modules WHERE course_id = ?))').get(course.id) as any;
  const stepId = stepRow.id;

  let inviteToken = '';
  let invitationId = '';
  let studentEnrollmentId = '';

  await t.test('POST /api/author/courses/:courseId/invitations creates invitation', async () => {
    const res = await fetch(`${baseUrl}/api/author/courses/${course.id}/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorToken}`,
      },
      body: JSON.stringify({
        type: 'shareable_link',
        maxUses: 5,
        expiresInDays: 7,
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.ok(body.token);
    assert.ok(body.invitation.id);
    inviteToken = body.token;
    invitationId = body.invitation.id;
  });

  await t.test('GET /api/author/courses/:courseId/invitations lists invitations', async () => {
    const res = await fetch(`${baseUrl}/api/author/courses/${course.id}/invitations`, {
      headers: {
        Authorization: `Bearer ${authorToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.invitations.length, 1);
  });

  await t.test('GET /api/invitations/:token returns safe course preview', async () => {
    const res = await fetch(`${baseUrl}/api/invitations/${inviteToken}`);
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.valid, true);
    assert.strictEqual(body.course.title, 'Python REST API Learning');
  });

  await t.test('POST /api/invitations/:token/accept enrolls student', async () => {
    const res = await fetch(`${baseUrl}/api/invitations/${inviteToken}/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.enrollment.pinnedVersionId, version1Id);
    studentEnrollmentId = body.enrollment.id;
  });

  await t.test('GET /api/student/dashboard returns continueCourse and recentCourses', async () => {
    const res = await fetch(`${baseUrl}/api/student/dashboard`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.continueCourse);
    assert.ok(Array.isArray(body.recentCourses));
  });

  await t.test('GET /api/student/courses returns enrolled courses list', async () => {
    const res = await fetch(`${baseUrl}/api/student/courses`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(Array.isArray(body.enrollments));
    assert.ok(body.enrollments.some((e: any) => e.courseId === course.id));
  });

  await t.test('GET /api/enrollments/:enrollmentId/steps/:stepId returns enrolled step view', async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/${studentEnrollmentId}/steps/${stepId}`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.step);
    assert.ok(body.progress);
    assert.strictEqual(body.courseTitle, 'Python REST API Learning');
  });

  await t.test('An enrolled legacy step without authored content remains readable', async () => {
    const graceLogin = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'grace@zur.internal', password: 'StudentPass123!' }),
    });
    assert.equal(graceLogin.status, 200);
    const graceSession = await graceLogin.json() as any;
    const response = await fetch(`${baseUrl}/api/enrollments/enr-grace/steps/step-1-theory`, {
      headers: { Authorization: `Bearer ${graceSession.token}` },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as any).step.content, null);
  });

  await t.test('POST /api/enrollments/:enrollmentId/steps/:stepId/complete updates progress', async () => {
    const res = await fetch(
      `${baseUrl}/api/enrollments/${studentEnrollmentId}/steps/${stepId}/complete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      }
    );

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.isCompleted, true);
    assert.strictEqual(body.percentage, 100);
  });

  await t.test('POST /api/courses/:courseId/leave allows student to leave course', async () => {
    const res = await fetch(`${baseUrl}/api/courses/${course.id}/leave`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.enrollment.status, 'left');
  });

  await t.test('A left enrollment cannot read its lesson metadata or pinned content', async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/${studentEnrollmentId}/steps/${stepId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.equal(res.status, 404);
    assert.match((await res.json() as any).error.message, /isn't available/);
  });

  await t.test('POST /api/author/courses/:courseId/students/:studentId/revoke and reinstate', async () => {
    // Revoke
    const revRes = await fetch(
      `${baseUrl}/api/author/courses/${course.id}/students/${studentId}/revoke`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authorToken}`,
        },
      }
    );
    assert.strictEqual(revRes.status, 200);
    const revBody = (await revRes.json()) as any;
    assert.strictEqual(revBody.enrollment.status, 'revoked');

    // Reinstate
    const reinRes = await fetch(
      `${baseUrl}/api/author/courses/${course.id}/students/${studentId}/reinstate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authorToken}`,
        },
      }
    );
    assert.strictEqual(reinRes.status, 200);
    const reinBody = (await reinRes.json()) as any;
    assert.strictEqual(reinBody.enrollment.status, 'active');
  });

  await t.test('POST /api/author/invitations/:invitationId/revoke and resend', async () => {
    // Revoke invitation
    const revRes = await fetch(`${baseUrl}/api/author/invitations/${invitationId}/revoke`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authorToken}`,
      },
    });
    assert.strictEqual(revRes.status, 200);

    // Resend / regenerate invitation
    const resendRes = await fetch(`${baseUrl}/api/author/invitations/${invitationId}/resend`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authorToken}`,
      },
    });
    assert.strictEqual(resendRes.status, 200);
    const resendBody = (await resendRes.json()) as any;
    assert.ok(resendBody.token);
    assert.strictEqual(resendBody.invitation.isRevoked, false);
  });
});

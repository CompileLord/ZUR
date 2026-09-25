import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';
import { CourseService } from '../src/services/course-service.ts';
import { CoursePublicationService } from '../src/services/course-publication-service.ts';
import type { AddressInfo } from 'node:net';

test('Course Catalog, Public Overview, and Reporting Endpoints (T069–T072)', async (t) => {
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

  // Insert test categories
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, slug, created_at)
    VALUES ('cat-core', 'Core Python', 'core-python', ?)
  `).run(now);
  db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, slug, created_at)
    VALUES ('cat-web', 'Web Backend', 'web-backend', ?)
  `).run(now);

  // 1. Author sign in
  const authorRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'guido@zur.internal', password: 'AuthorPass123!' }),
  });
  assert.strictEqual(authorRes.status, 200);
  const authorSession = (await authorRes.json()) as any;
  const authorToken = authorSession.token;

  // 2. Student sign in
  const studentRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ada@zur.internal', password: 'StudentPass123!' }),
  });
  assert.strictEqual(studentRes.status, 200);
  const studentSession = (await studentRes.json()) as any;
  const studentToken = studentSession.token;

  // 3. Set up courses in different states:
  // Course A: Public, published, beginner, cat-core
  const courseA = courseService.createCourseDraft(authorId, {
    title: 'Python Foundations For Beginners',
  });
  courseService.updateCourseMetadata(authorId, courseA.id, 1, {
    description: 'Learn syntax, loops, and basic constructs.',
    difficulty: 'beginner',
    language: 'en',
    categoryId: 'cat-core',
    learningOutcomes: ['Write loops', 'Declare functions'],
    prerequisites: 'None',
    estimatedDurationMinutes: 60,
  });
  courseService.updateCourseAccessSettings(authorId, courseA.id, {
    visibility: 'public',
    enrollmentPolicy: 'open',
  });
  const draftARow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseA.id) as any;
  await publicationService.publishCourse(authorId, courseA.id, {
    expectedRevision: draftARow.draft_revision,
    changeSummary: 'Release A',
  });

  // Course B: Public, published, advanced, cat-web
  const courseB = courseService.createCourseDraft(authorId, {
    title: 'Advanced Async IO Systems',
  });
  courseService.updateCourseMetadata(authorId, courseB.id, 1, {
    description: 'Master coroutines and concurrent event loops.',
    difficulty: 'advanced',
    language: 'en',
    categoryId: 'cat-web',
    learningOutcomes: ['Build event loops', 'Handle async context managers'],
    estimatedDurationMinutes: 180,
  });
  courseService.updateCourseAccessSettings(authorId, courseB.id, {
    visibility: 'public',
    enrollmentPolicy: 'open',
  });
  const draftBRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseB.id) as any;
  await publicationService.publishCourse(authorId, courseB.id, {
    expectedRevision: draftBRow.draft_revision,
    changeSummary: 'Release B',
  });

  // Course C: Unlisted, published, invitation-only
  const courseC = courseService.createCourseDraft(authorId, {
    title: 'Unlisted Corporate Pilot',
  });
  courseService.updateCourseMetadata(authorId, courseC.id, 1, {
    description: 'Special cohort course.',
    difficulty: 'intermediate',
    language: 'en',
    categoryId: 'cat-core',
    learningOutcomes: ['Corporate patterns'],
    estimatedDurationMinutes: 45,
  });
  courseService.updateCourseAccessSettings(authorId, courseC.id, {
    visibility: 'unlisted',
    enrollmentPolicy: 'invitation_only',
  });
  const draftCRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseC.id) as any;
  await publicationService.publishCourse(authorId, courseC.id, {
    expectedRevision: draftCRow.draft_revision,
    changeSummary: 'Release C',
  });

  // Course D: Private, published
  const courseD = courseService.createCourseDraft(authorId, {
    title: 'Private Teacher Notes',
  });
  courseService.updateCourseMetadata(authorId, courseD.id, 1, {
    description: 'Internal private notes.',
    difficulty: 'beginner',
    language: 'en',
    categoryId: 'cat-core',
    learningOutcomes: ['Teaching methods'],
    estimatedDurationMinutes: 30,
  });
  courseService.updateCourseAccessSettings(authorId, courseD.id, {
    visibility: 'private',
    enrollmentPolicy: 'invitation_only',
  });
  const draftDRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseD.id) as any;
  await publicationService.publishCourse(authorId, courseD.id, {
    expectedRevision: draftDRow.draft_revision,
    changeSummary: 'Release D',
  });

  // Course E: Public, draft (never published)
  const courseE = courseService.createCourseDraft(authorId, {
    title: 'Work In Progress Draft Course',
  });

  // Course F: Public, published, but suspended
  const courseF = courseService.createCourseDraft(authorId, {
    title: 'Suspended Course Investigation',
  });
  courseService.updateCourseMetadata(authorId, courseF.id, 1, {
    description: 'Investigative flagged course.',
    difficulty: 'beginner',
    language: 'en',
    categoryId: 'cat-core',
    learningOutcomes: ['Investigate behaviors'],
    estimatedDurationMinutes: 30,
  });
  courseService.updateCourseAccessSettings(authorId, courseF.id, {
    visibility: 'public',
    enrollmentPolicy: 'open',
  });
  const draftFRow = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseF.id) as any;
  await publicationService.publishCourse(authorId, courseF.id, {
    expectedRevision: draftFRow.draft_revision,
    changeSummary: 'Release F',
  });
  db.prepare('UPDATE courses SET is_suspended = 1 WHERE id = ?').run(courseF.id);

  // --- 1. Categories Endpoint ---
  await t.test('GET /api/categories returns category list', async () => {
    const res = await fetch(`${baseUrl}/api/categories`);
    assert.strictEqual(res.status, 200);
    const categories = (await res.json()) as any[];
    assert.ok(Array.isArray(categories));
    assert.ok(categories.length > 0);
    const slugs = categories.map((c) => c.slug);
    assert.ok(slugs.includes('core-python'));
    assert.ok(slugs.includes('web-backend'));
  });

  // --- 2. Public Catalog Endpoint (T070) ---
  await t.test('GET /api/courses/catalog enforces public, published, active separation', async () => {
    const res = await fetch(`${baseUrl}/api/courses/catalog`);
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(Array.isArray(body.courses));

    const courseIds = body.courses.map((c: any) => c.id);

    // Published public courses must be present
    assert.ok(courseIds.includes(courseA.id), 'Course A (public published) should be in catalog');
    assert.ok(courseIds.includes(courseB.id), 'Course B (public published) should be in catalog');

    // Unlisted, private, draft, and suspended courses must NOT be present
    assert.ok(!courseIds.includes(courseC.id), 'Course C (unlisted) must NOT be in catalog');
    assert.ok(!courseIds.includes(courseD.id), 'Course D (private) must NOT be in catalog');
    assert.ok(!courseIds.includes(courseE.id), 'Course E (draft) must NOT be in catalog');
    assert.ok(!courseIds.includes(courseF.id), 'Course F (suspended) must NOT be in catalog');
  });

  await t.test('GET /api/courses/catalog filters by level, category, and search query', async () => {
    // Filter by level=beginner
    const resBeginner = await fetch(`${baseUrl}/api/courses/catalog?level=beginner`);
    const bodyBeginner = (await resBeginner.json()) as any;
    const beginnerIds = bodyBeginner.courses.map((c: any) => c.id);
    assert.ok(beginnerIds.includes(courseA.id));
    assert.ok(!beginnerIds.includes(courseB.id));

    // Filter by categoryId=cat-web
    const resWeb = await fetch(`${baseUrl}/api/courses/catalog?categoryId=cat-web`);
    const bodyWeb = (await resWeb.json()) as any;
    const webIds = bodyWeb.courses.map((c: any) => c.id);
    assert.ok(!webIds.includes(courseA.id));
    assert.ok(webIds.includes(courseB.id));

    // Search query matches description
    const resSearch = await fetch(`${baseUrl}/api/courses/catalog?search=coroutines`);
    const bodySearch = (await resSearch.json()) as any;
    const searchIds = bodySearch.courses.map((c: any) => c.id);
    assert.ok(searchIds.includes(courseB.id));
    assert.ok(!searchIds.includes(courseA.id));

    // Pagination limit & offset
    const resPage = await fetch(`${baseUrl}/api/courses/catalog?limit=1&offset=0`);
    const bodyPage = (await resPage.json()) as any;
    assert.strictEqual(bodyPage.courses.length, 1);
    assert.ok(bodyPage.total >= 2);
  });

  // --- 3. Course Overview Endpoint (T071, AC-05) ---
  await t.test('GET /api/courses/:courseId returns safe public overview without leaking step bodies', async () => {
    const res = await fetch(`${baseUrl}/api/courses/${courseA.id}`);
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;

    assert.strictEqual(body.course.id, courseA.id);
    assert.strictEqual(body.course.title, 'Python Foundations For Beginners');
    assert.strictEqual(body.course.difficulty, 'beginner');
    assert.deepStrictEqual(body.course.learningOutcomes, ['Write loops', 'Declare functions']);
    assert.strictEqual(body.enrollmentStatus.isEnrolled, false);

    // Verify informational syllabus structure
    assert.ok(Array.isArray(body.syllabus));
    assert.ok(body.syllabus.length > 0);
    const firstLesson = body.syllabus[0].lessons[0];
    assert.ok(firstLesson.stepCounts);
    assert.ok(Array.isArray(firstLesson.steps));

    // CRITICAL: Ensure NO step body, code, quiz answer key, or test cases are returned
    for (const mod of body.syllabus) {
      for (const les of mod.lessons) {
        for (const st of les.steps) {
          assert.strictEqual(st.body, undefined, 'Step body must not leak in public overview');
          assert.strictEqual(st.content, undefined, 'Step content must not leak in public overview');
          assert.strictEqual(st.theoryText, undefined, 'Theory text must not leak in public overview');
          assert.strictEqual(st.testCases, undefined, 'Test cases must not leak in public overview');
          assert.strictEqual(st.answerKey, undefined, 'Quiz answer key must not leak in public overview');
          assert.strictEqual(st.choices, undefined, 'Quiz choices must not leak in public overview');
        }
      }
    }
  });

  await t.test('GET /api/courses/:courseId allows unlisted course access via direct ID', async () => {
    const res = await fetch(`${baseUrl}/api/courses/${courseC.id}`);
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.course.id, courseC.id);
    assert.strictEqual(body.course.visibility, 'unlisted');
  });

  await t.test('GET /api/courses/:courseId safely denies unauthorized access to private courses (AC-05)', async () => {
    // Unauthenticated request to private course -> 404 safe denial
    const resAnon = await fetch(`${baseUrl}/api/courses/${courseD.id}`);
    assert.strictEqual(resAnon.status, 404);

    // Non-enrolled student request to private course -> 404 safe denial
    const resStudent = await fetch(`${baseUrl}/api/courses/${courseD.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(resStudent.status, 404);

    // Author request to own private course -> 200 allowed
    const resAuthor = await fetch(`${baseUrl}/api/courses/${courseD.id}`, {
      headers: { Authorization: `Bearer ${authorToken}` },
    });
    assert.strictEqual(resAuthor.status, 200);
  });

  // --- 4. Enrollment Action ---
  await t.test('POST /api/courses/:courseId/enroll enrolls student in public open course', async () => {
    const res = await fetch(`${baseUrl}/api/courses/${courseA.id}/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.ok(body.id);
    assert.strictEqual(body.status, 'active');

    // Confirm GET /api/courses/:courseId now reflects isEnrolled: true
    const overviewRes = await fetch(`${baseUrl}/api/courses/${courseA.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const overview = (await overviewRes.json()) as any;
    assert.strictEqual(overview.enrollmentStatus.isEnrolled, true);
    assert.strictEqual(overview.enrollmentStatus.status, 'active');
  });

  await t.test('POST /api/courses/:courseId/enroll rejects invitation-only course without token', async () => {
    const res = await fetch(`${baseUrl}/api/courses/${courseC.id}/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({}),
    });

    assert.notStrictEqual(res.status, 201);
  });

  // --- 5. Reporting Endpoint (T072) ---
  await t.test('POST /api/reports requires authentication and creates report record', async () => {
    // Unauthenticated request should fail with 401
    const resAnon = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: courseA.id,
        type: 'broken_exercise',
        description: 'Test case 3 appears inconsistent with problem statement.',
      }),
    });
    assert.strictEqual(resAnon.status, 401);

    // Missing description should fail with 400
    const resMissing = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        type: 'broken_exercise',
      }),
    });
    assert.strictEqual(resMissing.status, 400);

    // Valid authenticated report
    const resSuccess = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        type: 'broken_exercise',
        description: 'Test case 3 expects 42 but problem description specifies 24.',
      }),
    });

    assert.strictEqual(resSuccess.status, 201);
    const bodySuccess = (await resSuccess.json()) as any;
    assert.ok(bodySuccess.id);
    assert.ok(bodySuccess.reference);
    assert.ok(bodySuccess.reference.startsWith('rep-'));
    assert.strictEqual(bodySuccess.status, 'open');

    // Verify stored report in database
    const dbReport = db.prepare('SELECT * FROM reports WHERE id = ?').get(bodySuccess.id) as any;
    assert.ok(dbReport);
    assert.strictEqual(dbReport.reporter_id, studentId);
    assert.strictEqual(dbReport.course_id, courseA.id);
    assert.strictEqual(dbReport.type, 'broken_exercise');
    assert.strictEqual(dbReport.status, 'open');
    assert.strictEqual(dbReport.submitted_code, null, 'No code should be attached without consent');
  });

  await t.test('POST /api/reports safely denies report on unauthorized private course (404)', async () => {
    // Non-enrolled student trying to report private course Course D
    const res = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseD.id,
        type: 'broken_exercise',
        description: 'Trying to report a private course I am not enrolled in.',
      }),
    });

    assert.strictEqual(res.status, 404);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error?.message, "This page isn't available.");
  });

  await t.test('POST /api/reports rejects forged courseVersionId and forged stepId (404)', async () => {
    // Forged version ID
    const resForgedVersion = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        courseVersionId: 'ver-forged-999',
        type: 'broken_exercise',
        description: 'Reporting with a forged version ID.',
      }),
    });
    assert.strictEqual(resForgedVersion.status, 404);

    // Forged step ID
    const resForgedStep = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        stepId: 'step-forged-999',
        type: 'broken_exercise',
        description: 'Reporting with a forged step ID.',
      }),
    });
    assert.strictEqual(resForgedStep.status, 404);
  });

  await t.test('POST /api/reports validates description length and issue type', async () => {
    // Description too long (> 5000 chars)
    const resTooLong = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        type: 'broken_exercise',
        description: 'x'.repeat(5001),
      }),
    });
    assert.strictEqual(resTooLong.status, 400);

    // Invalid issue type
    const resInvalidType = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        type: 'invalid_type',
        description: 'Valid description.',
      }),
    });
    assert.strictEqual(resInvalidType.status, 400);
  });

  await t.test('POST /api/reports only includes code from authorized server draft with explicit consent', async () => {
    // Retrieve a valid step ID from courseA
    const stepRow = db.prepare(`
      SELECT s.id
      FROM steps s
      JOIN lessons l ON s.lesson_id = l.id
      JOIN modules m ON l.module_id = m.id
      WHERE m.course_id = ?
      LIMIT 1
    `).get(courseA.id) as any;
    assert.ok(stepRow?.id, 'Course A must have a step');
    const validStepId = stepRow.id;

    // 1. Client supplies submittedCode without consent -> ignored, submitted_code is null
    const resNoConsent = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        stepId: validStepId,
        type: 'broken_exercise',
        description: 'Client supplied code without consent check.',
        submittedCode: 'MALICIOUS_CLIENT_CODE_INJECTION',
        includeCodeConsent: false,
      }),
    });
    assert.strictEqual(resNoConsent.status, 201);
    const bodyNoConsent = (await resNoConsent.json()) as any;
    const rowNoConsent = db.prepare('SELECT submitted_code FROM reports WHERE id = ?').get(bodyNoConsent.id) as any;
    assert.strictEqual(rowNoConsent.submitted_code, null, 'Client supplied code must be ignored without consent');

    // 2. Put a valid server-side draft in code_drafts for the student's enrollment
    const enrRow = db.prepare('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?').get(studentId, courseA.id) as any;
    assert.ok(enrRow?.id, 'Student must be enrolled in course A');

    db.prepare(`
      INSERT OR REPLACE INTO code_drafts (id, user_id, enrollment_id, step_id, code, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('draft-' + validStepId, studentId, enrRow.id, validStepId, 'print("SERVER_AUTHORIZED_CODE_DRAFT")', new Date().toISOString());

    // 3. Client submits report with includeCodeConsent: true and different submittedCode
    const resWithConsent = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        stepId: validStepId,
        type: 'broken_exercise',
        description: 'Student grants explicit consent to include server code draft.',
        submittedCode: 'IGNORED_CLIENT_PAYLOAD',
        includeCodeConsent: true,
      }),
    });
    assert.strictEqual(resWithConsent.status, 201);
    const bodyWithConsent = (await resWithConsent.json()) as any;
    const rowWithConsent = db.prepare('SELECT submitted_code FROM reports WHERE id = ?').get(bodyWithConsent.id) as any;
    assert.strictEqual(rowWithConsent.submitted_code, 'print("SERVER_AUTHORIZED_CODE_DRAFT")', 'Must use server database code draft');
  });

  await t.test('POST /api/reports restricts signed-in non-enrolled visitors to course-level inappropriate content reports', async () => {
    // 1. Sign in as non-enrolled visitor (Grace)
    const visitorRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'grace@zur.internal', password: 'StudentPass123!' }),
    });
    assert.strictEqual(visitorRes.status, 200);
    const visitorSession = (await visitorRes.json()) as any;
    const visitorToken = visitorSession.token;

    // 2. Course-level inappropriate-content report succeeds
    const resInappropriate = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${visitorToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        type: 'inappropriate_content',
        description: 'Course title or description violates terms.',
      }),
    });
    assert.strictEqual(resInappropriate.status, 201);
    const bodyInapp = (await resInappropriate.json()) as any;
    const rowInapp = db.prepare('SELECT * FROM reports WHERE id = ?').get(bodyInapp.id) as any;
    assert.strictEqual(rowInapp.step_id, null, 'Non-enrolled report must not have step_id');
    assert.strictEqual(rowInapp.submitted_code, null, 'Non-enrolled report must not attach code');

    // 3. Visitor attempting broken_exercise report is rejected with 400
    const resBroken = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${visitorToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        type: 'broken_exercise',
        description: 'I am not enrolled but reporting a broken exercise.',
      }),
    });
    assert.strictEqual(resBroken.status, 400);

    // 4. Visitor attempting to supply stepId receives safe 404 denial
    const stepRow = db.prepare(`
      SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id = l.id JOIN modules m ON l.module_id = m.id WHERE m.course_id = ? LIMIT 1
    `).get(courseA.id) as any;
    const resStep = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${visitorToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        stepId: stepRow.id,
        type: 'inappropriate_content',
        description: 'Visitor attempting to report specific step.',
      }),
    });
    assert.strictEqual(resStep.status, 404);

    // 5. Visitor attempting to supply forged or historic version receives safe 404 denial
    const resVersion = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${visitorToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        courseVersionId: 'ver-historic-fake',
        type: 'inappropriate_content',
        description: 'Visitor attempting to target historic version.',
      }),
    });
    assert.strictEqual(resVersion.status, 404);
  });

  await t.test('POST /api/reports adversarial test: enrolled student cannot report a step from a later version (404)', async () => {
    // Student 1 is pinned to Course A Version 1
    // Author adds a new step and publishes Version 2 of Course A
    const lessonRow = db.prepare(`
      SELECT l.id FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = ? LIMIT 1
    `).get(courseA.id) as any;
    assert.ok(lessonRow?.id);

    const newStepId = 'step-v2-exclusive';
    db.prepare(`
      INSERT OR REPLACE INTO steps (id, lesson_id, type, title, position, is_required, estimated_duration_minutes)
      VALUES (?, ?, 'theory', 'Version 2 Exclusive Step', 99, 1, 5)
    `).run(newStepId, lessonRow.id);

    db.prepare(`
      INSERT OR REPLACE INTO step_contents (id, step_id, content_payload)
      VALUES (?, ?, ?)
    `).run('cnt-' + newStepId, newStepId, JSON.stringify({ markdown: 'Content exclusive to Version 2' }));

    // Bump course draft revision and publish Version 2
    db.prepare("UPDATE courses SET draft_revision = draft_revision + 1 WHERE id = ?").run(courseA.id);
    const draftARow2 = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseA.id) as any;
    const v2Receipt = await publicationService.publishCourse(authorId, courseA.id, {
      expectedRevision: draftARow2.draft_revision,
      changeSummary: 'Release A Version 2',
    });
    assert.ok(v2Receipt.versionId);

    // Student 1 (enrolled in Version 1) attempts to report the Version 2 exclusive step
    const resWrongVersionStep = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        stepId: newStepId,
        type: 'broken_exercise',
        description: 'Student attempting to report step added in later Version 2.',
      }),
    });

    assert.strictEqual(resWrongVersionStep.status, 404);
    const bodyWrong = (await resWrongVersionStep.json()) as any;
    assert.strictEqual(bodyWrong.error?.message, "This page isn't available.");
  });

  await t.test('POST /api/reports adversarial test: does not leak same-user draft from another enrollment or version', async () => {
    // 1. Enroll Student 1 in Course B
    const enrollBRes = await fetch(`${baseUrl}/api/courses/${courseB.id}/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(enrollBRes.status, 201);
    const enrB = (await enrollBRes.json()) as any;

    // 2. Pick a step in Course A that has NO draft under Course A enrollment
    const stepRow = db.prepare(`
      SELECT s.id FROM steps s JOIN lessons l ON s.lesson_id = l.id JOIN modules m ON l.module_id = m.id
      WHERE m.course_id = ? AND s.id != 'step-v2-exclusive'
      ORDER BY s.position ASC LIMIT 1
    `).get(courseA.id) as any;
    const testStepId = stepRow.id;

    // 3. Insert a draft under Enrollment B with testStepId
    db.prepare(`
      INSERT OR REPLACE INTO code_drafts (id, user_id, enrollment_id, step_id, code, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('draft-cross-enr', studentId, enrB.id, testStepId, 'print("POISONED_DRAFT_FROM_ANOTHER_ENROLLMENT")', new Date().toISOString());

    // 4. Remove any draft for this step under Course A enrollment
    const enrA = db.prepare('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?').get(studentId, courseA.id) as any;
    db.prepare('DELETE FROM code_drafts WHERE enrollment_id = ? AND step_id = ?').run(enrA.id, testStepId);

    // 5. Student submits report for Course A step with includeCodeConsent: true
    const resReport = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        courseId: courseA.id,
        stepId: testStepId,
        type: 'broken_exercise',
        description: 'Testing draft isolation across enrollments.',
        includeCodeConsent: true,
      }),
    });
    assert.strictEqual(resReport.status, 201);
    const bodyReport = (await resReport.json()) as any;
    const rowReport = db.prepare('SELECT submitted_code FROM reports WHERE id = ?').get(bodyReport.id) as any;
    assert.strictEqual(rowReport.submitted_code, null, 'Must NOT bind draft from a different enrollment');
  });
});

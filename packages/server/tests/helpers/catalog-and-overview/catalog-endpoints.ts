import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogFixture } from './fixture.ts';
import { writeStarterStep } from '../starter-step.ts';

export async function catalogAndOverviewTests(t: TestContext, f: CatalogFixture): Promise<void> {
  const { db, courseService, baseUrl, authorId, studentId, now, authorToken, studentToken, courseA, courseB, courseC, courseD, courseE, courseF, courseG } = f;

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

  await t.test('GET /api/courses/catalog offers published languages and filters non-English courses (T070, PRD §16)', async () => {
    const res = await fetch(`${baseUrl}/api/courses/catalog`);
    const body = (await res.json()) as any;
    assert.ok(Array.isArray(body.languages), 'Catalog response must include languages array');
    assert.ok(body.languages.includes('en'), 'Published languages should include en');
    assert.ok(body.languages.includes('es'), 'Published languages should include es');

    // Filter by language=es
    const resEs = await fetch(`${baseUrl}/api/courses/catalog?language=es`);
    const bodyEs = (await resEs.json()) as any;
    const esIds = bodyEs.courses.map((c: any) => c.id);
    assert.ok(esIds.includes(courseG.id), 'Spanish course should be included in language=es filter');
    assert.ok(!esIds.includes(courseA.id), 'English course must NOT be in language=es filter');

    // Filter by language=en
    const resEn = await fetch(`${baseUrl}/api/courses/catalog?language=en`);
    const bodyEn = (await resEn.json()) as any;
    const enIds = bodyEn.courses.map((c: any) => c.id);
    assert.ok(!enIds.includes(courseG.id), 'Spanish course must NOT be in language=en filter');
    assert.ok(enIds.includes(courseA.id), 'English course must be in language=en filter');
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

  await t.test('GET /api/courses/:courseId safely denies unauthorized access to draft courses (AC-05)', async () => {
    // Unauthenticated request to draft course -> 404 safe denial
    const resAnon = await fetch(`${baseUrl}/api/courses/${courseE.id}`);
    assert.strictEqual(resAnon.status, 404);

    // Non-owner student request to draft course -> 404 safe denial
    const resStudent = await fetch(`${baseUrl}/api/courses/${courseE.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(resStudent.status, 404);

    // Author request to own draft course -> 200 allowed
    const resAuthor = await fetch(`${baseUrl}/api/courses/${courseE.id}`, {
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

    // Revoke enrollment and confirm GET /api/courses/:courseId reflects revoked state
    db.prepare("UPDATE enrollments SET status = 'revoked' WHERE user_id = ? AND course_id = ?").run(studentId, courseA.id);
    const revokedRes = await fetch(`${baseUrl}/api/courses/${courseA.id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const revokedOverview = (await revokedRes.json()) as any;
    assert.strictEqual(revokedOverview.enrollmentStatus.isEnrolled, false);
    assert.strictEqual(revokedOverview.enrollmentStatus.status, 'revoked');

    // Restore to active for remaining tests
    db.prepare("UPDATE enrollments SET status = 'active' WHERE user_id = ? AND course_id = ?").run(studentId, courseA.id);
  });

  await t.test('GET /api/courses/:courseId reflects archived publicationStatus', async () => {
    const courseArchived = courseService.createCourseDraft(authorId, {
      title: 'Archived Python History',
    });
    writeStarterStep(db, courseArchived.id);
    courseService.updateCourseAccessSettings(authorId, courseArchived.id, {
      visibility: 'public',
      enrollmentPolicy: 'open',
    });
    db.prepare("UPDATE courses SET publication_status = 'archived' WHERE id = ?").run(courseArchived.id);

    const resArchived = await fetch(`${baseUrl}/api/courses/${courseArchived.id}`);
    assert.strictEqual(resArchived.status, 200);
    const bodyArchived = (await resArchived.json()) as any;
    assert.strictEqual(bodyArchived.course.publicationStatus, 'archived');
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
}

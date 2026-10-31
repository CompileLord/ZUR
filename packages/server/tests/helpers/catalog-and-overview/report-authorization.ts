import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogFixture } from './fixture.ts';

export async function reportAuthorizationTests(t: TestContext, f: CatalogFixture): Promise<void> {
  const { db, publicationService, server, baseUrl, authorId, studentId, studentToken, courseA, courseB } = f;

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
}

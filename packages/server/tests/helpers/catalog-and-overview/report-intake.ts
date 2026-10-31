import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogFixture } from './fixture.ts';

export async function reportIntakeTests(t: TestContext, f: CatalogFixture): Promise<void> {
  const { db, baseUrl, studentId, studentToken, courseA, courseD } = f;

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
}

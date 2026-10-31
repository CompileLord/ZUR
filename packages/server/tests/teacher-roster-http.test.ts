import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.ts';
import { EmailDeliveryService } from '../src/services/email-delivery-service.ts';
import type { AddressInfo } from 'node:net';
import { setupTestDb } from './helpers/teacher-roster-db.ts';

test('HTTP Hint Reveal: strict pinned version and hint existence validation (Finding 4)', async (t) => {
  const db = setupTestDb();
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  // Sign in as student
  const signRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ada@zur.internal', password: 'StudentPass123!' }),
  });
  assert.equal(signRes.status, 200);
  const { token: studentToken } = await signRes.json() as any;
  assert.ok(studentToken);

  const enr = db.prepare(`SELECT id, pinned_version_id FROM enrollments WHERE user_id = 'user-student-1' AND course_id = 'course-python-foundations'`).get() as any;
  assert.ok(enr);

  // Published snapshots are the source of truth for version-pinned learning content.
  const snapshotRow = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(enr.pinned_version_id) as any;
  const pinnedSnapshot = JSON.parse(snapshotRow.snapshot_data);
  const pinnedExercise = pinnedSnapshot.modules.flatMap((module: any) => module.lessons)
    .flatMap((lesson: any) => lesson.steps).find((step: any) => step.id === 'step-4-python-echo');
  pinnedExercise.content = { hints: ['Read the input as a string first.', 'Convert it to an integer before multiplying.'] };
  db.prepare('UPDATE course_versions SET snapshot_data = ? WHERE id = ?').run(JSON.stringify(pinnedSnapshot), enr.pinned_version_id);

  await t.test('rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hintIndex: 0 }),
    });
    assert.equal(res.status, 401);
  });

  await t.test('rejects arbitrary fabricated stepId not in pinned version with 404', async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/fake-step-does-not-exist/hint-reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ hintIndex: 0 }),
    });
    assert.equal(res.status, 404);
  });

  await t.test('rejects step without hints (theory step) with 400 validation error', async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-1-theory/hint-reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ hintIndex: 0 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.ok(body.error?.message?.includes('hints'));
  });

  await t.test('rejects missing hintIndex and ignores hints from mutable current content', async () => {
    const originalContent = db.prepare('SELECT content_payload FROM step_contents WHERE step_id = ?').get('step-4-python-echo') as any;
    const payload = JSON.parse(originalContent.content_payload);
    payload.hints = [];
    db.prepare('UPDATE step_contents SET content_payload = ? WHERE step_id = ?').run(JSON.stringify(payload), 'step-4-python-echo');
    try {
      const missingIndex = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({}),
      });
      assert.equal(missingIndex.status, 400, 'An event must name a real, selected pinned-version hint');

      const pinnedHint = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
        body: JSON.stringify({ hintIndex: 0 }),
      });
      assert.equal(pinnedHint.status, 200, 'Pinned version hint remains available despite current draft content changes');
    } finally {
      db.prepare('UPDATE step_contents SET content_payload = ? WHERE step_id = ?').run(originalContent.content_payload, 'step-4-python-echo');
    }
  });

  await t.test('rejects out-of-bounds hintIndex with 400 validation error', async () => {
    // Step 4 has hints in seeded data; test invalid index
    const res = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ hintIndex: 999 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.ok(body.error?.message?.includes('Invalid hint index'));
  });

  await t.test('records product analytics event on valid reveal', async () => {
    const res = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ hintIndex: 0 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.hintIndex, 0);

    const repeated = await fetch(`${baseUrl}/api/enrollments/${enr.id}/steps/step-4-python-echo/hint-reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ hintIndex: 0 }),
    });
    assert.equal(repeated.status, 200, 'Repeat reveal requests remain safe for the learner');

    // Verify product analytics event was recorded in DB
    const evts = db.prepare(`SELECT * FROM product_analytics_events WHERE event_name = 'hint.revealed' AND step_id = 'step-4-python-echo'`).all() as any[];
    assert.equal(evts.length, 1, 'Repeated direct reveal requests must not duplicate analytics');
    const latest = evts[evts.length - 1];
    const meta = JSON.parse(latest.metadata);
    assert.equal(meta.hintIndex, 0);
  });
});

test('HTTP publication analytics stores the exact version from its publication receipt', async (t) => {
  const db = setupTestDb();
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const signIn = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'guido@zur.internal', password: 'AuthorPass123!' }),
  });
  assert.equal(signIn.status, 200);
  const { token } = await signIn.json() as any;
  const courseId = 'course-python-foundations';
  const draft = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as { draft_revision: number };
  const publish = await fetch(`${baseUrl}/api/author/courses/${courseId}/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expectedRevision: draft.draft_revision, changeSummary: 'Audit publication event' }),
  });
  assert.equal(publish.status, 200);
  const receipt = await publish.json() as { versionId: string };
  const event = db.prepare(`SELECT course_version_id FROM product_analytics_events WHERE event_name = 'course.published' AND course_id = ? ORDER BY created_at DESC LIMIT 1`).get(courseId) as any;
  assert.equal(event.course_version_id, receipt.versionId);
});

test('HTTP email invitations report provider delivery separately from invitation validity', async (t) => {
  const db = setupTestDb();
  let providerOkay = true;
  const mailer = new EmailDeliveryService({
    provider: 'postmark', serverToken: 'test-token', from: 'noreply@example.test',
    appBaseUrl: 'https://zur.example.test', runtime: 'test',
    fetcher: async () => ({ ok: providerOkay, status: providerOkay ? 200 : 503 }),
  });
  const server = createServer(db, { emailDeliveryService: mailer });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const signIn = await fetch(`${baseUrl}/api/auth/sign-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'guido@zur.internal', password: 'AuthorPass123!' }),
  });
  const { token } = await signIn.json() as any;
  const create = async (email: string) => fetch(`${baseUrl}/api/author/courses/course-python-foundations/invitations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'email', recipientEmail: email }),
  });
  const sent = await create('sent@example.test');
  assert.equal(sent.status, 201);
  const sentBody = await sent.json() as any;
  assert.equal(sentBody.delivery.status, 'sent');
  assert.equal(sentBody.invitation.isRevoked, false);
  assert.equal(sentBody.invitation.emailDeliveryStatus, 'sent');

  providerOkay = false;
  const failed = await create('failed@example.test');
  assert.equal(failed.status, 201);
  const failedBody = await failed.json() as any;
  assert.equal(failedBody.delivery.status, 'failed');
  assert.equal(failedBody.invitation.isRevoked, false);
  assert.equal(failedBody.invitation.emailDeliveryStatus, 'failed');
  assert.match(failedBody.delivery.message, /remains valid/i);
});

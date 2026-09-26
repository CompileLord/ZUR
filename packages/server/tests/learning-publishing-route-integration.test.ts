import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { createServer } from '../src/server.ts';
import type { AddressInfo } from 'node:net';

test('Live P15 content and P27 review APIs accept seeded opaque IDs and preserve access boundaries', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const signIn = async (email: string, password: string) => {
    const response = await fetch(`${origin}/api/auth/sign-in`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    return (await response.json() as any).token as string;
  };

  const studentToken = await signIn('ada@zur.internal', 'StudentPass123!');
  const contentResponse = await fetch(`${origin}/api/learn/enr-ada/steps/step-6-python-evenodd/content`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  assert.equal(contentResponse.status, 200);
  const content = await contentResponse.json() as any;
  assert.equal(content.step.id, 'step-6-python-evenodd');
  assert.equal(content.content.starterCode.includes('Check even or odd'), true);
  assert.equal(content.content.referenceSolution, undefined);
  assert.equal(content.content.testCases.some((row: any) => row.isHidden || row.id === 'tc-2-hidden'), false);

  const hiddenFailureResponse = await fetch(`${origin}/api/execution/submit`, {
    method: 'POST', headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd',
      code: 'import sys\nraw=sys.stdin.read().strip()\nprint("Empty" if not raw else "Even")',
    }),
  });
  assert.equal(hiddenFailureResponse.status, 200);
  const hiddenFailure = await hiddenFailureResponse.json() as any;
  assert.equal(hiddenFailure.result.verdict, 'WRONG_ANSWER');
  assert.equal(hiddenFailure.result.executionTimeMs, undefined);
  assert.equal(hiddenFailure.result.testResults.some((row: any) => row.input === '-3' || row.expectedOutput === 'Odd'), false);

  const hiddenAttemptId = hiddenFailure.result.attemptId;
  const historyPath = `/api/attempts?enrollmentId=enr-ada&stepId=step-6-python-evenodd`;
  const hiddenHistoryResponse = await fetch(`${origin}${historyPath}`, { headers: { Authorization: `Bearer ${studentToken}` } });
  assert.equal(hiddenHistoryResponse.status, 200);
  const hiddenHistory = await hiddenHistoryResponse.json() as any;
  const hiddenHistoryItem = hiddenHistory.items.find((row: any) => row.id === hiddenAttemptId);
  assert.ok(hiddenHistoryItem);
  assert.equal(Object.hasOwn(hiddenHistoryItem, 'executionTimeMs'), false);
  const hiddenDetailResponse = await fetch(`${origin}/api/attempts/${encodeURIComponent(hiddenAttemptId)}`, { headers: { Authorization: `Bearer ${studentToken}` } });
  assert.equal(hiddenDetailResponse.status, 200);
  const hiddenDetail = await hiddenDetailResponse.json() as any;
  assert.equal(Object.hasOwn(hiddenDetail, 'executionTimeMs'), false);

  const publicFailureResponse = await fetch(`${origin}/api/execution/submit`, {
    method: 'POST', headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd', code: 'import sys\nraw=sys.stdin.read().strip()\nprint("Wrong" if raw == "4" else "Empty" if not raw else "Odd")' }),
  });
  assert.equal(publicFailureResponse.status, 200);
  const publicFailure = await publicFailureResponse.json() as any;
  assert.equal(publicFailure.result.verdict, 'WRONG_ANSWER');
  assert.ok(publicFailure.result.executionTimeMs > 0);
  const publicAttemptId = publicFailure.result.attemptId;
  const historyAfterPublicFailure = await (await fetch(`${origin}${historyPath}`, { headers: { Authorization: `Bearer ${studentToken}` } })).json() as any;
  const publicHistoryItem = historyAfterPublicFailure.items.find((row: any) => row.id === publicAttemptId);
  assert.ok(publicHistoryItem.executionTimeMs > 0, 'public-test failures retain execution timing');
  const publicDetail = await (await fetch(`${origin}/api/attempts/${encodeURIComponent(publicAttemptId)}`, { headers: { Authorization: `Bearer ${studentToken}` } })).json() as any;
  assert.ok(publicDetail.executionTimeMs > 0, 'public-test failure detail retains execution timing');

  const foreignResponse = await fetch(`${origin}/api/learn/enr-ada/steps/step-6-python-evenodd/content`, {
    headers: { Authorization: `Bearer ${await signIn('grace@zur.internal', 'StudentPass123!')}` },
  });
  assert.equal(foreignResponse.status, 404, 'foreign enrollment gets the safe denial');

  const authorToken = await signIn('guido@zur.internal', 'AuthorPass123!');
  const courseResponse = await fetch(`${origin}/api/author/courses/course-python-foundations`, {
    headers: { Authorization: `Bearer ${authorToken}` },
  });
  assert.equal(courseResponse.status, 200);
  const course = await courseResponse.json() as any;
  assert.equal(course.currentVersionNumber, 2);

  const validationResponse = await fetch(`${origin}/api/author/courses/course-python-foundations/validate`, {
    method: 'POST', headers: { Authorization: `Bearer ${authorToken}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(validationResponse.status, 200);
  const validation = await validationResponse.json() as any;
  assert.equal(validation.draftRevision, course.draftRevision);
  assert.equal(Array.isArray(validation.errors), true);

  const resetWithoutRevision = await fetch(`${origin}/api/drafts/reset`, {
    method: 'POST', headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd' }),
  });
  assert.equal(resetWithoutRevision.status, 400, 'reset requires an expected revision');
  const resetAtZero = await fetch(`${origin}/api/drafts/reset`, {
    method: 'POST', headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd', expectedRevision: 0 }),
  });
  assert.equal(resetAtZero.status, 200);
  const reset = await resetAtZero.json() as any;
  assert.equal(reset.revision, 1);
  const staleReset = await fetch(`${origin}/api/drafts/reset`, {
    method: 'POST', headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd', expectedRevision: 0 }),
  });
  assert.equal(staleReset.status, 409, 'stale reset is a revision conflict');
  const conflict = await staleReset.json() as any;
  assert.equal(conflict.error.currentRevision, 1);
});

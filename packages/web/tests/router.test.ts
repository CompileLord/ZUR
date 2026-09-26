import test from 'node:test';
import assert from 'node:assert';
import {
  ROUTES,
  matchRoute,
  sanitizeQueryParams,
  getSafeReturnDestination,
} from '../src/router/routes.ts';

test('P01–P45 Route Contracts and URL Safety (design.md §9, §14, T012)', async (t) => {
  await t.test('All 45 page IDs from P01 to P45 are represented', () => {
    const registeredPageIds = new Set(ROUTES.map((r) => r.pageId));

    for (let i = 1; i <= 45; i++) {
      const pageId = `P${String(i).padStart(2, '0')}`;
      assert.strictEqual(
        registeredPageIds.has(pageId),
        true,
        `Page ${pageId} must be present in route contracts`
      );
    }
  });

  await t.test('Route matching extracts dynamic parameters correctly', () => {
    const match = matchRoute('/courses/course-python-101');
    assert.strictEqual(Boolean(match), true);
    assert.strictEqual(match?.route.pageId, 'P03');
    assert.strictEqual(match?.params.courseId, 'course-python-101');

    const stepMatch = matchRoute('/learn/enr-1/steps/step-42');
    assert.strictEqual(Boolean(stepMatch), true);
    assert.strictEqual(stepMatch?.route.pageId, 'P12');
    assert.strictEqual(stepMatch?.params.enrollmentId, 'enr-1');
    assert.strictEqual(stepMatch?.params.stepId, 'step-42');
    assert.equal(matchRoute('/learn/enr-1/steps/step-42/video'), null);
    assert.equal(matchRoute('/learn/enr-1/steps/step-42/quiz'), null);
    assert.equal(matchRoute('/learn/enr-1/steps/step-42/code'), null);
    const historyMatch = matchRoute('/learn/enr-1/steps/step-42/attempts');
    assert.equal(historyMatch?.route.pageId, 'P16');
    assert.equal(historyMatch?.params.stepId, 'step-42');
    const detailMatch = matchRoute('/learn/enr-1/steps/step-42/attempts/att-8');
    assert.equal(detailMatch?.route.pageId, 'P16');
    assert.equal(detailMatch?.params.attemptId, 'att-8');
  });

  await t.test('Sanitize query params filters out code, tokens, and untracked keys', () => {
    const rawParams = {
      q: 'python functions',
      category: 'programming',
      token: 'zur_sec_secret_token_leak',
      code: 'print("sensitive student code")',
      evil: '<script>alert(1)</script>',
    };

    const sanitized = sanitizeQueryParams(rawParams);

    assert.strictEqual(sanitized.q, 'python functions');
    assert.strictEqual(sanitized.category, 'programming');
    assert.strictEqual(sanitized.token, undefined);
    assert.strictEqual(sanitized.code, undefined);
    assert.strictEqual(sanitized.evil, undefined);
  });

  await t.test('Safe return destination prevents open redirects', () => {
    assert.strictEqual(getSafeReturnDestination('/learn/courses'), '/learn/courses');
    assert.strictEqual(getSafeReturnDestination('https://malicious-site.com'), '/learn');
    assert.strictEqual(getSafeReturnDestination('//malicious-site.com'), '/learn');
    assert.strictEqual(getSafeReturnDestination('/\\malicious.com'), '/learn');
    assert.strictEqual(getSafeReturnDestination(null), '/learn');
  });
});

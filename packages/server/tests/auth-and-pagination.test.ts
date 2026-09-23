import test from 'node:test';
import assert from 'node:assert';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { AuthorizationService } from '../src/services/auth-service.ts';
import { paginate } from '../src/services/pagination.ts';
import { redactExecutionResultForStudent } from '../src/services/redaction-service.ts';

test('Authorization and Pagination Core (T007, AC-05, AC-10)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  const authService = new AuthorizationService(db);

  await t.test('AC-05: Guessed private course or unknown resource returns safe denial', () => {
    const visitor = { userId: null, capabilities: ['student' as const], isSuspended: false };

    // Guessed nonexistent course
    const nonexistentAccess = authService.getCourseAccess(visitor, 'guessed-course-id-999');
    assert.strictEqual(nonexistentAccess.allowed, false);

    const safeErr = authService.safeNotFound();
    assert.strictEqual(safeErr.message, "This page isn't available.");
    assert.strictEqual(safeErr.statusCode, 404);
  });

  await t.test('Course access checks distinguish owner, enrolled student, and suspended state', () => {
    const ownerCtx = { userId: 'user-author-1', capabilities: ['author' as const], isSuspended: false };
    const studentCtx = { userId: 'user-student-1', capabilities: ['student' as const], isSuspended: false };
    const strangerCtx = { userId: 'user-stranger', capabilities: ['student' as const], isSuspended: false };

    // Owner has owner role
    const ownerAccess = authService.getCourseAccess(ownerCtx, 'course-python-foundations');
    assert.strictEqual(ownerAccess.allowed, true);
    assert.strictEqual(ownerAccess.role, 'owner');

    // Enrolled student has student role
    const studentAccess = authService.getCourseAccess(studentCtx, 'course-python-foundations');
    assert.strictEqual(studentAccess.allowed, true);
    assert.strictEqual(studentAccess.role, 'student');
    assert.strictEqual(studentAccess.isEnrolled, true);

    // Suspended course denies student
    const suspendedAccess = authService.getCourseAccess(studentCtx, 'course-suspended-tricks');
    assert.strictEqual(suspendedAccess.allowed, false);

    // Admin can access suspended course
    const adminCtx = { userId: 'user-admin-1', capabilities: ['admin' as const], isSuspended: false };
    const adminAccess = authService.getCourseAccess(adminCtx, 'course-suspended-tricks');
    assert.strictEqual(adminAccess.allowed, true);
    assert.strictEqual(adminAccess.role, 'admin');
  });

  await t.test('Server-side pagination returns bounded pages and correct metadata', () => {
    const paginated = paginate<any>(db, {
      countQuery: 'SELECT COUNT(*) as count FROM steps',
      dataQuery: 'SELECT id, title, position FROM steps ORDER BY position ASC',
      params: [],
      limit: 2,
      offset: 0,
    });

    assert.strictEqual(paginated.items.length, 2);
    assert.strictEqual(paginated.limit, 2);
    assert.strictEqual(paginated.offset, 0);
    assert.strictEqual(paginated.total >= 7, true);
    assert.strictEqual(paginated.hasMore, true);
  });

  await t.test('AC-10: Redaction strips all hidden test details on failure', () => {
    const rawHiddenFailure = {
      attemptId: 'att-123',
      verdict: 'WRONG_ANSWER',
      isInfrastructureFailure: false,
      failedTestIsHidden: true,
      publicTestsResults: [
        { position: 0, passed: true, input: '5', expectedOutput: '10', actualOutput: '10' },
      ],
      executionTimeMs: 145,
    };

    const redacted = redactExecutionResultForStudent(rawHiddenFailure);

    assert.strictEqual(redacted.verdict, 'WRONG_ANSWER');
    assert.strictEqual(redacted.guidance, 'Your solution did not pass a hidden test. Review the input limits and edge cases.');
    // Check timing is stripped on hidden failure
    assert.strictEqual(redacted.executionTimeMs, undefined);
    // Hidden inputs/outputs are never present
    assert.strictEqual((redacted as any).hiddenStdin, undefined);
  });
});

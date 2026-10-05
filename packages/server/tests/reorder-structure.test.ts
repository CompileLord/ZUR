import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { getDatabase, closeDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseStructureService } from '../src/services/course-structure-service.ts';
import { IdentityService } from '../src/services/identity-service.ts';
import { createServer } from '../src/server.ts';
import { ValidationError, NotFoundError, AuthorizationError } from 'zur-shared';

function setupTestDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-reorder-test-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  runMigrations(dbPath);
  seedDatabase(dbPath);
  const db = getDatabase(dbPath);
  return { db, dbPath };
}

function teardownTestDb(dbPath: string) {
  closeDatabase(dbPath);
  try {
    const dir = path.dirname(dbPath);
    if (dir.includes('zur-reorder-test-')) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {}
}

test('R01: CourseStructureService.reorderModules validates exact membership and atomic updates', () => {
  const { db, dbPath } = setupTestDb();
  try {
    const service = new CourseStructureService(db);
    const courseId = 'course-python-foundations';
    const authorId = 'user-author-1';

    const treeBefore = service.getCourseTree(authorId, courseId);
    assert.ok(treeBefore.modules.length >= 2, 'Course should have at least 2 modules for reorder test');

    const originalIds = treeBefore.modules.map((m) => m.id);
    const reversedIds = [...originalIds].reverse();

    // 1. Rejects non-array
    assert.throws(
      () => service.reorderModules(authorId, courseId, null as any),
      (err: any) => err instanceof ValidationError
    );

    // 2. Rejects duplicates
    assert.throws(
      () => service.reorderModules(authorId, courseId, [originalIds[0], originalIds[0], ...originalIds.slice(2)]),
      (err: any) => err instanceof ValidationError
    );

    // 3. Rejects missing IDs (subset)
    assert.throws(
      () => service.reorderModules(authorId, courseId, [originalIds[0]]),
      (err: any) => err instanceof ValidationError
    );

    // 4. Rejects foreign IDs
    assert.throws(
      () => service.reorderModules(authorId, courseId, [...originalIds.slice(1), 'foreign-module-id']),
      (err: any) => err instanceof ValidationError
    );

    // 5. Rejects unauthorized user (Ada is student only, not author/owner)
    assert.throws(
      () => service.reorderModules('user-student-1', courseId, reversedIds),
      (err: any) => err instanceof NotFoundError || err instanceof AuthorizationError
    );

    // 6. Successful atomic reorder
    const courseBefore = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
    const result = service.reorderModules(authorId, courseId, reversedIds);
    assert.equal(result.success, true);
    assert.ok(result.newRevision > courseBefore.draft_revision);

    const treeAfter = service.getCourseTree(authorId, courseId);
    assert.deepEqual(treeAfter.modules.map((m) => m.id), reversedIds);
    for (let i = 0; i < treeAfter.modules.length; i++) {
      assert.equal(treeAfter.modules[i].position, i);
    }
  } finally {
    teardownTestDb(dbPath);
  }
});

test('R01: CourseStructureService.reorderLessons validates exact membership and atomic updates', () => {
  const { db, dbPath } = setupTestDb();
  try {
    const service = new CourseStructureService(db);
    const courseId = 'course-python-foundations';
    const authorId = 'user-author-1';
    const modId = 'mod-1-variables';

    // Add a second lesson to mod-1-variables so we can reorder
    service.addLesson(authorId, courseId, modId, 'Second Lesson for Reorder');

    const treeBefore = service.getCourseTree(authorId, courseId);
    const targetMod = treeBefore.modules.find((m) => m.id === modId)!;
    assert.ok(targetMod.lessons.length >= 2);

    const originalLessonIds = targetMod.lessons.map((l) => l.id);
    const reversedLessonIds = [...originalLessonIds].reverse();

    // 1. Rejects non-array
    assert.throws(
      () => service.reorderLessons(authorId, courseId, modId, 'invalid' as any),
      (err: any) => err instanceof ValidationError
    );

    // 2. Rejects duplicate IDs
    assert.throws(
      () => service.reorderLessons(authorId, courseId, modId, [originalLessonIds[0], originalLessonIds[0]]),
      (err: any) => err instanceof ValidationError
    );

    // 3. Rejects missing IDs
    assert.throws(
      () => service.reorderLessons(authorId, courseId, modId, [originalLessonIds[0]]),
      (err: any) => err instanceof ValidationError
    );

    // 4. Rejects foreign IDs
    assert.throws(
      () => service.reorderLessons(authorId, courseId, modId, [...originalLessonIds.slice(1), 'foreign-lesson-id']),
      (err: any) => err instanceof ValidationError
    );

    // 5. Successful atomic reorder
    const result = service.reorderLessons(authorId, courseId, modId, reversedLessonIds);
    assert.equal(result.success, true);

    const treeAfter = service.getCourseTree(authorId, courseId);
    const targetModAfter = treeAfter.modules.find((m) => m.id === modId)!;
    assert.deepEqual(targetModAfter.lessons.map((l) => l.id), reversedLessonIds);
    for (let i = 0; i < targetModAfter.lessons.length; i++) {
      assert.equal(targetModAfter.lessons[i].position, i);
    }
  } finally {
    teardownTestDb(dbPath);
  }
});

test('R01: CourseStructureService.reorderSteps validates exact membership and atomic updates', () => {
  const { db, dbPath } = setupTestDb();
  try {
    const service = new CourseStructureService(db);
    const courseId = 'course-python-foundations';
    const authorId = 'user-author-1';
    const lessonId = 'les-1-naming';

    const treeBefore = service.getCourseTree(authorId, courseId);
    const targetLesson = treeBefore.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)!;
    assert.ok(targetLesson.steps.length >= 2);

    const originalStepIds = targetLesson.steps.map((s) => s.id);
    const reversedStepIds = [...originalStepIds].reverse();

    // 1. Rejects non-array
    assert.throws(
      () => service.reorderSteps(authorId, courseId, lessonId, undefined as any),
      (err: any) => err instanceof ValidationError
    );

    // 2. Rejects duplicate IDs
    assert.throws(
      () => service.reorderSteps(authorId, courseId, lessonId, [originalStepIds[0], originalStepIds[0], ...originalStepIds.slice(2)]),
      (err: any) => err instanceof ValidationError
    );

    // 3. Rejects missing IDs
    assert.throws(
      () => service.reorderSteps(authorId, courseId, lessonId, originalStepIds.slice(0, -1)),
      (err: any) => err instanceof ValidationError
    );

    // 4. Rejects foreign IDs
    assert.throws(
      () => service.reorderSteps(authorId, courseId, lessonId, [...originalStepIds.slice(1), 'foreign-step-id']),
      (err: any) => err instanceof ValidationError
    );

    // 5. Successful atomic reorder
    const result = service.reorderSteps(authorId, courseId, lessonId, reversedStepIds);
    assert.equal(result.success, true);

    const treeAfter = service.getCourseTree(authorId, courseId);
    const targetLessonAfter = treeAfter.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)!;
    assert.deepEqual(targetLessonAfter.steps.map((s) => s.id), reversedStepIds);
    for (let i = 0; i < targetLessonAfter.steps.length; i++) {
      assert.equal(targetLessonAfter.steps[i].position, i);
    }
  } finally {
    teardownTestDb(dbPath);
  }
});

test('R01: Reordering rolls back atomically on mid-update failure without modifying positions or revision', () => {
  const { db, dbPath } = setupTestDb();
  try {
    const service = new CourseStructureService(db);
    const courseId = 'course-python-foundations';
    const authorId = 'user-author-1';
    const lessonId = 'les-1-naming';

    const stepsBefore = db.prepare('SELECT id, position FROM steps WHERE lesson_id = ? ORDER BY position ASC').all(lessonId) as any[];
    const courseBefore = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;

    // Install a trigger that aborts when updating a specific step's position mid-update
    const failingStepId = stepsBefore[stepsBefore.length - 1].id;
    db.exec(`
      CREATE TRIGGER test_mid_update_abort
      BEFORE UPDATE OF position ON steps
      FOR EACH ROW
      WHEN NEW.id = '${failingStepId}'
      BEGIN
        SELECT RAISE(ABORT, 'Simulated mid-update database failure');
      END;
    `);

    const reversedStepIds = stepsBefore.map((s) => s.id).reverse();

    // Reorder should throw because of the trigger
    assert.throws(
      () => service.reorderSteps(authorId, courseId, lessonId, reversedStepIds),
      /Simulated mid-update database failure/
    );

    // Verify rollback: all step positions MUST be completely unchanged
    const stepsAfter = db.prepare('SELECT id, position FROM steps WHERE lesson_id = ? ORDER BY position ASC').all(lessonId) as any[];
    assert.deepEqual(stepsAfter, stepsBefore, 'All step positions must remain untouched after rollback');

    // Verify draft revision was NOT bumped
    const courseAfter = db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any;
    assert.equal(courseAfter.draft_revision, courseBefore.draft_revision, 'Draft revision must not increment on rollback');
  } finally {
    teardownTestDb(dbPath);
  }
});

test('R01: Adversarial HTTP tests for reorder endpoints enforce exact membership, authorization, and error statuses', async () => {
  const { db, dbPath } = setupTestDb();
  const server = createServer(db);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;

  try {
    const identityService = new IdentityService(db);
    const authorSession = identityService.signIn({ email: 'guido@zur.internal', password: 'AuthorPass123!' });
    const studentSession = identityService.signIn({ email: 'ada@zur.internal', password: 'StudentPass123!' });

    const courseId = 'course-python-foundations';
    const moduleId = 'mod-1-variables';
    const lessonId = 'les-1-naming';

    const getRevision = () => (db.prepare('SELECT draft_revision FROM courses WHERE id = ?').get(courseId) as any).draft_revision;
    const initialRevision = getRevision();

    // 1. Unauthenticated -> 401
    const unauthRes = await fetch(`${origin}/api/author/courses/${courseId}/modules/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleIds: ['mod-1-variables'] }),
    });
    assert.equal(unauthRes.status, 401);
    assert.equal(getRevision(), initialRevision);

    // 2. Unauthorized user (Student) -> 404 / 403
    const studentRes = await fetch(`${origin}/api/author/courses/${courseId}/modules/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentSession.token}`,
      },
      body: JSON.stringify({ moduleIds: ['mod-1-variables'] }),
    });
    assert.ok(studentRes.status === 404 || studentRes.status === 403);
    assert.equal(getRevision(), initialRevision);

    // 3. Malformed payload: not an array -> 400
    const malformedRes = await fetch(`${origin}/api/author/courses/${courseId}/modules/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorSession.token}`,
      },
      body: JSON.stringify({ moduleIds: 'invalid' }),
    });
    assert.equal(malformedRes.status, 400);
    assert.equal(getRevision(), initialRevision);

    // 4. Missing IDs (subset) -> 400
    const missingRes = await fetch(`${origin}/api/author/courses/${courseId}/modules/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorSession.token}`,
      },
      body: JSON.stringify({ moduleIds: ['mod-1-variables'] }),
    });
    assert.equal(missingRes.status, 400);
    assert.equal(getRevision(), initialRevision);

    // 5. Duplicate IDs -> 400
    const duplicateRes = await fetch(`${origin}/api/author/courses/${courseId}/modules/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorSession.token}`,
      },
      body: JSON.stringify({ moduleIds: ['mod-1-variables', 'mod-1-variables', 'mod-2-conditions'] }),
    });
    assert.equal(duplicateRes.status, 400);
    assert.equal(getRevision(), initialRevision);

    // 6. Foreign ID from outside the course -> 400
    const foreignRes = await fetch(`${origin}/api/author/courses/${courseId}/modules/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorSession.token}`,
      },
      body: JSON.stringify({ moduleIds: ['mod-1-variables', 'mod-2-conditions', 'foreign-mod-xyz'] }),
    });
    assert.equal(foreignRes.status, 400);
    assert.equal(getRevision(), initialRevision);

    // 7. Step reorder adversarial tests:
    const stepMissingRes = await fetch(`${origin}/api/author/courses/${courseId}/lessons/${lessonId}/steps/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorSession.token}`,
      },
      body: JSON.stringify({ stepIds: ['step-1-theory'] }),
    });
    assert.equal(stepMissingRes.status, 400);
    assert.equal(getRevision(), initialRevision);

    // 8. Valid authenticated reorder succeeds -> 200
    const stepsInLesson = db.prepare('SELECT id FROM steps WHERE lesson_id = ? ORDER BY position ASC').all(lessonId) as any[];
    const reversedStepIds = stepsInLesson.map((s) => s.id).reverse();

    const validRes = await fetch(`${origin}/api/author/courses/${courseId}/lessons/${lessonId}/steps/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authorSession.token}`,
      },
      body: JSON.stringify({ stepIds: reversedStepIds }),
    });
    assert.equal(validRes.status, 200);
    const validJson = await validRes.json() as any;
    assert.equal(validJson.success, true);
    assert.ok(validJson.newRevision > initialRevision);

    // Verify browser reload persistence: reading back the course tree reveals the new step order
    const treeRes = await fetch(`${origin}/api/author/courses/${courseId}/structure`, {
      headers: { Authorization: `Bearer ${authorSession.token}` },
    });
    assert.equal(treeRes.status, 200);
    const treeJson = await treeRes.json() as any;
    const reloadedLesson = treeJson.modules.flatMap((m: any) => m.lessons).find((l: any) => l.id === lessonId);
    assert.deepEqual(reloadedLesson.steps.map((s: any) => s.id), reversedStepIds);
  } finally {
    server.close();
    teardownTestDb(dbPath);
  }
});

test('R01: Reordering draft structure does not affect published course_versions or enrollment snapshots', () => {
  const { db, dbPath } = setupTestDb();
  try {
    const service = new CourseStructureService(db);
    const courseId = 'course-python-foundations';
    const authorId = 'user-author-1';
    const lessonId = 'les-1-naming';

    // Verify published version snapshot exists before reorder
    const versionBefore = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get('version-2-snapshot') as any;
    assert.ok(versionBefore?.snapshot_data);

    // Reorder steps in draft
    const treeBefore = service.getCourseTree(authorId, courseId);
    const targetLesson = treeBefore.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)!;
    const reversedStepIds = [...targetLesson.steps.map((s) => s.id)].reverse();
    service.reorderSteps(authorId, courseId, lessonId, reversedStepIds);

    // Verify published version snapshot is completely unchanged
    const versionAfter = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get('version-2-snapshot') as any;
    assert.equal(versionAfter.snapshot_data, versionBefore.snapshot_data, 'Published snapshot must be byte-for-byte identical');

    // Verify enrollment pinned version remains active and uncorrupted
    const enrollment = db.prepare('SELECT * FROM enrollments WHERE id = ?').get('enr-ada') as any;
    assert.equal(enrollment.pinned_version_id, 'version-2-snapshot');
  } finally {
    closeDatabase(dbPath);
  }
});

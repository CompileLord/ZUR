import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';

// Settings > Versions lists every published version, newest first, with the learners pinned to it.
test('the author course payload lists published versions with pinned learner counts', () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const course = new CourseService(db).getCourse('user-author-1', 'course-python-foundations') as any;
  const expected = db.prepare(`SELECT cv.id, cv.version_number, (SELECT COUNT(*) FROM enrollments e WHERE e.pinned_version_id = cv.id AND e.status = 'active') n
    FROM course_versions cv WHERE cv.course_id = 'course-python-foundations' ORDER BY cv.version_number DESC`).all() as any[];
  assert.ok(expected.length > 0);
  assert.deepEqual(course.versions.map((v: any) => [v.id, v.versionNumber, v.activeLearnerCount]), expected.map((v) => [v.id, v.version_number, v.n]));
  assert.ok(course.versions.every((v: any) => !Number.isNaN(Date.parse(v.publishedAt))));
});

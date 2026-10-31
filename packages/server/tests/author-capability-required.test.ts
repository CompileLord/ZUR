import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { CourseService } from '../src/services/course-service.ts';
import { AuthorizationError } from 'zur-shared';

function setup() {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const user = (email: string) => db.prepare('SELECT id, capabilities FROM users WHERE email = ?').get(email) as { id: string; capabilities: string };
  return { db, user, courses: new CourseService(db) };
}

// PRD_V2: during the pilot, administrators grant author capability; there is no self-service.
test('a student cannot create a course or gain author capability by trying', () => {
  const { user, courses } = setup();
  const ada = user('ada@zur.internal');
  assert.throws(() => courses.createCourseDraft(ada.id, { title: 'My course' }), AuthorizationError);
  assert.deepEqual(JSON.parse(user('ada@zur.internal').capabilities), JSON.parse(ada.capabilities));
});

test('an author can create a course draft', () => {
  const { user, courses } = setup();
  const created = courses.createCourseDraft(user('guido@zur.internal').id, { title: 'Recursion basics' });
  assert.equal(created.title, 'Recursion basics');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getDatabase, closeDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { AdminService } from '../src/services/admin-service.ts';
import { CourseService } from '../src/services/course-service.ts';
import { NotFoundError } from 'zur-shared';

function setup() {
  const p = `file:w3f1-${crypto.randomUUID()}?mode=memory&cache=shared`;
  runMigrations(p);
  seedDatabase(p);
  return { db: getDatabase(p), cleanup: () => closeDatabase(p) };
}

test('admin overview exposes suspendedCourses additively and stays admin-only', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const admin = new AdminService(db);
  assert.throws(() => admin.getOperationsOverview('user-student-1'), NotFoundError);
  assert.throws(() => admin.getOperationsOverview('user-author-1'), NotFoundError);
  const o: any = admin.getOperationsOverview('user-admin-1');
  assert.equal(o.suspendedCourses.count, 1);
  assert.equal(o.suspendedCourses.items.length, 1);
  assert.deepEqual(Object.keys(o.suspendedCourses.items[0]).sort(), ['id', 'ownerName', 'title']);
  assert.equal(o.suspendedCourses.items[0].id, 'course-suspended-tricks');
  assert.ok(o.suspendedCourses.items[0].ownerName.length > 0);
  for (const k of ['refreshedAt', 'execution', 'queue', 'workers', 'internalErrors', 'internalErrorRate', 'executionInfrastructureErrors', 'openReports', 'emailDeliveryIssues', 'email', 'telemetry']) {
    assert.ok(k in o, `missing ${k}`);
  }
  for (let i = 0; i < 7; i++) {
    db.prepare(`INSERT INTO courses (id, owner_id, category_id, title, description, difficulty, language, visibility, enrollment_policy, publication_status, is_suspended, draft_revision, created_at, updated_at)
      VALUES (?, 'user-author-1', 'cat-programming', ?, '', 'beginner', 'en', 'public', 'open', 'published', 1, 1, ?, ?)`)
      .run(`susp-${i}`, `Susp ${i}`, `2030-01-0${i + 1}T00:00:00.000Z`, `2030-01-0${i + 1}T00:00:00.000Z`);
  }
  const o2: any = admin.getOperationsOverview('user-admin-1');
  assert.equal(o2.suspendedCourses.count, 8);
  assert.equal(o2.suspendedCourses.items.length, 5);
  assert.equal(o2.suspendedCourses.items[0].id, 'susp-6');
});

test('catalog lessonCount/stepCount come from the published snapshot only', (t) => {
  const { db, cleanup } = setup();
  t.after(cleanup);
  const svc = new CourseService(db);
  const row = db.prepare(`SELECT c.id, cv.snapshot_data sd FROM courses c JOIN course_versions cv ON cv.id=c.current_version_id WHERE c.id='course-python-foundations'`).get() as any;
  const snap = JSON.parse(row.sd);
  let lessons = 0;
  let steps = 0;
  for (const m of snap.modules || []) for (const l of m.lessons || []) { lessons++; steps += (l.steps || []).length; }
  assert.ok(lessons > 0 && steps > 0);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO modules (id, course_id, title, position, created_at, updated_at) VALUES ('draft-m', ?, 'Draft', 99, ?, ?)`).run(row.id, now, now);
  for (let i = 0; i < 3; i++) {
    db.prepare(`INSERT INTO lessons (id, module_id, title, position, created_at, updated_at) VALUES (?, 'draft-m', 'D', ?, ?, ?)`).run(`draft-l${i}`, i, now, now);
    db.prepare(`INSERT INTO steps (id, lesson_id, type, title, position, created_at, updated_at) VALUES (?, ?, 'theory', 'D', 0, ?, ?)`).run(`draft-s${i}`, `draft-l${i}`, now, now);
  }
  const cat = svc.listPublicCatalog();
  const item: any = cat.courses.find((c) => c.id === 'course-python-foundations');
  assert.equal(item.lessonCount, lessons);
  assert.equal(item.stepCount, steps);
  assert.equal(cat.courses.some((c) => c.id === 'course-suspended-tricks'), false);
});

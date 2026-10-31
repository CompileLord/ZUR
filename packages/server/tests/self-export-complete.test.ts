import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';
import { IdentityService } from '../src/services/identity-service.ts';

// A learner's own export must carry everything they wrote, in the same shape an admin export uses.
test('self-service export includes unsubmitted code drafts and the documented package shape', () => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');
  const enrollment = db.prepare(`SELECT id, course_id FROM enrollments WHERE user_id='user-student-1' LIMIT 1`).get() as { id: string; course_id: string };
  const step = db.prepare(`SELECT s.id FROM steps s JOIN lessons l ON l.id=s.lesson_id JOIN modules m ON m.id=l.module_id
    WHERE m.course_id=? AND s.type='python' LIMIT 1`).get(enrollment.course_id) as { id: string };
  db.prepare(`INSERT INTO code_drafts (id,user_id,enrollment_id,step_id,code) VALUES ('d1','user-student-1',?,?,'print("mine")') ON CONFLICT(user_id,enrollment_id,step_id) DO UPDATE SET code=excluded.code`)
    .run(enrollment.id, step.id);

  const { exportPayload } = new IdentityService(db).requestDataExport('user-student-1', 'StudentPass123!');

  assert.ok(exportPayload.codeDrafts.some((d: { code: string }) => d.code === 'print("mine")'));
  assert.equal(exportPayload.enrollments[0].courseId, enrollment.course_id);
  assert.equal(exportPayload.profile.email, 'ada@zur.internal');
});

import test from 'node:test';
import assert from 'node:assert';
import { getDatabase } from '../src/db/database.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedDatabase } from '../src/db/seed.ts';

test('Authoritative Schema & Model Invariants (T006)', async (t) => {
  const db = getDatabase(':memory:');
  runMigrations(':memory:');
  seedDatabase(':memory:');

  await t.test('All 25 authoritative entity tables exist', () => {
    const expectedTables = [
      'users', 'sessions', 'verification_tokens', 'categories', 'courses',
      'course_versions', 'modules', 'lessons', 'steps', 'step_contents',
      'test_cases', 'enrollments', 'invitations', 'code_drafts', 'execution_jobs',
      'assessment_attempts', 'step_progress', 'media_assets', 'media_uploads',
      'reports', 'audit_events', 'author_access_tokens', 'agent_mutations',
      'recovery_revisions', 'deletion_registry'
    ];

    const existingTables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'
    `).all().map((r: any) => r.name);

    for (const table of expectedTables) {
      assert.strictEqual(existingTables.includes(table), true, `Table ${table} must exist`);
    }
  });

  await t.test('Foreign Key Constraints are active and enforced', () => {
    // Attempt to insert a module referencing a nonexistent course
    assert.throws(() => {
      db.prepare(`
        INSERT INTO modules (id, course_id, title, position)
        VALUES ('mod-invalid', 'nonexistent-course', 'Fake Module', 0)
      `).run();
    }, /FOREIGN KEY constraint failed/);
  });

  await t.test('ON DELETE RESTRICT protects published course history', () => {
    // Attempt to delete a course that has an immutable version referencing it
    assert.throws(() => {
      db.prepare(`DELETE FROM courses WHERE id = 'course-python-foundations'`).run();
    }, /FOREIGN KEY constraint failed/);
  });

  await t.test('Unique constraint on enrollment per user and course', () => {
    // Attempt duplicate enrollment
    assert.throws(() => {
      db.prepare(`
        INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status)
        VALUES ('enr-dup', 'user-student-1', 'course-python-foundations', 'version-2-snapshot', 'active')
      `).run();
    }, /UNIQUE constraint failed/);
  });

  await t.test('Seed fixtures verify representative cases from design §17', () => {
    // Verify Grace Hopper is pinned to Version 1 (old-version enrollment)
    const graceEnr = db.prepare(`SELECT * FROM enrollments WHERE user_id = 'user-student-2'`).get() as any;
    assert.strictEqual(graceEnr.pinned_version_id, 'version-1-snapshot');

    // Verify Alan Turing has an audited waiver
    const alanProg = db.prepare(`SELECT * FROM step_progress WHERE user_id = 'user-student-3' AND is_waived = 1`).get() as any;
    assert.strictEqual(Boolean(alanProg), true);
    assert.strictEqual(alanProg.waiver_reason, 'Exercise test case issue under review');

    // Verify Unsafe Python Tricks is suspended
    const suspendedCourse = db.prepare(`SELECT is_suspended FROM courses WHERE id = 'course-suspended-tricks'`).get() as any;
    assert.strictEqual(suspendedCourse.is_suspended, 1);
  });
});

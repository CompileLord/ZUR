import { fileURLToPath } from 'node:url';
import { getDatabase } from './database.ts';
import { runMigrations } from './migrate.ts';
import { assertDemoSeedAllowed } from './demo-guard.ts';
import { hashPassword } from './seed/password-fixture.ts';
import { seedUsersAndCategories } from './seed/fixture-users.ts';
import { seedCourseContent } from './seed/fixture-course-content.ts';
import { seedCourseVersions } from './seed/fixture-course-versions.ts';
import { seedLearnersAndToken } from './seed/fixture-learners.ts';

export { hashPassword };

export function seedDatabase(dbPath?: string): void {
  runMigrations(dbPath);
  const db = getDatabase(dbPath);

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');
  try {
    // Clean existing data for deterministic re-seeding
    const tables = [
      'step_progress', 'assessment_attempts', 'code_drafts', 'execution_jobs',
      'test_cases', 'step_contents', 'steps', 'lessons', 'modules',
      'enrollments', 'invitations', 'course_versions', 'courses', 'categories',
      'author_access_tokens', 'agent_mutations', 'recovery_revisions', 'media_assets', 'admin_support_access',
      'media_uploads', 'reports', 'audit_events', 'verification_tokens', 'sessions',
      'user_preferences', 'privacy_exports', 'privacy_requests', 'author_validation_admissions',
      'publication_idempotency', 'course_change_plans', 'auth_request_limits', 'system_settings',
      'product_analytics_events', 'product_analytics_config', 'deletion_registry', 'users'
    ];
    const existingTables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((r) => r.name)
    );
    for (const t of tables) {
      if (existingTables.has(t)) {
        db.exec(`DELETE FROM ${t};`);
      }
    }

    const now = new Date().toISOString();

    seedUsersAndCategories(db, now);
    const content = seedCourseContent(db, now);
    const { ver1Id, ver2Id } = seedCourseVersions(db, now, content);
    seedLearnersAndToken(db, now, { course1Id: content.course1Id, ver1Id, ver2Id, step1Id: content.step1Id, step4Id: content.step4Id });

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertDemoSeedAllowed('db:seed');
  try {
    seedDatabase();
    console.log('Deterministic fixture seed completed successfully.');
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

import { fileURLToPath } from 'node:url';
import { getDatabase } from './database.ts';

const __filename = fileURLToPath(import.meta.url);

export function reapplyDeletions(dbPath?: string): number {
  const db = getDatabase(dbPath);

  const deletions = db.prepare('SELECT user_id, email_hash FROM deletion_registry').all() as Array<{
    user_id: string;
    email_hash: string;
  }>;

  let cleanedCount = 0;

  for (const item of deletions) {
    const user = db.prepare('SELECT id, account_status FROM users WHERE id = ?').get(item.user_id) as
      | { id: string; account_status: string }
      | undefined;

    if (user && user.account_status !== 'purged') {
      db.exec('BEGIN TRANSACTION;');
      try {
        // Scrub user records per AC-20 & POLICY-001
        db.prepare(`
          UPDATE users
          SET display_name = 'Deleted Learner',
              email = 'deleted-' || id || '@purged.invalid',
              password_hash = '',
              account_status = 'purged',
              updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          WHERE id = ?
        `).run(user.id);

        // Delete active sessions
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

        // Revoke author access tokens
        db.prepare('UPDATE author_access_tokens SET is_revoked = 1 WHERE author_id = ?').run(user.id);

        db.exec('COMMIT;');
        cleanedCount++;
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }
  }

  return cleanedCount;
}

if (process.argv[1] === __filename) {
  try {
    const count = reapplyDeletions();
    console.log(`AC-20 Deletion check complete. Re-scrubbed ${count} accounts.`);
  } catch (err) {
    console.error('Failed to reapply deletions:', err);
    process.exit(1);
  }
}

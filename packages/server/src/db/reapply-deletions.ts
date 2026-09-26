import { fileURLToPath } from 'node:url';
import { getDatabase } from './database.ts';
import { readDeletionTombstones } from './deletion-registry.ts';

const __filename = fileURLToPath(import.meta.url);

export function reapplyDeletions(dbPath?: string): number {
  const deletions = readDeletionTombstones();
  const db = getDatabase(dbPath);

  let cleanedCount = 0;

  for (const item of deletions) {
    const user = db.prepare('SELECT id, email, account_status FROM users WHERE id = ?').get(item.userId) as
      | { id: string; email: string; account_status: string }
      | undefined;

    if (user && user.account_status !== 'purged') {
      db.exec('BEGIN TRANSACTION;');
      try {
        db.prepare('UPDATE invitations SET is_revoked = 1 WHERE LOWER(recipient_email) = LOWER(?)').run(user.email);
        db.prepare('UPDATE invitations SET recipient_email = NULL WHERE LOWER(recipient_email) = LOWER(?)').run(user.email);
        db.prepare('DELETE FROM verification_tokens WHERE user_id = ?').run(user.id);
        db.prepare('DELETE FROM code_drafts WHERE user_id = ?').run(user.id);
        db.prepare(`
          UPDATE users
          SET display_name = 'Deleted learner',
              email = 'deleted-' || id || '@purged.invalid',
              password_hash = '',
              email_verified = 0,
              capabilities = '["student"]',
              account_status = 'purged',
              updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          WHERE id = ?
        `).run(user.id);

        // Delete active sessions
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

        // Revoke author access tokens
        db.prepare('UPDATE author_access_tokens SET is_revoked = 1 WHERE author_id = ?').run(user.id);
        db.prepare(`INSERT OR IGNORE INTO deletion_registry(id, user_id, email_hash, requested_at, purged_at) VALUES(?,?,?,?,?)`)
          .run(item.userId, item.userId, item.emailHash, item.requestedAt, item.purgedAt);

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

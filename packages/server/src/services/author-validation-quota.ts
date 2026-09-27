import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { RateLimitError } from 'zur-shared';

export class AuthorValidationQuota {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  acquire(authorId: string): () => void {
    const now = new Date();
    const recent = new Date(now.getTime() - 60_000).toISOString();
    const expires = new Date(now.getTime() + 5 * 60_000).toISOString();
    const id = `validation-${crypto.randomUUID()}`;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM author_validation_admissions WHERE started_at<?')
        .run(recent);
      const recentCount = this.db.prepare(`SELECT COUNT(*) count FROM author_validation_admissions
        WHERE author_id=? AND started_at>=?`).get(authorId, recent) as { count: number };
      const activeCount = this.db.prepare(`SELECT COUNT(*) count FROM author_validation_admissions
        WHERE author_id=? AND completed_at IS NULL AND expires_at>?`).get(authorId, now.toISOString()) as { count: number };
      if (recentCount.count >= 30 || activeCount.count >= 2) {
        throw new RateLimitError('Author validation capacity reached. Retry shortly.', 60);
      }
      this.db.prepare(`INSERT INTO author_validation_admissions(id,author_id,started_at,expires_at)
        VALUES (?,?,?,?)`).run(id, authorId, now.toISOString(), expires);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return () => {
      this.db.prepare(`UPDATE author_validation_admissions SET completed_at=? WHERE id=? AND completed_at IS NULL`)
        .run(new Date().toISOString(), id);
    };
  }
}

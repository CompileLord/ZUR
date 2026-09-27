import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { RateLimitError } from 'zur-shared';

export class AuthorValidationQuota {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  acquire(authorId: string, inTransaction: boolean = false, admissionId?: string): () => void {
    const now = new Date();
    const recent = new Date(now.getTime() - 60_000).toISOString();
    const expires = new Date(now.getTime() + 5 * 60_000).toISOString();
    const id = admissionId || `validation-${crypto.randomUUID()}`;
    if (!inTransaction) this.db.exec('BEGIN IMMEDIATE');
    try {
      // Purge only COMPLETED admissions older than 1 minute to retain 30/minute history window
      this.db.prepare('DELETE FROM author_validation_admissions WHERE completed_at IS NOT NULL AND started_at<?')
        .run(recent);
      // A crashed standalone validation has no job to finish it. Keep admissions
      // belonging to active jobs, even when their original lease has expired.
      this.db.prepare(`DELETE FROM author_validation_admissions
        WHERE completed_at IS NULL AND expires_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM execution_jobs j
            WHERE j.id = author_validation_admissions.id
              AND j.job_type = 'author_validation' AND j.status IN ('queued', 'running')
          )`).run(now.toISOString());
      const recentCount = this.db.prepare(`SELECT COUNT(*) count FROM author_validation_admissions
        WHERE author_id=? AND started_at>=?`).get(authorId, recent) as { count: number };
      const activeCount = this.getActiveCount(authorId);
      if (recentCount.count >= 30 || activeCount >= 2) {
        throw new RateLimitError('Author validation capacity reached. Retry shortly.', 60);
      }
      this.db.prepare(`INSERT INTO author_validation_admissions(id,author_id,started_at,expires_at)
        VALUES (?,?,?,?)`).run(id, authorId, now.toISOString(), expires);
      if (!inTransaction) this.db.exec('COMMIT');
    } catch (error) {
      if (!inTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
    return () => {
      this.complete(id, new Date().toISOString());
    };
  }

  complete(admissionId: string, completedAt: string = new Date().toISOString()): void {
    this.db.prepare(`UPDATE author_validation_admissions SET completed_at=? WHERE id=? AND completed_at IS NULL`)
      .run(completedAt, admissionId);
  }

  getActiveCount(authorId: string): number {
    const row = this.db.prepare(`
        SELECT COUNT(DISTINCT id) as count FROM (
          SELECT id FROM author_validation_admissions
          WHERE author_id = ? AND completed_at IS NULL
            AND (expires_at > ? OR EXISTS (
              SELECT 1 FROM execution_jobs j
              WHERE j.id = author_validation_admissions.id
                AND j.job_type = 'author_validation' AND j.status IN ('queued', 'running')
            ))
          UNION
          SELECT id FROM execution_jobs
          WHERE user_id = ? AND job_type = 'author_validation' AND status IN ('queued', 'running')
        )
      `).get(authorId, new Date().toISOString(), authorId) as { count: number };
    return row.count;
  }
}

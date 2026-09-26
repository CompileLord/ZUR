import type { DatabaseSync } from 'node:sqlite';
import {
  RateLimitError,
  ServiceUnavailableError,
  EXECUTION_BUDGETS,
} from 'zur-shared';

export class QuotaService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  isExecutionPaused(): boolean {
    const row = this.db.prepare(`
      SELECT value FROM system_settings WHERE key = 'execution_paused'
    `).get() as { value: string } | undefined;
    return row?.value === 'true';
  }

  setExecutionPaused(paused: boolean): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('execution_paused', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(paused ? 'true' : 'false', now);
  }

  assertExecutionAvailable(): void {
    if (this.isExecutionPaused()) {
      throw new ServiceUnavailableError('Python execution is temporarily paused for maintenance. Code draft saving and reading remain available.');
    }
  }

  checkCanEnqueue(userId: string, jobType: 'run_samples' | 'run_custom' | 'submit'): void {
    // 1. Operator kill switch check
    this.assertExecutionAvailable();

    // 2. Max active jobs per user (queued or running)
    const activeRow = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM execution_jobs
      WHERE user_id = ? AND status IN ('queued', 'running')
    `).get(userId) as { count: number };

    if (activeRow.count >= EXECUTION_BUDGETS.MAX_ACTIVE_JOBS_PER_USER) {
      throw new RateLimitError(
        `Active execution limit reached (${activeRow.count}/${EXECUTION_BUDGETS.MAX_ACTIVE_JOBS_PER_USER} in progress). Please wait for active runs to finish.`,
        5
      );
    }

    // 3. Sliding 1-minute rate limits
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

    if (jobType === 'submit') {
      const submitCountRow = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM execution_jobs
        WHERE user_id = ? AND job_type = 'submit' AND created_at >= ?
      `).get(userId, oneMinuteAgo) as { count: number };

      if (submitCountRow.count >= EXECUTION_BUDGETS.SUBMIT_RATE_PER_MINUTE) {
        throw new RateLimitError(
          `Submit rate limit exceeded (maximum ${EXECUTION_BUDGETS.SUBMIT_RATE_PER_MINUTE} submissions per minute). Please wait before submitting again.`,
          60
        );
      }
    } else {
      // run_samples or run_custom
      const runCountRow = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM execution_jobs
        WHERE user_id = ? AND job_type IN ('run_samples', 'run_custom') AND created_at >= ?
      `).get(userId, oneMinuteAgo) as { count: number };

      if (runCountRow.count >= EXECUTION_BUDGETS.RUN_RATE_PER_MINUTE) {
        throw new RateLimitError(
          `Run rate limit exceeded (maximum ${EXECUTION_BUDGETS.RUN_RATE_PER_MINUTE} runs per minute). Please wait before running again.`,
          60
        );
      }
    }
  }
}

import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { RateLimitError } from 'zur-shared';

/** Hard cap on durable limiter rows (oldest evicted). */
export const MAX_DURABLE_RATE_LIMIT_ROWS = 100_000;
const DURABLE_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Lowest layer of IdentityService: the database handle plus durable rate limiting. */
export class IdentityRateLimits {
  protected db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /**
   * Drops old durable limiter rows, then enforces the hard row cap.
   * Never throws (a busy/closed DB must not kill the process from a timer).
   */
  pruneRateLimits(now: number = Date.now()): void {
    try {
      this.db.prepare('DELETE FROM auth_request_limits WHERE last_attempt_at < ?').run(now - DURABLE_RETENTION_MS);
      this.enforceDurableCap();
    } catch (error) {
      console.error('[identity] rate-limit prune failed:', error instanceof Error ? error.message : String(error));
    }
  }

  private enforceDurableCap(): void {
    const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM auth_request_limits').get() as { n: number };
    if (n > MAX_DURABLE_RATE_LIMIT_ROWS) {
      this.db.prepare(`DELETE FROM auth_request_limits WHERE key_hash IN
        (SELECT key_hash FROM auth_request_limits ORDER BY last_attempt_at ASC LIMIT ?)`)
        .run(n - MAX_DURABLE_RATE_LIMIT_ROWS + Math.ceil(MAX_DURABLE_RATE_LIMIT_ROWS / 10));
    }
  }

  private limiterHash(scope: string, key: string): string {
    return crypto.createHash('sha256').update(`${scope}:${key}`).digest('hex');
  }

  /** Throws RateLimitError when `maxFailures` failures were already recorded inside the window. Does not consume. */
  checkFailureLimit(scope: string, key: string, maxFailures: number, windowMs: number): void {
    const now = Date.now();
    const record = this.db.prepare('SELECT attempts,window_started_at FROM auth_request_limits WHERE key_hash=?')
      .get(this.limiterHash(scope, key)) as { attempts: number; window_started_at: number } | undefined;
    if (record && now - record.window_started_at < windowMs && record.attempts >= maxFailures) {
      throw new RateLimitError('Too many attempts. Please try again later.',
        Math.ceil((windowMs - (now - record.window_started_at)) / 1000));
    }
  }

  /** Records one failed attempt (opens a new window if the old one expired). */
  recordFailure(scope: string, key: string, windowMs: number): void {
    const now = Date.now();
    const keyHash = this.limiterHash(scope, key);
    const record = this.db.prepare('SELECT window_started_at FROM auth_request_limits WHERE key_hash=?')
      .get(keyHash) as { window_started_at: number } | undefined;
    if (!record || now - record.window_started_at >= windowMs) {
      this.db.prepare(`INSERT INTO auth_request_limits (key_hash,attempts,window_started_at,last_attempt_at)
        VALUES (?,1,?,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=1,
        window_started_at=excluded.window_started_at,last_attempt_at=excluded.last_attempt_at`).run(keyHash, now, now);
      if (!record) this.enforceDurableCap();
    } else {
      this.db.prepare('UPDATE auth_request_limits SET attempts=attempts+1,last_attempt_at=? WHERE key_hash=?').run(now, keyHash);
    }
  }

  /** Forgets recorded failures for a key (called after a successful authentication). */
  clearFailures(scope: string, key: string): void {
    this.db.prepare('DELETE FROM auth_request_limits WHERE key_hash=?').run(this.limiterHash(scope, key));
  }

  /** Durable admission limit shared by API processes using the same database. */
  consumeRequestRateLimit(scope: string, key: string, maxAttempts: number, windowMs: number): void {
    const now = Date.now();
    const keyHash = crypto.createHash('sha256').update(`${scope}:${key}`).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const record = this.db.prepare('SELECT attempts,window_started_at FROM auth_request_limits WHERE key_hash=?')
        .get(keyHash) as { attempts: number; window_started_at: number } | undefined;
      if (record && now - record.window_started_at < windowMs && record.attempts >= maxAttempts) {
        throw new RateLimitError('Too many attempts. Please try again later.',
          Math.ceil((windowMs - (now - record.window_started_at)) / 1000));
      }
      if (!record || now - record.window_started_at >= windowMs) {
        this.db.prepare(`INSERT INTO auth_request_limits (key_hash,attempts,window_started_at,last_attempt_at)
          VALUES (?,1,?,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=1,
          window_started_at=excluded.window_started_at,last_attempt_at=excluded.last_attempt_at`)
          .run(keyHash, now, now);
      } else {
        this.db.prepare('UPDATE auth_request_limits SET attempts=attempts+1,last_attempt_at=? WHERE key_hash=?')
          .run(now, keyHash);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}

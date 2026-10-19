interface RateBucket {
  timestamps: number[];
}

export const DEFAULT_MCP_RATE_LIMIT_PER_MINUTE = 300;
export const DEFAULT_MCP_MAX_CONCURRENCY = 10;

export function configuredRateLimitPerMinute(): number {
  return readPositiveIntEnv('MCP_RATE_LIMIT_PER_MINUTE', DEFAULT_MCP_RATE_LIMIT_PER_MINUTE);
}

export function configuredMaxConcurrency(): number {
  return readPositiveIntEnv('MCP_MAX_CONCURRENCY', DEFAULT_MCP_MAX_CONCURRENCY);
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export class McpRateLimiter {
  private tokenBuckets: Map<string, RateBucket> = new Map();
  private authorConcurrency: Map<string, number> = new Map();
  private maxPerMinute: number;
  private maxConcurrency: number;

  /**
   * Defaults (authoring sessions routinely issue hundreds of small tool calls):
   *   MCP_RATE_LIMIT_PER_MINUTE  default 300 calls / minute / token
   *   MCP_MAX_CONCURRENCY        default 10 concurrent tool executions / author
   */
  constructor(
    maxPerMinute: number = readPositiveIntEnv('MCP_RATE_LIMIT_PER_MINUTE', DEFAULT_MCP_RATE_LIMIT_PER_MINUTE),
    maxConcurrency: number = readPositiveIntEnv('MCP_MAX_CONCURRENCY', DEFAULT_MCP_MAX_CONCURRENCY)
  ) {
    this.maxPerMinute = maxPerMinute;
    this.maxConcurrency = maxConcurrency;
  }

  getMaxPerMinute(): number {
    return this.maxPerMinute;
  }

  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  checkRateLimit(tokenId: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const windowStart = now - 60_000;

    let bucket = this.tokenBuckets.get(tokenId);
    if (!bucket) {
      bucket = { timestamps: [] };
      this.tokenBuckets.set(tokenId, bucket);
    }

    bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

    if (bucket.timestamps.length >= this.maxPerMinute) {
      const oldestInWindow = bucket.timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + 60_000 - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    bucket.timestamps.push(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  acquireConcurrency(authorId: string): boolean {
    const current = this.authorConcurrency.get(authorId) || 0;
    if (current >= this.maxConcurrency) {
      return false;
    }
    this.authorConcurrency.set(authorId, current + 1);
    return true;
  }

  releaseConcurrency(authorId: string): void {
    const current = this.authorConcurrency.get(authorId) || 0;
    if (current <= 1) {
      this.authorConcurrency.delete(authorId);
    } else {
      this.authorConcurrency.set(authorId, current - 1);
    }
  }

  reset(): void {
    this.tokenBuckets.clear();
    this.authorConcurrency.clear();
  }
}

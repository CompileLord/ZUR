interface RateBucket {
  timestamps: number[];
}

export class McpRateLimiter {
  private tokenBuckets: Map<string, RateBucket> = new Map();
  private authorConcurrency: Map<string, number> = new Map();
  private maxPerMinute: number;
  private maxConcurrency: number;

  constructor(maxPerMinute: number = 60, maxConcurrency: number = 10) {
    this.maxPerMinute = maxPerMinute;
    this.maxConcurrency = maxConcurrency;
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

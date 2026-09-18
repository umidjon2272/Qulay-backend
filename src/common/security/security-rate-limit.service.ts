import { Injectable } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };
export type RateLimitDecision = { allowed: boolean; remaining: number; retryAfterSeconds: number; resetAt: number };

@Injectable()
export class SecurityRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  isAllowed(scope: string, key: string, maxAttempts: number, windowMs: number): boolean {
    return this.consume(scope, key, maxAttempts, windowMs).allowed;
  }

  consume(scope: string, key: string, maxAttempts: number, windowMs: number): RateLimitDecision {
    const now = Date.now();
    const bucketKey = `${scope}:${key}`;
    const current = this.buckets.get(bucketKey);
    if (!current || current.resetAt <= now) {
      this.buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      this.prune(now);
      return { allowed: true, remaining: Math.max(0, maxAttempts - 1), retryAfterSeconds: 0, resetAt: now + windowMs };
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    if (current.count >= maxAttempts) return { allowed: false, remaining: 0, retryAfterSeconds, resetAt: current.resetAt };
    current.count += 1;
    return { allowed: true, remaining: Math.max(0, maxAttempts - current.count), retryAfterSeconds: 0, resetAt: current.resetAt };
  }

  private prune(now: number): void {
    if (this.buckets.size <= 10000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

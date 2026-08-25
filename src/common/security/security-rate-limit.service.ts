import { Injectable } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class SecurityRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  isAllowed(scope: string, key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const bucketKey = `${scope}:${key}`;
    const current = this.buckets.get(bucketKey);
    if (!current || current.resetAt <= now) {
      this.buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      this.prune(now);
      return true;
    }
    if (current.count >= maxAttempts) return false;
    current.count += 1;
    return true;
  }

  private prune(now: number): void {
    if (this.buckets.size <= 10000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

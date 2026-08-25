import { Injectable } from '@nestjs/common';

type FailureBucket = { failures: number; firstFailureAt: number; lockedUntil: number };

@Injectable()
export class LoginBruteForceService {
  private readonly maxFailures = 5;
  private readonly failureWindowMs = 10 * 60 * 1000;
  private readonly lockMs = 15 * 60 * 1000;
  private readonly buckets = new Map<string, FailureBucket>();

  isBlocked(ip: string, normalizedEmail: string): boolean {
    const now = Date.now();
    return [this.key('ip', ip), this.key('email', normalizedEmail)].some((key) => {
      const bucket = this.buckets.get(key);
      if (!bucket) return false;
      if (bucket.lockedUntil > now) return true;
      if (bucket.firstFailureAt + this.failureWindowMs <= now) this.buckets.delete(key);
      return false;
    });
  }

  recordFailure(ip: string, normalizedEmail: string): boolean {
    const now = Date.now();
    const keys = [this.key('ip', ip), this.key('email', normalizedEmail)];
    let blocked = false;
    for (const key of keys) {
      const current = this.buckets.get(key);
      const bucket = !current || current.firstFailureAt + this.failureWindowMs <= now
        ? { failures: 0, firstFailureAt: now, lockedUntil: 0 }
        : current;
      bucket.failures += 1;
      if (bucket.failures >= this.maxFailures) {
        bucket.lockedUntil = now + this.lockMs;
        blocked = true;
      }
      this.buckets.set(key, bucket);
    }
    return blocked;
  }

  recordSuccess(ip: string, normalizedEmail: string): void {
    this.buckets.delete(this.key('ip', ip));
    this.buckets.delete(this.key('email', normalizedEmail));
  }

  private key(type: string, value: string): string { return `${type}:${value || 'unknown'}`; }
}

import { Injectable } from '@nestjs/common';
import { SECURITY_LIMITS } from '../../common/security/security-limits.constants';

type Bucket = { count: number; resetAt: number };

/** Small in-memory foundation. Replace with a shared store/rate-limit guard in production. */
@Injectable()
export class PasswordResetRateLimiterService {
  private readonly windowMs = SECURITY_LIMITS.passwordReset.windowMs;
  private readonly maxAttempts = SECURITY_LIMITS.passwordReset.max;
  private readonly buckets = new Map<string, Bucket>();

  isAllowed(ip: string, normalizedEmail: string): boolean {
    return this.consume(`ip:${ip || 'unknown'}`, this.maxAttempts)
      && this.consume(`email:${normalizedEmail}`, this.maxAttempts);
  }

  isResetAllowed(ip: string, tokenFingerprint: string): boolean {
    return this.consume(`reset-ip:${ip || 'unknown'}`, SECURITY_LIMITS.passwordResetIpToken.max)
      && this.consume(`reset-token:${tokenFingerprint}`, SECURITY_LIMITS.passwordResetToken.max);
  }

  private consume(key: string, maxAttempts: number): boolean {
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
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

export declare class PasswordResetRateLimiterService {
    private readonly windowMs;
    private readonly maxAttempts;
    private readonly buckets;
    isAllowed(ip: string, normalizedEmail: string): boolean;
    isResetAllowed(ip: string, tokenFingerprint: string): boolean;
    private consume;
    private prune;
}

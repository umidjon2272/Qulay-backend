export declare class SecurityRateLimitService {
    private readonly buckets;
    isAllowed(scope: string, key: string, maxAttempts: number, windowMs: number): boolean;
    private prune;
}

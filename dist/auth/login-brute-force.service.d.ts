export declare class LoginBruteForceService {
    private readonly maxFailures;
    private readonly failureWindowMs;
    private readonly lockMs;
    private readonly buckets;
    isBlocked(ip: string, normalizedEmail: string): boolean;
    recordFailure(ip: string, normalizedEmail: string): boolean;
    recordSuccess(ip: string, normalizedEmail: string): void;
    private key;
}

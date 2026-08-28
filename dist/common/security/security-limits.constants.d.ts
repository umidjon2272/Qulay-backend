export declare const SECURITY_LIMITS: {
    readonly globalPerIp: {
        readonly max: 240;
        readonly windowMs: number;
    };
    readonly loginPerIp: {
        readonly max: 30;
        readonly windowMs: number;
    };
    readonly loginPerEmail: {
        readonly max: 15;
        readonly windowMs: number;
    };
    readonly registerPerIp: {
        readonly max: 10;
        readonly windowMs: number;
    };
    readonly registerPerEmail: {
        readonly max: 3;
        readonly windowMs: number;
    };
    readonly passwordReset: {
        readonly max: 5;
        readonly windowMs: number;
    };
    readonly passwordResetToken: {
        readonly max: 5;
        readonly windowMs: number;
    };
    readonly passwordResetIpToken: {
        readonly max: 20;
        readonly windowMs: number;
    };
    readonly loginBruteForce: {
        readonly maxFailures: 5;
        readonly failureWindowMs: number;
        readonly lockMs: number;
    };
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECURITY_LIMITS = void 0;
exports.SECURITY_LIMITS = {
    globalPerIp: { max: 240, windowMs: 60 * 1000 },
    loginPerIp: { max: 30, windowMs: 15 * 60 * 1000 },
    loginPerEmail: { max: 15, windowMs: 15 * 60 * 1000 },
    registerPerIp: { max: 10, windowMs: 10 * 60 * 1000 },
    registerPerEmail: { max: 3, windowMs: 60 * 60 * 1000 },
    passwordReset: { max: 5, windowMs: 15 * 60 * 1000 },
    passwordResetToken: { max: 5, windowMs: 15 * 60 * 1000 },
    passwordResetIpToken: { max: 20, windowMs: 15 * 60 * 1000 },
    loginBruteForce: { maxFailures: 5, failureWindowMs: 10 * 60 * 1000, lockMs: 15 * 60 * 1000 },
};
//# sourceMappingURL=security-limits.constants.js.map
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginBruteForceService = void 0;
const common_1 = require("@nestjs/common");
const security_limits_constants_1 = require("../common/security/security-limits.constants");
let LoginBruteForceService = class LoginBruteForceService {
    constructor() {
        this.maxFailures = security_limits_constants_1.SECURITY_LIMITS.loginBruteForce.maxFailures;
        this.failureWindowMs = security_limits_constants_1.SECURITY_LIMITS.loginBruteForce.failureWindowMs;
        this.lockMs = security_limits_constants_1.SECURITY_LIMITS.loginBruteForce.lockMs;
        this.buckets = new Map();
    }
    isBlocked(ip, normalizedEmail) {
        const now = Date.now();
        return [this.key('ip', ip), this.key('email', normalizedEmail)].some((key) => {
            const bucket = this.buckets.get(key);
            if (!bucket)
                return false;
            if (bucket.lockedUntil > now)
                return true;
            if (bucket.firstFailureAt + this.failureWindowMs <= now)
                this.buckets.delete(key);
            return false;
        });
    }
    recordFailure(ip, normalizedEmail) {
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
    recordSuccess(ip, normalizedEmail) {
        this.buckets.delete(this.key('ip', ip));
        this.buckets.delete(this.key('email', normalizedEmail));
    }
    key(type, value) { return `${type}:${value || 'unknown'}`; }
};
exports.LoginBruteForceService = LoginBruteForceService;
exports.LoginBruteForceService = LoginBruteForceService = __decorate([
    (0, common_1.Injectable)()
], LoginBruteForceService);
//# sourceMappingURL=login-brute-force.service.js.map
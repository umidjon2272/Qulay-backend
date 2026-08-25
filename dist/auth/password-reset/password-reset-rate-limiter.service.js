"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetRateLimiterService = void 0;
const common_1 = require("@nestjs/common");
let PasswordResetRateLimiterService = class PasswordResetRateLimiterService {
    constructor() {
        this.windowMs = 15 * 60 * 1000;
        this.maxAttempts = 5;
        this.buckets = new Map();
    }
    isAllowed(ip, normalizedEmail) {
        return this.consume(`ip:${ip || 'unknown'}`, this.maxAttempts)
            && this.consume(`email:${normalizedEmail}`, this.maxAttempts);
    }
    isResetAllowed(ip, tokenFingerprint) {
        return this.consume(`reset-ip:${ip || 'unknown'}`, 20)
            && this.consume(`reset-token:${tokenFingerprint}`, this.maxAttempts);
    }
    consume(key, maxAttempts) {
        const now = Date.now();
        const current = this.buckets.get(key);
        if (!current || current.resetAt <= now) {
            this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
            this.prune(now);
            return true;
        }
        if (current.count >= maxAttempts)
            return false;
        current.count += 1;
        return true;
    }
    prune(now) {
        if (this.buckets.size <= 10000)
            return;
        for (const [key, bucket] of this.buckets) {
            if (bucket.resetAt <= now)
                this.buckets.delete(key);
        }
    }
};
exports.PasswordResetRateLimiterService = PasswordResetRateLimiterService;
exports.PasswordResetRateLimiterService = PasswordResetRateLimiterService = __decorate([
    (0, common_1.Injectable)()
], PasswordResetRateLimiterService);
//# sourceMappingURL=password-reset-rate-limiter.service.js.map
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityRateLimitService = void 0;
const common_1 = require("@nestjs/common");
let SecurityRateLimitService = class SecurityRateLimitService {
    constructor() {
        this.buckets = new Map();
    }
    isAllowed(scope, key, maxAttempts, windowMs) {
        const now = Date.now();
        const bucketKey = `${scope}:${key}`;
        const current = this.buckets.get(bucketKey);
        if (!current || current.resetAt <= now) {
            this.buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
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
exports.SecurityRateLimitService = SecurityRateLimitService;
exports.SecurityRateLimitService = SecurityRateLimitService = __decorate([
    (0, common_1.Injectable)()
], SecurityRateLimitService);
//# sourceMappingURL=security-rate-limit.service.js.map
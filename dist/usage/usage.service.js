"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiUsageService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const date_utils_1 = require("../common/date.utils");
const prisma_service_1 = require("../prisma/prisma.service");
let AiUsageService = class AiUsageService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    logTextUsage(input) {
        return this.createUsage({ ...input, type: client_1.UsageType.TEXT });
    }
    logVoiceUsage(input) {
        return this.createUsage({ ...input, type: client_1.UsageType.VOICE });
    }
    logToolUsage(input) {
        return this.createUsage({ ...input, type: client_1.UsageType.TOOL });
    }
    logFileUsage(input) {
        return this.createUsage({ ...input, type: client_1.UsageType.FILE });
    }
    async getForUser(userId) {
        const { start, end } = (0, date_utils_1.monthRangeUtc)();
        const groups = await this.prisma.aiUsage.groupBy({
            by: ['type'],
            where: { userId, createdAt: { gte: start, lt: end } },
            _count: { _all: true },
            _sum: {
                inputTokens: true,
                outputTokens: true,
                audioSeconds: true,
                estimatedCost: true,
            },
        });
        const text = groups.find(({ type }) => type === client_1.UsageType.TEXT);
        const voice = groups.find(({ type }) => type === client_1.UsageType.VOICE);
        const tool = groups.find(({ type }) => type === client_1.UsageType.TOOL);
        const sum = (field) => groups.reduce((total, group) => total + (group._sum[field] ?? 0), 0);
        return {
            month: start.toISOString().slice(0, 7),
            textUsage: {
                requests: text?._count._all ?? 0,
                inputTokens: text?._sum.inputTokens ?? 0,
                outputTokens: text?._sum.outputTokens ?? 0,
                totalTokens: (text?._sum.inputTokens ?? 0) + (text?._sum.outputTokens ?? 0),
            },
            voiceUsage: {
                requests: voice?._count._all ?? 0,
                audioSeconds: voice?._sum.audioSeconds ?? 0,
            },
            toolActions: tool?._count._all ?? 0,
            estimatedCost: sum('estimatedCost'),
        };
    }
    createUsage(input) {
        return this.prisma.aiUsage.create({
            data: {
                userId: input.userId,
                type: input.type,
                model: input.model,
                inputTokens: input.inputTokens ?? 0,
                outputTokens: input.outputTokens ?? 0,
                audioSeconds: input.audioSeconds ?? 0,
                estimatedCost: input.estimatedCost ?? 0,
            },
        });
    }
};
exports.AiUsageService = AiUsageService;
exports.AiUsageService = AiUsageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AiUsageService);
//# sourceMappingURL=usage.service.js.map
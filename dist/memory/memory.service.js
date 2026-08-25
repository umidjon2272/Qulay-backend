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
exports.MemoryService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const prisma_service_1 = require("../prisma/prisma.service");
let MemoryService = class MemoryService {
    constructor(prisma, activityLog) {
        this.prisma = prisma;
        this.activityLog = activityLog;
    }
    async listForUser(userId, query) {
        const where = this.buildWhere(userId, query.search, {
            type: query.type,
            contactId: query.contactId,
            importance: query.importance,
            key: query.key,
        });
        const [items, total] = await Promise.all([
            this.prisma.userMemory.findMany({
                where,
                include: { contact: true },
                orderBy: [{ importance: 'desc' }, { lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.userMemory.count({ where }),
        ]);
        return { items, meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async createForUser(userId, dto) {
        await this.assertContactOwnership(userId, dto.contactId);
        try {
            const memory = await this.prisma.userMemory.create({
                data: {
                    userId,
                    type: dto.type ?? client_1.MemoryType.CONTEXT,
                    key: dto.key,
                    value: dto.value,
                    importance: dto.importance ?? 5,
                    source: dto.source?.trim() || 'MANUAL',
                    contactId: dto.contactId,
                },
                include: { contact: true },
            });
            await this.activityLog.record({
                userId,
                action: activity_log_service_1.ACTIVITY_ACTIONS.MEMORY_CREATED,
                entityType: 'MEMORY',
                entityId: memory.id,
            });
            return memory;
        }
        catch (error) {
            this.throwDuplicateMemory(error);
            throw error;
        }
    }
    async updateForUser(userId, id, dto) {
        await this.getForUser(userId, id);
        await this.assertContactOwnership(userId, dto.contactId);
        try {
            const memory = await this.prisma.userMemory.update({
                where: { id },
                data: {
                    key: dto.key,
                    value: dto.value,
                    type: dto.type,
                    importance: dto.importance,
                    source: dto.source?.trim(),
                    contactId: dto.contactId,
                },
                include: { contact: true },
            });
            await this.activityLog.record({
                userId,
                action: activity_log_service_1.ACTIVITY_ACTIONS.MEMORY_UPDATED,
                entityType: 'MEMORY',
                entityId: memory.id,
            });
            return memory;
        }
        catch (error) {
            this.throwDuplicateMemory(error);
            throw error;
        }
    }
    async deleteForUser(userId, id) {
        await this.getForUser(userId, id);
        await this.prisma.userMemory.delete({ where: { id } });
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.MEMORY_DELETED,
            entityType: 'MEMORY',
            entityId: id,
        });
        return { message: 'Memory deleted successfully' };
    }
    async getRelevantMemories(userId, query, options = {}) {
        const normalizedQuery = query.trim();
        const memories = await this.prisma.userMemory.findMany({
            where: this.buildWhere(userId, normalizedQuery, options),
            include: { contact: true },
            orderBy: [{ importance: 'desc' }, { lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
            take: options.limit ?? 20,
        });
        const queryTokens = normalizedQuery.toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const ranked = memories
            .map((memory) => {
            const searchable = (memory.key + ' ' + memory.value).toLocaleLowerCase();
            const tokenMatches = queryTokens.filter((token) => searchable.includes(token)).length;
            const exactKey = normalizedQuery && memory.key.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase() ? 20 : 0;
            const recency = memory.lastUsedAt ? 2 : 0;
            return { memory, score: exactKey + tokenMatches * 5 + memory.importance + recency };
        })
            .sort((left, right) => right.score - left.score)
            .map(({ memory }) => memory);
        if (ranked.length > 0) {
            await this.prisma.userMemory.updateMany({
                where: { userId, id: { in: ranked.map((memory) => memory.id) } },
                data: { lastUsedAt: new Date() },
            });
        }
        return ranked;
    }
    buildWhere(userId, search, options = {}) {
        const normalizedSearch = search?.trim();
        return {
            userId,
            type: options.type,
            contactId: options.contactId,
            importance: options.importance,
            ...(options.key ? { key: { contains: options.key.trim(), mode: 'insensitive' } } : {}),
            ...(normalizedSearch
                ? {
                    OR: [
                        { key: { contains: normalizedSearch, mode: 'insensitive' } },
                        { value: { contains: normalizedSearch, mode: 'insensitive' } },
                    ],
                }
                : {}),
        };
    }
    async assertContactOwnership(userId, contactId) {
        if (!contactId) {
            return;
        }
        const contact = await this.prisma.contact.findFirst({ where: { id: contactId, userId } });
        if (!contact) {
            throw new common_1.NotFoundException('Contact was not found');
        }
    }
    async getForUser(userId, id) {
        const memory = await this.prisma.userMemory.findFirst({ where: { id, userId } });
        if (!memory) {
            throw new common_1.NotFoundException('Memory was not found');
        }
        return memory;
    }
    throwDuplicateMemory(error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new common_1.ConflictException('A memory with this key already exists');
        }
    }
};
exports.MemoryService = MemoryService;
exports.MemoryService = MemoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_log_service_1.ActivityLogService])
], MemoryService);
//# sourceMappingURL=memory.service.js.map
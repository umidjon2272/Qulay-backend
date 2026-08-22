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
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const prisma_service_1 = require("../prisma/prisma.service");
let MemoryService = class MemoryService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listForUser(userId, query) {
        const where = {
            userId,
            category: query.category,
            ...(query.key ? { key: { contains: query.key.trim(), mode: 'insensitive' } } : {}),
            ...(query.search
                ? {
                    OR: [
                        { key: { contains: query.search.trim(), mode: 'insensitive' } },
                        { value: { contains: query.search.trim(), mode: 'insensitive' } },
                    ],
                }
                : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.userMemory.findMany({
                where,
                orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.userMemory.count({ where }),
        ]);
        return { items, meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async createForUser(userId, dto) {
        try {
            return await this.prisma.userMemory.create({
                data: {
                    userId,
                    key: dto.key,
                    value: dto.value,
                    category: dto.category ?? client_1.MemoryCategory.OTHER,
                    importance: dto.importance ?? 5,
                },
            });
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('A memory with this key already exists');
            }
            throw error;
        }
    }
    async updateForUser(userId, id, dto) {
        await this.getForUser(userId, id);
        try {
            return await this.prisma.userMemory.update({
                where: { id },
                data: {
                    key: dto.key,
                    value: dto.value,
                    category: dto.category,
                    importance: dto.importance,
                },
            });
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('A memory with this key already exists');
            }
            throw error;
        }
    }
    async deleteForUser(userId, id) {
        await this.getForUser(userId, id);
        await this.prisma.userMemory.delete({ where: { id } });
        return { message: 'Memory deleted successfully' };
    }
    async getForUser(userId, id) {
        const memory = await this.prisma.userMemory.findFirst({ where: { id, userId } });
        if (!memory) {
            throw new common_1.NotFoundException('Memory was not found');
        }
        return memory;
    }
};
exports.MemoryService = MemoryService;
exports.MemoryService = MemoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MemoryService);
//# sourceMappingURL=memory.service.js.map
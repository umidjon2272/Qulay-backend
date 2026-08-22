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
exports.ConversationsService = void 0;
const common_1 = require("@nestjs/common");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const prisma_service_1 = require("../prisma/prisma.service");
let ConversationsService = class ConversationsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listForUser(userId, query) {
        const where = {
            userId,
            ...(query.search
                ? { title: { contains: query.search.trim(), mode: 'insensitive' } }
                : {}),
        };
        const [rows, total] = await Promise.all([
            this.prisma.conversation.findMany({
                where,
                include: { _count: { select: { messages: true } } },
                orderBy: { updatedAt: 'desc' },
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.conversation.count({ where }),
        ]);
        const items = rows.map(({ _count, ...conversation }) => ({
            ...conversation,
            messageCount: _count.messages,
        }));
        return { items, meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async getForUser(userId, id) {
        const conversation = await this.prisma.conversation.findFirst({
            where: { id, userId },
            include: { _count: { select: { messages: true } } },
        });
        if (!conversation) {
            throw new common_1.NotFoundException('Conversation was not found');
        }
        const { _count, ...data } = conversation;
        return { ...data, messageCount: _count.messages };
    }
    async createForUser(userId, dto) {
        return this.prisma.conversation.create({
            data: { userId, title: dto.title ?? 'New conversation' },
        });
    }
    async deleteForUser(userId, id) {
        await this.getForUser(userId, id);
        await this.prisma.conversation.delete({ where: { id } });
        return { message: 'Conversation deleted successfully' };
    }
};
exports.ConversationsService = ConversationsService;
exports.ConversationsService = ConversationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ConversationsService);
//# sourceMappingURL=conversations.service.js.map
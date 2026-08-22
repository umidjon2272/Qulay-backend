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
exports.MessagesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const prisma_service_1 = require("../prisma/prisma.service");
let MessagesService = class MessagesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listForConversation(userId, conversationId, query) {
        await this.getConversationForUser(userId, conversationId);
        const where = { conversationId };
        const [items, total] = await Promise.all([
            this.prisma.message.findMany({
                where,
                orderBy: { createdAt: 'asc' },
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.message.count({ where }),
        ]);
        return { items, meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async createForConversation(userId, conversationId, dto) {
        await this.getConversationForUser(userId, conversationId);
        return this.prisma.$transaction(async (transaction) => {
            const message = await transaction.message.create({
                data: {
                    conversationId,
                    role: dto.role ?? client_1.MessageRole.USER,
                    content: dto.content,
                },
            });
            await transaction.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
            });
            return message;
        });
    }
    async getConversationForUser(userId, id) {
        const conversation = await this.prisma.conversation.findFirst({ where: { id, userId } });
        if (!conversation) {
            throw new common_1.NotFoundException('Conversation was not found');
        }
        return conversation;
    }
};
exports.MessagesService = MessagesService;
exports.MessagesService = MessagesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MessagesService);
//# sourceMappingURL=messages.service.js.map
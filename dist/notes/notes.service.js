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
exports.NotesService = void 0;
const common_1 = require("@nestjs/common");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const prisma_service_1 = require("../prisma/prisma.service");
let NotesService = class NotesService {
    constructor(prisma, activityLog) {
        this.prisma = prisma;
        this.activityLog = activityLog;
    }
    async listForUser(userId, query) {
        const where = {
            userId,
            ...(query.search
                ? {
                    OR: [
                        { title: { contains: query.search.trim(), mode: 'insensitive' } },
                        { content: { contains: query.search.trim(), mode: 'insensitive' } },
                    ],
                }
                : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.note.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.note.count({ where }),
        ]);
        return { items, meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async getForUser(userId, id) {
        const note = await this.prisma.note.findFirst({ where: { id, userId } });
        if (!note) {
            throw new common_1.NotFoundException('Note was not found');
        }
        return note;
    }
    async createForUser(userId, dto) {
        await this.assertContactOwnership(userId, dto.contactId);
        const note = await this.prisma.note.create({
            data: {
                userId,
                title: dto.title,
                content: dto.content,
                contactId: dto.contactId,
            },
        });
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.NOTE_CREATED,
            entityType: 'NOTE',
            entityId: note.id,
        });
        return note;
    }
    async updateForUser(userId, id, dto) {
        const current = await this.getForUser(userId, id);
        await this.assertContactOwnership(userId, dto.contactId);
        return this.prisma.note.update({
            where: { id: current.id },
            data: { title: dto.title, content: dto.content, contactId: dto.contactId },
        });
    }
    async deleteForUser(userId, id) {
        await this.getForUser(userId, id);
        await this.prisma.note.delete({ where: { id } });
        return { message: 'Note deleted successfully' };
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
};
exports.NotesService = NotesService;
exports.NotesService = NotesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_log_service_1.ActivityLogService])
], NotesService);
//# sourceMappingURL=notes.service.js.map
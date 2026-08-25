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
exports.ContactsService = void 0;
const common_1 = require("@nestjs/common");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const prisma_service_1 = require("../prisma/prisma.service");
let ContactsService = class ContactsService {
    constructor(prisma, activityLog) {
        this.prisma = prisma;
        this.activityLog = activityLog;
    }
    async listForUser(userId, query) {
        const search = query.search?.trim();
        const where = {
            userId,
            ...(query.tag?.trim() ? { tags: { has: query.tag.trim() } } : {}),
            ...(search
                ? {
                    OR: [
                        { firstName: { contains: search, mode: 'insensitive' } },
                        { lastName: { contains: search, mode: 'insensitive' } },
                        { displayName: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { telegramUsername: { contains: search, mode: 'insensitive' } },
                        { company: { contains: search, mode: 'insensitive' } },
                        { position: { contains: search, mode: 'insensitive' } },
                    ],
                }
                : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.contact.findMany({
                where,
                orderBy: [{ displayName: 'asc' }, { createdAt: 'desc' }],
                skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit),
                take: query.limit,
            }),
            this.prisma.contact.count({ where }),
        ]);
        return { items, meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async getForUser(userId, id) {
        const contact = await this.prisma.contact.findFirst({ where: { id, userId } });
        if (!contact) {
            throw new common_1.NotFoundException('Contact was not found');
        }
        return contact;
    }
    async createForUser(userId, dto) {
        const contact = await this.prisma.contact.create({
            data: {
                userId,
                firstName: dto.firstName,
                lastName: dto.lastName,
                displayName: dto.displayName ?? [dto.firstName, dto.lastName].filter(Boolean).join(' '),
                phone: dto.phone,
                email: dto.email,
                telegramUsername: dto.telegramUsername,
                company: dto.company,
                position: dto.position,
                notes: dto.notes,
                tags: this.normalizeTags(dto.tags),
            },
        });
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.CONTACT_CREATED,
            entityType: 'CONTACT',
            entityId: contact.id,
        });
        return contact;
    }
    async updateForUser(userId, id, dto) {
        const current = await this.getForUser(userId, id);
        const contact = await this.prisma.contact.update({
            where: { id: current.id },
            data: {
                firstName: dto.firstName,
                lastName: dto.lastName,
                displayName: dto.displayName,
                phone: dto.phone,
                email: dto.email,
                telegramUsername: dto.telegramUsername,
                company: dto.company,
                position: dto.position,
                notes: dto.notes,
                tags: dto.tags === undefined ? undefined : this.normalizeTags(dto.tags),
            },
        });
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.CONTACT_UPDATED,
            entityType: 'CONTACT',
            entityId: contact.id,
        });
        return contact;
    }
    async deleteForUser(userId, id) {
        const contact = await this.getForUser(userId, id);
        await this.prisma.contact.delete({ where: { id: contact.id } });
        await this.activityLog.record({
            userId,
            action: activity_log_service_1.ACTIVITY_ACTIONS.CONTACT_DELETED,
            entityType: 'CONTACT',
            entityId: contact.id,
        });
        return { message: 'Contact deleted successfully' };
    }
    normalizeTags(tags) {
        return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
    }
};
exports.ContactsService = ContactsService;
exports.ContactsService = ContactsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_log_service_1.ActivityLogService])
], ContactsService);
//# sourceMappingURL=contacts.service.js.map
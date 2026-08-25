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
exports.ContactHistoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ContactHistoryService = class ContactHistoryService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getContactHistory(userId, contactId) {
        const contact = await this.prisma.contact.findFirst({
            where: { id: contactId, userId },
        });
        if (!contact) {
            throw new common_1.NotFoundException('Contact was not found');
        }
        const [meetings, notes, memories] = await Promise.all([
            this.prisma.meeting.findMany({
                where: { userId, contactId },
                orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
                take: 20,
            }),
            this.prisma.note.findMany({
                where: { userId, contactId },
                orderBy: { updatedAt: 'desc' },
                take: 20,
            }),
            this.prisma.userMemory.findMany({
                where: { userId, contactId },
                orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
                take: 20,
            }),
        ]);
        return {
            contact,
            recentMeetings: meetings,
            relatedNotes: notes,
            relatedMemories: memories,
            tasks: [],
        };
    }
};
exports.ContactHistoryService = ContactHistoryService;
exports.ContactHistoryService = ContactHistoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ContactHistoryService);
//# sourceMappingURL=contact-history.service.js.map
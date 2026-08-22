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
exports.TodayService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const date_utils_1 = require("../common/date.utils");
const prisma_service_1 = require("../prisma/prisma.service");
let TodayService = class TodayService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getForUser(userId, date) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { timezone: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('User was not found');
        }
        const now = new Date();
        const dateKey = date ?? (0, date_utils_1.dateKeyInTimezone)(now, user.timezone);
        const { start, end } = (0, date_utils_1.zonedDayRange)(dateKey, user.timezone);
        const taskTodayWhere = {
            userId,
            dueDate: { gte: start, lt: end },
        };
        const reminderTodayWhere = {
            userId,
            remindAt: { gte: start, lt: end },
        };
        const meetingTodayWhere = {
            userId,
            startsAt: { gte: start, lt: end },
        };
        const [tasks, reminders, meetings, overdueTasks, nextMeeting] = await Promise.all([
            this.prisma.task.findMany({
                where: taskTodayWhere,
                orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
            }),
            this.prisma.reminder.findMany({
                where: reminderTodayWhere,
                orderBy: [{ remindAt: 'asc' }, { createdAt: 'asc' }],
            }),
            this.prisma.meeting.findMany({
                where: meetingTodayWhere,
                orderBy: { startsAt: 'asc' },
            }),
            this.prisma.task.findMany({
                where: {
                    userId,
                    status: { not: client_1.TaskStatus.COMPLETED },
                    dueDate: { lt: now },
                },
                orderBy: { dueDate: 'asc' },
            }),
            this.prisma.meeting.findFirst({
                where: {
                    userId,
                    status: client_1.MeetingStatus.SCHEDULED,
                    startsAt: { gte: now },
                },
                orderBy: { startsAt: 'asc' },
            }),
        ]);
        return {
            date: dateKey,
            timezone: user.timezone,
            tasks,
            reminders,
            meetings,
            overdueTasks,
            nextMeeting,
        };
    }
};
exports.TodayService = TodayService;
exports.TodayService = TodayService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TodayService);
//# sourceMappingURL=today.service.js.map
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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const pagination_query_dto_1 = require("../common/dto/pagination-query.dto");
const notification_worker_service_1 = require("../notifications/notification-worker.service");
const security_limits_constants_1 = require("../common/security/security-limits.constants");
const prisma_service_1 = require("../prisma/prisma.service");
let AdminService = class AdminService {
    constructor(prisma, activityLog, config, worker) {
        this.prisma = prisma;
        this.activityLog = activityLog;
        this.config = config;
        this.worker = worker;
    }
    async getOverview(range = 30) {
        const now = new Date();
        const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const rangeStart = this.daysAgo(range);
        const [users, activeUsers, registeredToday, registeredThisMonth, blockedUsers, aiUsage, files, notifications, telegram, google, activeReminders, upcomingMeetings, activityOverview, growth, activityTrend] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.user.count({ where: { status: client_1.UserStatus.ACTIVE } }),
            this.prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
            this.prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
            this.prisma.user.count({ where: { status: client_1.UserStatus.BLOCKED } }),
            this.prisma.aiUsage.count(),
            this.prisma.userFile.count({ where: { status: { not: client_1.FileStatus.DELETED } } }),
            this.prisma.notification.count(),
            this.prisma.telegramConnection.count({ where: { status: client_1.TelegramConnectionStatus.CONNECTED } }),
            this.prisma.googleConnection.count({ where: { status: client_1.GoogleConnectionStatus.CONNECTED } }),
            this.prisma.reminder.count({ where: { status: 'ACTIVE' } }),
            this.prisma.meeting.count({ where: { status: 'SCHEDULED', startsAt: { gte: now } } }),
            this.getActivityOverview(rangeStart, now),
            this.getTrend('User', rangeStart, now),
            this.getActivityTrend(rangeStart, now),
        ]);
        return {
            range,
            generatedAt: now.toISOString(),
            kpis: { users, activeUsers, registeredToday, registeredThisMonth, blockedUsers, aiUsageRequests: aiUsage, files, notifications, telegramConnectedUsers: telegram, googleConnectedUsers: google, activeReminders, upcomingMeetings },
            activityOverview,
            userGrowth: growth,
            activityTrend,
        };
    }
    async listUsers(query) {
        const search = query.search?.trim();
        const where = { role: query.role, status: query.status, ...(search ? { OR: [
                    { email: { contains: search, mode: 'insensitive' } },
                    { firstName: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                ] } : {}) };
        const orderBy = query.sort === 'lastActivity' ? { activityLogs: { _count: query.order } } : { createdAt: query.order };
        const [rows, total] = await Promise.all([
            this.prisma.user.findMany({ where, orderBy, skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit), take: query.limit, select: {
                    id: true, email: true, firstName: true, lastName: true, avatarUrl: true, role: true, status: true, createdAt: true,
                    refreshTokens: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 },
                    activityLogs: { orderBy: { createdAt: 'desc' }, select: { createdAt: true }, take: 1 },
                    telegramConnection: { select: { status: true } }, googleConnection: { select: { status: true } },
                } }),
            this.prisma.user.count({ where }),
        ]);
        return { items: rows.map((row) => ({ ...row, lastActivity: row.activityLogs[0]?.createdAt ?? null, activeSession: row.refreshTokens.length > 0, integrations: { telegram: row.telegramConnection?.status === client_1.TelegramConnectionStatus.CONNECTED, google: row.googleConnection?.status === client_1.GoogleConnectionStatus.CONNECTED }, activityLogs: undefined, refreshTokens: undefined })), meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async getUser(id) {
        const user = await this.prisma.user.findUnique({ where: { id }, select: {
                id: true, email: true, firstName: true, lastName: true, avatarUrl: true, role: true, status: true, createdAt: true, updatedAt: true,
                telegramConnection: { select: { status: true, connectedAt: true } }, googleConnection: { select: { status: true, connectedAt: true } },
                activityLogs: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, action: true, entityType: true, entityId: true, createdAt: true } },
            } });
        if (!user)
            throw new common_1.NotFoundException('User was not found');
        const now = new Date();
        const [tasks, reminders, meetings, notes, contacts, finance, files, aiUsage, sessions, resetRequests] = await Promise.all([
            this.prisma.task.count({ where: { userId: id } }), this.prisma.reminder.count({ where: { userId: id } }), this.prisma.meeting.count({ where: { userId: id } }), this.prisma.note.count({ where: { userId: id } }), this.prisma.contact.count({ where: { userId: id } }), this.prisma.financeTransaction.count({ where: { userId: id } }), this.prisma.userFile.count({ where: { userId: id, status: { not: client_1.FileStatus.DELETED } } }), this.prisma.aiUsage.count({ where: { userId: id } }), this.prisma.refreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: now } } }), this.prisma.passwordResetToken.count({ where: { userId: id } }),
        ]);
        return { ...user, lastActivity: user.activityLogs[0]?.createdAt ?? null, activity: user.activityLogs, usage: { tasks, reminders, meetings, notes, contacts, financeTransactions: finance, files, aiRequests: aiUsage }, security: { activeRefreshSessions: sessions, passwordResetRequests: resetRequests }, integrations: { telegram: { connected: user.telegramConnection?.status === client_1.TelegramConnectionStatus.CONNECTED, status: user.telegramConnection?.status ?? client_1.TelegramConnectionStatus.DISCONNECTED }, google: { connected: user.googleConnection?.status === client_1.GoogleConnectionStatus.CONNECTED, status: user.googleConnection?.status ?? client_1.GoogleConnectionStatus.DISCONNECTED } }, telegramConnection: undefined, googleConnection: undefined, activityLogs: undefined };
    }
    async updateUserStatus(actorId, userId, status) {
        if (actorId === userId && status === client_1.UserStatus.BLOCKED)
            throw new common_1.ForbiddenException('An admin cannot block their own account');
        const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
        if (!target)
            throw new common_1.NotFoundException('User was not found');
        const updated = await this.prisma.$transaction(async (tx) => {
            const next = await tx.user.update({ where: { id: userId }, data: { status }, select: { id: true, status: true } });
            if (status === client_1.UserStatus.BLOCKED)
                await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
            return next;
        });
        await this.activityLog.record({ userId: actorId, action: status === client_1.UserStatus.BLOCKED ? 'ADMIN_USER_BLOCKED' : 'ADMIN_USER_UNBLOCKED', entityType: 'USER', entityId: userId, metadata: { targetUserId: userId, status } });
        return updated;
    }
    async updateUserRole(actorId, userId, role) {
        if (actorId === userId)
            throw new common_1.ForbiddenException('An admin cannot change their own role');
        const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
        if (!target)
            throw new common_1.NotFoundException('User was not found');
        if (target.role === client_1.UserRole.ADMIN && role === client_1.UserRole.USER) {
            const admins = await this.prisma.user.count({ where: { role: client_1.UserRole.ADMIN } });
            if (admins <= 1)
                throw new common_1.ForbiddenException('The last active admin cannot be demoted');
        }
        const updated = await this.prisma.user.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } });
        await this.activityLog.record({ userId: actorId, action: 'ADMIN_ROLE_CHANGED', entityType: 'USER', entityId: userId, metadata: { targetUserId: userId, role } });
        return updated;
    }
    async getUsage(range = 30) {
        const end = new Date();
        const start = this.daysAgo(range);
        const [byType, byUser, trend, tools] = await Promise.all([
            this.prisma.aiUsage.groupBy({ by: ['type'], where: { createdAt: { gte: start, lt: end } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, audioSeconds: true, estimatedCost: true } }),
            this.prisma.aiUsage.groupBy({ by: ['userId'], where: { createdAt: { gte: start, lt: end } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, estimatedCost: true }, orderBy: { _count: { userId: 'desc' } }, take: 10 }),
            this.getUsageTrend(start, end),
            this.getToolUsage(start, end),
        ]);
        const ids = byUser.map((row) => row.userId);
        const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, firstName: true, lastName: true } });
        const byId = new Map(users.map((user) => [user.id, user]));
        const sum = (field) => byType.reduce((total, row) => total + Number(row._sum[field] ?? 0), 0);
        return { range, provider: { status: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured' }, totals: { requests: byType.reduce((total, row) => total + row._count._all, 0), text: this.typeSummary(byType, client_1.UsageType.TEXT), voice: this.typeSummary(byType, client_1.UsageType.VOICE), tool: this.typeSummary(byType, client_1.UsageType.TOOL), file: this.typeSummary(byType, client_1.UsageType.FILE), inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), audioSeconds: sum('audioSeconds'), estimatedCost: sum('estimatedCost') }, byUser: byUser.map((row) => ({ user: byId.get(row.userId) ?? { id: row.userId, email: 'Unknown', firstName: '', lastName: '' }, requests: row._count._all, inputTokens: row._sum.inputTokens ?? 0, outputTokens: row._sum.outputTokens ?? 0, estimatedCost: row._sum.estimatedCost ?? 0 })), trend, tools };
    }
    async getIntegrations() {
        const [telegram, google] = await Promise.all([this.prisma.telegramConnection.groupBy({ by: ['status'], _count: { _all: true } }), this.prisma.googleConnection.groupBy({ by: ['status'], _count: { _all: true } })]);
        return { telegram: this.integrationSummary(telegram, ['CONNECTED', 'DISCONNECTED', 'ERROR']), google: this.integrationSummary(google, ['CONNECTED', 'DISCONNECTED', 'ERROR']) };
    }
    async getNotifications(range = 30) {
        const since = this.daysAgo(range);
        const [groups, failed] = await Promise.all([this.prisma.notification.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }), this.prisma.notification.findMany({ where: { status: client_1.NotificationStatus.FAILED }, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, type: true, channel: true, status: true, retryCount: true, failedAt: true, createdAt: true, user: { select: { id: true, email: true } } } })]);
        const counts = Object.fromEntries(groups.map((row) => [row.status.toLowerCase(), row._count._all]));
        return { range, totals: { total: Object.values(counts).reduce((a, b) => a + b, 0), pending: counts.pending ?? 0, sent: counts.sent ?? 0, failed: counts.failed ?? 0, read: counts.read ?? 0 }, failed: failed.map(({ user, ...row }) => ({ ...row, user: { id: user.id, email: user.email } })) };
    }
    async getFiles(page = 1, limit = 20) {
        const where = { status: { not: client_1.FileStatus.DELETED } };
        const [rows, total, size, byMime, byProvider, bySource] = await Promise.all([this.prisma.userFile.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (0, pagination_query_dto_1.paginationSkip)(page, limit), take: Math.min(limit, 100), select: { id: true, originalName: true, mimeType: true, extension: true, sizeBytes: true, source: true, storageProvider: true, createdAt: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } } }), this.prisma.userFile.count({ where }), this.prisma.userFile.aggregate({ where, _sum: { sizeBytes: true } }), this.prisma.userFile.groupBy({ by: ['mimeType'], where, _count: { _all: true } }), this.prisma.userFile.groupBy({ by: ['storageProvider'], where, _count: { _all: true } }), this.prisma.userFile.groupBy({ by: ['source'], where, _count: { _all: true } })]);
        return { stats: { total, totalSizeBytes: Number(size._sum.sizeBytes ?? 0n), images: byMime.filter((x) => x.mimeType.startsWith('image/')).reduce((a, x) => a + x._count._all, 0), pdfs: byMime.find((x) => x.mimeType === 'application/pdf')?._count._all ?? 0, docs: byMime.filter((x) => x.mimeType.includes('word') || x.mimeType.includes('document') || x.mimeType.includes('text/')).reduce((a, x) => a + x._count._all, 0), storage: Object.fromEntries(byProvider.map((x) => [x.storageProvider.toLowerCase(), x._count._all])), sources: Object.fromEntries(bySource.map((x) => [x.source.toLowerCase(), x._count._all])) }, items: rows.map((row) => ({ ...row, sizeBytes: Number(row.sizeBytes), owner: row.user, user: undefined })), meta: (0, pagination_query_dto_1.paginationMeta)(page, limit, total) };
    }
    async getActivity(query) {
        const where = { userId: query.userId, action: query.action ? { contains: query.action, mode: 'insensitive' } : undefined, entityType: query.entityType ? { equals: query.entityType, mode: 'insensitive' } : undefined, createdAt: { gte: query.from ? new Date(query.from) : undefined, lt: query.to ? new Date(query.to) : undefined } };
        const [rows, total] = await Promise.all([this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (0, pagination_query_dto_1.paginationSkip)(query.page, query.limit), take: query.limit, select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } } }), this.prisma.activityLog.count({ where })]);
        return { items: rows.map((row) => ({ id: row.id, time: row.createdAt, action: row.action, entity: { type: row.entityType, id: row.entityId }, source: row.action.startsWith('AI_') ? 'AI_TOOL' : 'APP', user: row.user })), meta: (0, pagination_query_dto_1.paginationMeta)(query.page, query.limit, total) };
    }
    async getSystemHealth() {
        const started = Date.now();
        let db = { status: 'ok', latencyMs: 0 };
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            db = { status: 'ok', latencyMs: Date.now() - started };
        }
        catch {
            db = { status: 'unreachable', latencyMs: Date.now() - started };
        }
        return { api: { status: 'ok' }, database: db, notificationWorker: this.worker.health(), uptimeSeconds: Math.floor(process.uptime()), environment: this.config.get('nodeEnv', 'development'), version: process.env.npm_package_version ?? null, migrations: { status: 'managed_by_prisma' }, integrations: await this.getIntegrations() };
    }
    async getSettings() {
        const storage = this.config.get('storage');
        const telegram = this.config.get('telegram');
        const google = this.config.get('google');
        const jwt = this.config.get('jwt');
        const worker = this.worker.config();
        const health = await this.getSystemHealth();
        const toMinutes = (ms) => Math.round(ms / 60_000);
        return {
            platform: {
                name: 'Qulay AI',
                defaultUserStatus: client_1.UserStatus.ACTIVE,
                registrationEnabled: true,
                maintenanceMode: false,
            },
            security: {
                accessTokenExpiresIn: jwt.accessExpiresIn,
                refreshTokenExpiresIn: jwt.refreshExpiresIn,
                loginBruteForce: { maxFailures: security_limits_constants_1.SECURITY_LIMITS.loginBruteForce.maxFailures, lockMinutes: toMinutes(security_limits_constants_1.SECURITY_LIMITS.loginBruteForce.lockMs) },
                rateLimits: {
                    loginPerIp: { max: security_limits_constants_1.SECURITY_LIMITS.loginPerIp.max, windowMinutes: toMinutes(security_limits_constants_1.SECURITY_LIMITS.loginPerIp.windowMs) },
                    loginPerEmail: { max: security_limits_constants_1.SECURITY_LIMITS.loginPerEmail.max, windowMinutes: toMinutes(security_limits_constants_1.SECURITY_LIMITS.loginPerEmail.windowMs) },
                    registerPerIp: { max: security_limits_constants_1.SECURITY_LIMITS.registerPerIp.max, windowMinutes: toMinutes(security_limits_constants_1.SECURITY_LIMITS.registerPerIp.windowMs) },
                    registerPerEmail: { max: security_limits_constants_1.SECURITY_LIMITS.registerPerEmail.max, windowMinutes: toMinutes(security_limits_constants_1.SECURITY_LIMITS.registerPerEmail.windowMs) },
                    passwordReset: { max: security_limits_constants_1.SECURITY_LIMITS.passwordReset.max, windowMinutes: toMinutes(security_limits_constants_1.SECURITY_LIMITS.passwordReset.windowMs) },
                    globalPerIp: { max: security_limits_constants_1.SECURITY_LIMITS.globalPerIp.max, windowSeconds: Math.round(security_limits_constants_1.SECURITY_LIMITS.globalPerIp.windowMs / 1000) },
                },
            },
            notifications: { workerStatus: this.worker.health().status, intervalSeconds: Math.round(worker.intervalMs / 1000), batchSize: worker.batchSize, retryLimit: worker.retryLimit },
            integrations: { telegram: { configured: telegram.configured }, google: { configured: google.configured }, openai: { configured: Boolean(process.env.OPENAI_API_KEY) } },
            storage: {
                provider: storage.provider,
                maxFileSizeBytes: storage.maxSizeBytes,
                localWarning: storage.provider === 'LOCAL' ? 'Lokal disk saqlash joyi qayta joylashtirishlar (redeploy) orasida saqlanmaydi — production uchun S3 ulanishi tavsiya etiladi.' : null,
            },
            system: { environment: health.environment, version: health.version, api: health.api, database: health.database },
        };
    }
    daysAgo(days) { return new Date(Date.now() - Math.max(1, Math.min(days, 90)) * 86_400_000); }
    async getTrend(entity, start, end) { const rows = await this.prisma.$queryRaw(client_1.Prisma.sql `SELECT date_trunc('day', "createdAt") AS date, COUNT(*)::bigint AS count FROM "User" WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY 1`); return rows.map((row) => ({ date: new Date(row.date).toISOString().slice(0, 10), count: Number(row.count) })); }
    async getActivityTrend(start, end) { const rows = await this.prisma.$queryRaw(client_1.Prisma.sql `SELECT date_trunc('day', "createdAt") AS date, COUNT(*)::bigint AS count FROM "ActivityLog" WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY 1`); return rows.map((row) => ({ date: new Date(row.date).toISOString().slice(0, 10), count: Number(row.count) })); }
    async getUsageTrend(start, end) { const rows = await this.prisma.$queryRaw(client_1.Prisma.sql `SELECT date_trunc('day', "createdAt") AS date, COUNT(*)::bigint AS count FROM "AiUsage" WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY 1`); return rows.map((row) => ({ date: new Date(row.date).toISOString().slice(0, 10), count: Number(row.count) })); }
    async getToolUsage(start, end) { const rows = await this.prisma.$queryRaw(client_1.Prisma.sql `SELECT metadata->>'toolName' AS "toolName", COUNT(*)::bigint AS count FROM "ActivityLog" WHERE action = 'AI_TOOL_EXECUTED' AND "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY count DESC`); return rows.filter((row) => row.toolName).map((row) => ({ tool: row.toolName, count: Number(row.count) })); }
    async getActivityOverview(start, end) { const [tasks, reminders, meetings, notes, contacts, finance, files] = await Promise.all([this.prisma.task.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.reminder.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.meeting.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.note.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.contact.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.financeTransaction.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.userFile.count({ where: { createdAt: { gte: start, lt: end }, status: { not: client_1.FileStatus.DELETED } } })]); return { tasks, reminders, meetings, notes, contacts, financeTransactions: finance, filesUploaded: files }; }
    typeSummary(groups, type) { const row = groups.find((item) => item.type === type); return { requests: row?._count._all ?? 0, inputTokens: row?._sum.inputTokens ?? 0, outputTokens: row?._sum.outputTokens ?? 0, audioSeconds: row?._sum.audioSeconds ?? 0, estimatedCost: row?._sum.estimatedCost ?? 0 }; }
    integrationSummary(rows, keys) { const counts = Object.fromEntries(rows.map((row) => [row.status, row._count._all])); return Object.fromEntries(keys.map((key) => [key.toLowerCase(), counts[key] ?? 0])); }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        activity_log_service_1.ActivityLogService,
        config_1.ConfigService,
        notification_worker_service_1.NotificationWorkerService])
], AdminService);
//# sourceMappingURL=admin.service.js.map
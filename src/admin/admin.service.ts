import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityLog, FileSource, FileStatus, GoogleConnectionStatus, NotificationStatus, Prisma, TelegramConnectionStatus, UsageType, UserRole, UserStatus } from '@prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { paginationMeta, paginationSkip } from '../common/dto/pagination-query.dto';
import { NotificationWorkerService } from '../notifications/notification-worker.service';
import { SECURITY_LIMITS } from '../common/security/security-limits.constants';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActivityQueryDto, AdminFilesQueryDto, AdminUsersQueryDto, UpdateAdminPlatformSettingsDto } from './dto/admin-query.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

type CountRow = { status: string; _count: { _all: number } };
type TrendRow = { date: Date; count: bigint };
type ToolRow = { toolName: string | null; count: bigint };

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly config: ConfigService,
    private readonly worker: NotificationWorkerService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async getOverview(range = 30) {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const rangeStart = this.daysAgo(range);
    const [users, activeUsers, registeredToday, registeredThisMonth, blockedUsers, aiUsage, files, notifications, telegram, google, activeReminders, upcomingMeetings, activityOverview, growth, activityTrend] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.user.count({ where: { status: UserStatus.BLOCKED } }),
      this.prisma.aiUsage.count(),
      this.prisma.userFile.count({ where: { status: { not: FileStatus.DELETED } } }),
      this.prisma.notification.count(),
      this.prisma.telegramConnection.count({ where: { status: TelegramConnectionStatus.CONNECTED } }),
      this.prisma.googleConnection.count({ where: { status: GoogleConnectionStatus.CONNECTED } }),
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

  async listUsers(query: AdminUsersQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = { role: query.role, status: query.status, ...(search ? { OR: [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ] } : {}) };
    const orderBy = query.sort === 'lastActivity' ? { activityLogs: { _count: query.order } } : { createdAt: query.order };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy, skip: paginationSkip(query.page, query.limit), take: query.limit, select: {
        id: true, email: true, firstName: true, lastName: true, avatarUrl: true, role: true, status: true, createdAt: true,
        refreshTokens: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 },
        activityLogs: { orderBy: { createdAt: 'desc' }, select: { createdAt: true }, take: 1 },
        telegramConnection: { select: { status: true } }, googleConnection: { select: { status: true } },
      } }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map((row) => ({ ...row, lastActivity: row.activityLogs[0]?.createdAt ?? null, activeSession: row.refreshTokens.length > 0, integrations: { telegram: row.telegramConnection?.status === TelegramConnectionStatus.CONNECTED, google: row.googleConnection?.status === GoogleConnectionStatus.CONNECTED }, activityLogs: undefined, refreshTokens: undefined })), meta: paginationMeta(query.page, query.limit, total) };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: {
      id: true, email: true, firstName: true, lastName: true, avatarUrl: true, role: true, status: true, createdAt: true, updatedAt: true,
      telegramConnection: { select: { status: true, connectedAt: true } }, googleConnection: { select: { status: true, connectedAt: true } },
      activityLogs: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, action: true, entityType: true, entityId: true, createdAt: true } }, subscription: { select: { tier: true, status: true, currentPeriodEnd: true } },
    } });
    if (!user) throw new NotFoundException('User was not found');
    const now = new Date();
    const [tasks, reminders, meetings, notes, contacts, finance, files, aiUsage, sessions, resetRequests] = await Promise.all([
      this.prisma.task.count({ where: { userId: id } }), this.prisma.reminder.count({ where: { userId: id } }), this.prisma.meeting.count({ where: { userId: id } }), this.prisma.note.count({ where: { userId: id } }), this.prisma.contact.count({ where: { userId: id } }), this.prisma.financeTransaction.count({ where: { userId: id } }), this.prisma.userFile.count({ where: { userId: id, status: { not: FileStatus.DELETED } } }), this.prisma.aiUsage.count({ where: { userId: id } }), this.prisma.refreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: now } } }), this.prisma.passwordResetToken.count({ where: { userId: id } }),
    ]);
    return { ...user, lastActivity: user.activityLogs[0]?.createdAt ?? null, activity: user.activityLogs, usage: { tasks, reminders, meetings, notes, contacts, financeTransactions: finance, files, aiRequests: aiUsage }, security: { activeRefreshSessions: sessions, passwordResetRequests: resetRequests }, integrations: { telegram: { connected: user.telegramConnection?.status === TelegramConnectionStatus.CONNECTED, status: user.telegramConnection?.status ?? TelegramConnectionStatus.DISCONNECTED }, google: { connected: user.googleConnection?.status === GoogleConnectionStatus.CONNECTED, status: user.googleConnection?.status ?? GoogleConnectionStatus.DISCONNECTED } }, telegramConnection: undefined, googleConnection: undefined, activityLogs: undefined };
  }

  listPlans() { return this.subscriptions.listPlans(true); }
  updatePlan(actorId: string, tier: import('@prisma/client').SubscriptionTier, dto: Parameters<SubscriptionsService['updatePlan']>[2]) { return this.subscriptions.updatePlan(actorId, tier, dto); }
  assignSubscription(actorId: string, userId: string, tier: import('@prisma/client').SubscriptionTier, status?: import('@prisma/client').SubscriptionStatus) { return this.subscriptions.assignPlan(actorId, userId, tier, status); }

  async updateUserStatus(actorId: string, userId: string, status: UserStatus) {
    if (actorId === userId && status === UserStatus.BLOCKED) throw new ForbiddenException('An admin cannot block their own account');
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
    if (!target) throw new NotFoundException('User was not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({ where: { id: userId }, data: { status }, select: { id: true, status: true } });
      if (status === UserStatus.BLOCKED) await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return next;
    });
    await this.activityLog.record({ userId: actorId, action: status === UserStatus.BLOCKED ? 'ADMIN_USER_BLOCKED' : 'ADMIN_USER_UNBLOCKED', entityType: 'USER', entityId: userId, metadata: { targetUserId: userId, status } });
    return updated;
  }

  async updateUserRole(actorId: string, userId: string, role: UserRole) {
    if (actorId === userId) throw new ForbiddenException('An admin cannot change their own role');
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!target) throw new NotFoundException('User was not found');
    if (target.role === UserRole.ADMIN && role === UserRole.USER) {
      const admins = await this.prisma.user.count({ where: { role: UserRole.ADMIN } });
      if (admins <= 1) throw new ForbiddenException('The last active admin cannot be demoted');
    }
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } });
    await this.activityLog.record({ userId: actorId, action: 'ADMIN_ROLE_CHANGED', entityType: 'USER', entityId: userId, metadata: { targetUserId: userId, role } });
    return updated;
  }

  async getUsage(range = 30) {
    const end = new Date(); const start = this.daysAgo(range);
    const [byType, byUser, trend, tools] = await Promise.all([
      this.prisma.aiUsage.groupBy({ by: ['type'], where: { createdAt: { gte: start, lt: end } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, audioSeconds: true, estimatedCost: true } }),
      this.prisma.aiUsage.groupBy({ by: ['userId'], where: { createdAt: { gte: start, lt: end } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, estimatedCost: true }, orderBy: { _count: { userId: 'desc' } }, take: 10 }),
      this.getUsageTrend(start, end),
      this.getToolUsage(start, end),
    ]);
    const ids = byUser.map((row) => row.userId); const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, firstName: true, lastName: true } }); const byId = new Map(users.map((user) => [user.id, user]));
    const sum = (field: 'inputTokens' | 'outputTokens' | 'audioSeconds' | 'estimatedCost') => byType.reduce((total, row) => total + Number(row._sum[field] ?? 0), 0);
    return { range, provider: { status: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured' }, totals: { requests: byType.reduce((total, row) => total + row._count._all, 0), text: this.typeSummary(byType, UsageType.TEXT), voice: this.typeSummary(byType, UsageType.VOICE), tool: this.typeSummary(byType, UsageType.TOOL), file: this.typeSummary(byType, UsageType.FILE), inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), audioSeconds: sum('audioSeconds'), estimatedCost: sum('estimatedCost') }, byUser: byUser.map((row) => ({ user: byId.get(row.userId) ?? { id: row.userId, email: 'Unknown', firstName: '', lastName: '' }, requests: row._count._all, inputTokens: row._sum.inputTokens ?? 0, outputTokens: row._sum.outputTokens ?? 0, estimatedCost: row._sum.estimatedCost ?? 0 })), trend, tools };
  }

  async getIntegrations() {
    const warningSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [telegram, google, telegramRecent, googleRecent, telegramLastValidated, googleConnected] = await Promise.all([
      this.prisma.telegramConnection.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.googleConnection.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.telegramConnection.findMany({
        where: { OR: [{ status: TelegramConnectionStatus.ERROR }, { lastErrorAt: { gte: warningSince } }] },
        orderBy: { lastErrorAt: 'desc' },
        take: 10,
        select: { userId: true, status: true, lastErrorAt: true, lastErrorCode: true, user: { select: { email: true } } },
      }),
      this.prisma.googleConnection.findMany({
        where: { status: GoogleConnectionStatus.ERROR },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { userId: true, status: true, updatedAt: true, user: { select: { email: true } } },
      }),
      this.prisma.telegramConnection.aggregate({ _max: { lastValidatedAt: true } }),
      this.prisma.googleConnection.findMany({ where: { status: GoogleConnectionStatus.CONNECTED }, select: { scopes: true } }),
    ]);

    const calendarScopes = ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'];
    const driveScopes = ['https://www.googleapis.com/auth/drive.metadata.readonly', 'https://www.googleapis.com/auth/drive.readonly'];
    const hasAll = (scopes: string[], required: string[]) => required.every((scope) => scopes.includes(scope));

    return {
      telegram: this.integrationSummary(telegram, ['CONNECTED', 'DISCONNECTED', 'ERROR']),
      google: this.integrationSummary(google, ['CONNECTED', 'DISCONNECTED', 'ERROR']),
      health: {
        telegram: { lastValidatedAt: telegramLastValidated._max.lastValidatedAt?.toISOString() ?? null, recentErrors: telegramRecent.length },
        google: {
          calendarEnabledUsers: googleConnected.filter((row) => hasAll(row.scopes, calendarScopes)).length,
          driveEnabledUsers: googleConnected.filter((row) => hasAll(row.scopes, driveScopes)).length,
          recentErrors: googleRecent.length,
        },
      },
      warnings: [
        ...telegramRecent.map((row) => ({ provider: 'telegram' as const, userId: row.userId, email: row.user.email, code: row.lastErrorCode ?? row.status, at: row.lastErrorAt?.toISOString() ?? null })),
        ...googleRecent.map((row) => ({ provider: 'google' as const, userId: row.userId, email: row.user.email, code: row.status, at: row.updatedAt.toISOString() })),
      ].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? ''))).slice(0, 10),
    };
  }

  async getNotifications(range = 30) {
    const since = this.daysAgo(range);
    const [groups, failed] = await Promise.all([this.prisma.notification.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }), this.prisma.notification.findMany({ where: { status: NotificationStatus.FAILED }, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, type: true, channel: true, status: true, retryCount: true, failedAt: true, createdAt: true, user: { select: { id: true, email: true } } } })]);
    const counts = Object.fromEntries(groups.map((row) => [row.status.toLowerCase(), row._count._all]));
    return { range, totals: { total: Object.values(counts).reduce((a, b) => a + (b as number), 0), pending: counts.pending ?? 0, sent: counts.sent ?? 0, failed: counts.failed ?? 0, read: counts.read ?? 0 }, failed: failed.map(({ user, ...row }) => ({ ...row, user: { id: user.id, email: user.email } })) };
  }

  async retryNotification(actorId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id }, select: { id: true, status: true, userId: true } });
    if (!notification) throw new NotFoundException('Notification was not found');
    if (notification.status !== NotificationStatus.FAILED) throw new ForbiddenException('Only failed notifications can be retried');
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.PENDING, retryCount: 0, nextRetryAt: new Date(), failedAt: null, claimedAt: null, claimToken: null },
      select: { id: true, status: true },
    });
    await this.activityLog.record({ userId: actorId, action: 'ADMIN_NOTIFICATION_RETRY', entityType: 'NOTIFICATION', entityId: id, metadata: { targetUserId: notification.userId } });
    return updated;
  }

  async getFiles(query: AdminFilesQueryDto) {
    const typeFilter: Prisma.UserFileWhereInput | undefined = query.type === 'image'
      ? { mimeType: { startsWith: 'image/' } }
      : query.type === 'pdf'
        ? { mimeType: 'application/pdf' }
        : query.type === 'document'
          ? { OR: [{ mimeType: { contains: 'word' } }, { mimeType: { contains: 'document' } }, { mimeType: { startsWith: 'text/' } }] }
          : undefined;
    const where: Prisma.UserFileWhereInput = {
      status: { not: FileStatus.DELETED },
      source: query.source,
      storageProvider: query.storageProvider,
      originalName: query.search?.trim() ? { contains: query.search.trim(), mode: 'insensitive' } : undefined,
      ...(typeFilter ?? {}),
    };
    const [rows, total, size, byMime, byProvider, bySource] = await Promise.all([
      this.prisma.userFile.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paginationSkip(query.page, query.limit), take: Math.min(query.limit, 100), select: { id: true, originalName: true, mimeType: true, extension: true, sizeBytes: true, source: true, storageProvider: true, createdAt: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } } }),
      this.prisma.userFile.count({ where }),
      this.prisma.userFile.aggregate({ where, _sum: { sizeBytes: true } }),
      this.prisma.userFile.groupBy({ by: ['mimeType'], where, _count: { _all: true } }),
      this.prisma.userFile.groupBy({ by: ['storageProvider'], where, _count: { _all: true } }),
      this.prisma.userFile.groupBy({ by: ['source'], where, _count: { _all: true } }),
    ]);
    return { stats: { total, totalSizeBytes: Number(size._sum.sizeBytes ?? 0n), images: byMime.filter((x) => x.mimeType.startsWith('image/')).reduce((a, x) => a + x._count._all, 0), pdfs: byMime.find((x) => x.mimeType === 'application/pdf')?._count._all ?? 0, docs: byMime.filter((x) => x.mimeType.includes('word') || x.mimeType.includes('document') || x.mimeType.startsWith('text/')).reduce((a, x) => a + x._count._all, 0), storage: Object.fromEntries(byProvider.map((x) => [x.storageProvider.toLowerCase(), x._count._all])), sources: Object.fromEntries(bySource.map((x) => [x.source.toLowerCase(), x._count._all])) }, items: rows.map((row) => ({ ...row, sizeBytes: Number(row.sizeBytes), owner: row.user, user: undefined })), meta: paginationMeta(query.page, query.limit, total) };
  }

  async getActivity(query: AdminActivityQueryDto) {
    const where: Prisma.ActivityLogWhereInput = { userId: query.userId, action: query.action ? { contains: query.action, mode: 'insensitive' } : undefined, entityType: query.entityType ? { equals: query.entityType, mode: 'insensitive' } : undefined, createdAt: { gte: query.from ? new Date(query.from) : undefined, lt: query.to ? new Date(query.to) : undefined } };
    const [rows, total] = await Promise.all([this.prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paginationSkip(query.page, query.limit), take: query.limit, select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } } }), this.prisma.activityLog.count({ where })]);
    return { items: rows.map((row) => ({ id: row.id, time: row.createdAt, action: row.action, entity: { type: row.entityType, id: row.entityId }, source: row.action.startsWith('AI_') ? 'AI_TOOL' : 'APP', user: row.user })), meta: paginationMeta(query.page, query.limit, total) };
  }

  async getSystemHealth() {
    const started = Date.now(); let db: { status: string; latencyMs: number } = { status: 'ok', latencyMs: 0 };
    try { await this.prisma.$queryRaw`SELECT 1`; db = { status: 'ok', latencyMs: Date.now() - started }; } catch { db = { status: 'unreachable', latencyMs: Date.now() - started }; }
    return { api: { status: 'ok' }, database: db, notificationWorker: this.worker.health(), uptimeSeconds: Math.floor(process.uptime()), environment: this.config.get<string>('nodeEnv', 'development'), version: process.env.npm_package_version ?? null, migrations: { status: 'managed_by_prisma' }, integrations: await this.getIntegrations() };
  }

  async getSettings() {
    const storage = this.config.get<{ provider: string; maxSizeBytes: number }>('storage')!;
    const telegram = this.config.get<{ configured: boolean }>('telegram')!;
    const google = this.config.get<{ configured: boolean }>('google')!;
    const jwt = this.config.get<{ accessExpiresIn: string; refreshExpiresIn: string }>('jwt')!;
    const worker = this.worker.config();
    const health = await this.getSystemHealth();
    const toMinutes = (ms: number) => Math.round(ms / 60_000);
    const platform = await this.prisma.platformSettings.findUnique({ where: { id: 'global' } });
    return {
      platform: {
        name: platform?.name ?? 'Qulay AI',
        defaultUserStatus: UserStatus.ACTIVE,
        registrationEnabled: platform?.registrationEnabled ?? true,
        updatedAt: platform?.updatedAt?.toISOString() ?? null,
      },
      security: {
        accessTokenExpiresIn: jwt.accessExpiresIn,
        refreshTokenExpiresIn: jwt.refreshExpiresIn,
        loginBruteForce: { maxFailures: SECURITY_LIMITS.loginBruteForce.maxFailures, lockMinutes: toMinutes(SECURITY_LIMITS.loginBruteForce.lockMs) },
        rateLimits: {
          loginPerIp: { max: SECURITY_LIMITS.loginPerIp.max, windowMinutes: toMinutes(SECURITY_LIMITS.loginPerIp.windowMs) },
          loginPerEmail: { max: SECURITY_LIMITS.loginPerEmail.max, windowMinutes: toMinutes(SECURITY_LIMITS.loginPerEmail.windowMs) },
          registerPerIp: { max: SECURITY_LIMITS.registerPerIp.max, windowMinutes: toMinutes(SECURITY_LIMITS.registerPerIp.windowMs) },
          registerPerEmail: { max: SECURITY_LIMITS.registerPerEmail.max, windowMinutes: toMinutes(SECURITY_LIMITS.registerPerEmail.windowMs) },
          passwordReset: { max: SECURITY_LIMITS.passwordReset.max, windowMinutes: toMinutes(SECURITY_LIMITS.passwordReset.windowMs) },
          globalPerIp: { max: SECURITY_LIMITS.globalPerIp.max, windowSeconds: Math.round(SECURITY_LIMITS.globalPerIp.windowMs / 1000) },
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

  async updatePlatformSettings(actorId: string, dto: UpdateAdminPlatformSettingsDto) {
    const current = await this.prisma.platformSettings.findUnique({ where: { id: 'global' } });
    const updated = await this.prisma.platformSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', name: dto.name?.trim() || 'Qulay AI', registrationEnabled: dto.registrationEnabled ?? true, updatedBy: actorId },
      update: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.registrationEnabled !== undefined ? { registrationEnabled: dto.registrationEnabled } : {}),
        updatedBy: actorId,
      },
    });
    await this.activityLog.record({
      userId: actorId,
      action: 'ADMIN_SETTINGS_UPDATED',
      entityType: 'PLATFORM_SETTINGS',
      entityId: updated.id,
      metadata: {
        changed: [dto.name !== undefined ? 'name' : null, dto.registrationEnabled !== undefined ? 'registrationEnabled' : null].filter(Boolean),
        previousRegistrationEnabled: current?.registrationEnabled ?? true,
      },
    });
    return { name: updated.name, registrationEnabled: updated.registrationEnabled, updatedAt: updated.updatedAt.toISOString() };
  }

  private daysAgo(days: number) { return new Date(Date.now() - Math.max(1, Math.min(days, 90)) * 86_400_000); }
  private async getTrend(entity: 'User', start: Date, end: Date) { const rows = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`SELECT date_trunc('day', "createdAt") AS date, COUNT(*)::bigint AS count FROM "User" WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY 1`); return rows.map((row) => ({ date: new Date(row.date).toISOString().slice(0, 10), count: Number(row.count) })); }
  private async getActivityTrend(start: Date, end: Date) { const rows = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`SELECT date_trunc('day', "createdAt") AS date, COUNT(*)::bigint AS count FROM "ActivityLog" WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY 1`); return rows.map((row) => ({ date: new Date(row.date).toISOString().slice(0, 10), count: Number(row.count) })); }
  private async getUsageTrend(start: Date, end: Date) { const rows = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`SELECT date_trunc('day', "createdAt") AS date, COUNT(*)::bigint AS count FROM "AiUsage" WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY 1`); return rows.map((row) => ({ date: new Date(row.date).toISOString().slice(0, 10), count: Number(row.count) })); }
  private async getToolUsage(start: Date, end: Date) { const rows = await this.prisma.$queryRaw<ToolRow[]>(Prisma.sql`SELECT metadata->>'toolName' AS "toolName", COUNT(*)::bigint AS count FROM "ActivityLog" WHERE action = 'AI_TOOL_EXECUTED' AND "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1 ORDER BY count DESC`); return rows.filter((row) => row.toolName).map((row) => ({ tool: row.toolName, count: Number(row.count) })); }
  private async getActivityOverview(start: Date, end: Date) { const [tasks, reminders, meetings, notes, contacts, finance, files] = await Promise.all([this.prisma.task.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.reminder.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.meeting.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.note.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.contact.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.financeTransaction.count({ where: { createdAt: { gte: start, lt: end } } }), this.prisma.userFile.count({ where: { createdAt: { gte: start, lt: end }, status: { not: FileStatus.DELETED } } })]); return { tasks, reminders, meetings, notes, contacts, financeTransactions: finance, filesUploaded: files }; }
  private typeSummary(groups: Array<{ type: UsageType; _count: { _all: number }; _sum: { inputTokens: number | null; outputTokens: number | null; audioSeconds: number | null; estimatedCost: number | null } }>, type: UsageType) { const row = groups.find((item) => item.type === type); return { requests: row?._count._all ?? 0, inputTokens: row?._sum.inputTokens ?? 0, outputTokens: row?._sum.outputTokens ?? 0, audioSeconds: row?._sum.audioSeconds ?? 0, estimatedCost: row?._sum.estimatedCost ?? 0 }; }
  private integrationSummary(rows: CountRow[], keys: string[]) { const counts = Object.fromEntries(rows.map((row) => [row.status, row._count._all])); return Object.fromEntries(keys.map((key) => [key.toLowerCase(), counts[key] ?? 0])); }
}

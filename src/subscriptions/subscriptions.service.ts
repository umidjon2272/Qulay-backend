import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FileStatus,
  FinanceCurrency,
  MemoryStatus,
  Prisma,
  SubscriptionRequestStatus,
  SubscriptionStatus,
  SubscriptionTier,
  UsageType,
  UserSubscription,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { APP_ERROR_CODES } from '../common/errors/app-error-codes';
import { SUBSCRIPTION_PLANS, SubscriptionFeature } from './subscription-plans';

export type EffectivePlan = {
  tier: SubscriptionTier;
  name: string;
  monthlyPrice: number;
  currency: FinanceCurrency;
  isActive: boolean;
  features: SubscriptionFeature[];
  limits: {
    aiCreditsPerMonth: number;
    toolActionsPerMonth: number;
    voiceMinutesPerMonth: number;
    files: number;
    storageMb: number;
    memories: number;
  };
};

type SubscriptionRecord = UserSubscription;
type EntitlementInfo = {
  subscription: SubscriptionRecord;
  effectiveTier: SubscriptionTier;
  plan: EffectivePlan;
  canUseAi: boolean;
  periodStart: Date;
  periodEnd: Date | null;
};

@Injectable()
export class SubscriptionsService {
  private readonly planCache = new Map<SubscriptionTier, { expiresAt: number; plan: EffectivePlan }>();
  private readonly entitlementCache = new Map<string, { expiresAt: number; value: EntitlementInfo }>();
  private readonly usageGateCache = new Map<string, { expiresAt: number; used: number }>();
  private readonly planCacheMs = 60_000;
  private readonly entitlementCacheMs = 15_000;
  private readonly usageGateCacheMs = 3_000;

  constructor(private readonly prisma: PrismaService) {}

  async listPlans(includeInactive = false) {
    await this.seedPlans();
    const rows = await this.prisma.subscriptionPlanConfig.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { monthlyPrice: 'asc' },
    });
    return rows.map((row) => this.rowToPlan(row));
  }

  async getForUser(userId: string) {
    const info = await this.entitlementForUser(userId, true);
    const { subscription, effectiveTier, plan, canUseAi, periodStart, periodEnd } = info;
    const usageWhere: Prisma.AiUsageWhereInput = {
      userId,
      createdAt: { gte: periodStart, ...(periodEnd ? { lt: periodEnd } : {}) },
    };
    const [usageGroups, creditAggregate, files, storage, memories, pendingRequest] = await Promise.all([
      this.prisma.aiUsage.groupBy({
        by: ['type'],
        where: usageWhere,
        _count: { _all: true },
        _sum: { audioSeconds: true },
      }),
      this.prisma.aiUsage.aggregate({ where: usageWhere, _sum: { creditUnits: true } }),
      this.prisma.userFile.count({ where: { userId, status: { not: FileStatus.DELETED } } }),
      this.prisma.userFile.aggregate({ where: { userId, status: { not: FileStatus.DELETED } }, _sum: { sizeBytes: true } }),
      this.prisma.userMemory.count({ where: { userId, status: MemoryStatus.ACTIVE } }),
      this.prisma.subscriptionRequest.findFirst({
        where: { userId, status: SubscriptionRequestStatus.PENDING },
        orderBy: { requestedAt: 'desc' },
        select: { id: true, tier: true, status: true, requestedAt: true },
      }),
    ]);
    const tools = usageGroups.find((item) => item.type === UsageType.TOOL)?._count._all ?? 0;
    const voiceSeconds = usageGroups.find((item) => item.type === UsageType.VOICE)?._sum.audioSeconds ?? 0;
    const usedCredits = creditAggregate._sum.creditUnits ?? 0;
    const creditLimit = plan.limits.aiCreditsPerMonth + subscription.bonusCredits;

    return {
      ...subscription,
      entitlementSnapshot: undefined,
      effectiveTier,
      trialActive: false,
      canUseAi,
      plan,
      pendingRequest,
      usagePeriod: { start: periodStart, end: periodEnd },
      usage: {
        aiCredits: { used: usedCredits, remaining: Math.max(0, creditLimit - usedCredits), limit: creditLimit, bonus: subscription.bonusCredits },
        aiMessages: { used: usedCredits, limit: creditLimit },
        toolActions: { used: tools, limit: plan.limits.toolActionsPerMonth },
        voiceMinutes: { used: Math.ceil(voiceSeconds / 60), limit: plan.limits.voiceMinutesPerMonth },
        files: { used: files, limit: plan.limits.files },
        storageMb: { used: Number(storage._sum.sizeBytes ?? 0n) / 1024 / 1024, limit: plan.limits.storageMb },
        memories: { used: memories, limit: plan.limits.memories },
      },
    };
  }

  async requestPlan(userId: string, tier: SubscriptionTier) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    const plan = await this.getPlan(tier);
    if (!plan.isActive) throw new ForbiddenException({ code: APP_ERROR_CODES.PLAN_NOT_AVAILABLE, message: 'Tarif hozir mavjud emas' });

    return this.prisma.$transaction(async (tx) => {
      await tx.subscriptionRequest.updateMany({
        where: { userId, status: SubscriptionRequestStatus.PENDING },
        data: { status: SubscriptionRequestStatus.CANCELED, reviewedAt: new Date() },
      });
      return tx.subscriptionRequest.create({
        data: { userId, tier, status: SubscriptionRequestStatus.PENDING },
        select: { id: true, tier: true, status: true, requestedAt: true },
      });
    });
  }

  async listRequests(status: SubscriptionRequestStatus = SubscriptionRequestStatus.PENDING) {
    const rows = await this.prisma.subscriptionRequest.findMany({
      where: { status },
      orderBy: { requestedAt: 'asc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, subscription: { select: { tier: true, status: true, currentPeriodEnd: true } } } },
        reviewer: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    return Promise.all(rows.map(async (row) => ({ ...row, plan: await this.getPlan(row.tier) })));
  }

  async approveRequest(actorId: string, requestId: string) {
    const request = await this.prisma.subscriptionRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('SUBSCRIPTION_REQUEST_NOT_FOUND');
    if (request.status !== SubscriptionRequestStatus.PENDING) throw new ConflictException('SUBSCRIPTION_REQUEST_ALREADY_REVIEWED');
    const plan = await this.getPlan(request.tier);
    if (!plan.isActive) throw new ForbiddenException({ code: APP_ERROR_CODES.PLAN_NOT_AVAILABLE, message: 'Tarif hozir mavjud emas' });
    const currentPeriodStart = new Date();
    const currentPeriodEnd = this.addOneMonth(currentPeriodStart);

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.subscriptionRequest.updateMany({
        where: { id: requestId, status: SubscriptionRequestStatus.PENDING },
        data: { status: SubscriptionRequestStatus.APPROVED, reviewedAt: currentPeriodStart, reviewedBy: actorId },
      });
      if (claimed.count !== 1) throw new ConflictException('SUBSCRIPTION_REQUEST_ALREADY_REVIEWED');
      await tx.subscriptionRequest.updateMany({
        where: { userId: request.userId, id: { not: requestId }, status: SubscriptionRequestStatus.PENDING },
        data: { status: SubscriptionRequestStatus.CANCELED, reviewedAt: currentPeriodStart, reviewedBy: actorId },
      });
      const subscription = await tx.userSubscription.upsert({
        where: { userId: request.userId },
        create: {
          userId: request.userId,
          tier: request.tier,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart,
          currentPeriodEnd,
          entitlementSnapshot: plan as unknown as Prisma.InputJsonValue,
          bonusCredits: 0,
        },
        update: {
          tier: request.tier,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart,
          currentPeriodEnd,
          trialEndsAt: null,
          cancelAtPeriodEnd: false,
          entitlementSnapshot: plan as unknown as Prisma.InputJsonValue,
          bonusCredits: 0,
        },
      });
      return { requestId, userId: request.userId, tier: request.tier, subscription };
    });
    this.invalidateUser(request.userId);
    return result;
  }

  async rejectRequest(actorId: string, requestId: string) {
    const request = await this.prisma.subscriptionRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('SUBSCRIPTION_REQUEST_NOT_FOUND');
    const updated = await this.prisma.subscriptionRequest.updateMany({
      where: { id: requestId, status: SubscriptionRequestStatus.PENDING },
      data: { status: SubscriptionRequestStatus.REJECTED, reviewedAt: new Date(), reviewedBy: actorId },
    });
    if (updated.count !== 1) throw new ConflictException('SUBSCRIPTION_REQUEST_ALREADY_REVIEWED');
    return { requestId, userId: request.userId, tier: request.tier, status: SubscriptionRequestStatus.REJECTED };
  }

  async assertAiAllowed(userId: string) {
    const info = await this.entitlementForUser(userId);
    this.assertActive(info);
    const used = await this.cachedUsageGate(this.usageGateKey('credits', userId, info.periodStart), async () => {
      const aggregate = await this.prisma.aiUsage.aggregate({
        where: { userId, createdAt: this.periodWhere(info) },
        _sum: { creditUnits: true },
      });
      return aggregate._sum.creditUnits ?? 0;
    });
    if (used >= info.plan.limits.aiCreditsPerMonth + info.subscription.bonusCredits) throw new ForbiddenException({ code: APP_ERROR_CODES.AI_CREDIT_LIMIT_REACHED, message: 'AI kredit limiti tugagan' });
  }

  async assertToolAllowed(userId: string) {
    const info = await this.entitlementForUser(userId);
    this.assertActive(info);
    const used = await this.cachedUsageGate(this.usageGateKey('tool', userId, info.periodStart), () =>
      this.prisma.aiUsage.count({ where: { userId, type: UsageType.TOOL, createdAt: this.periodWhere(info) } }),
    );
    if (used >= info.plan.limits.toolActionsPerMonth) throw new ForbiddenException({ code: APP_ERROR_CODES.TOOL_ACTION_LIMIT_REACHED, message: 'Agent amallari limiti tugagan' });
  }

  async assertVoiceAllowed(userId: string) {
    const info = await this.entitlementForUser(userId);
    this.assertActive(info);
    const usedSeconds = await this.cachedUsageGate(this.usageGateKey('voice', userId, info.periodStart), async () => {
      const aggregate = await this.prisma.aiUsage.aggregate({
        where: { userId, type: UsageType.VOICE, createdAt: this.periodWhere(info) },
        _sum: { audioSeconds: true },
      });
      return aggregate._sum.audioSeconds ?? 0;
    });
    const usedMinutes = Math.ceil(usedSeconds / 60);
    if (usedMinutes >= info.plan.limits.voiceMinutesPerMonth) throw new ForbiddenException({ code: APP_ERROR_CODES.VOICE_LIMIT_REACHED, message: 'Ovozli daqiqalar limiti tugagan' });
  }

  async assertFeatureAllowed(userId: string, feature: SubscriptionFeature) {
    const info = await this.entitlementForUser(userId);
    this.assertActive(info);
    if (!info.plan.features.includes(feature)) throw new ForbiddenException({ code: APP_ERROR_CODES.PLAN_FEATURE_REQUIRED, message: 'Bu imkoniyat joriy tarifga kirmaydi', feature });
  }

  async assertMemoryAllowed(userId: string) {
    const info = await this.entitlementForUser(userId);
    this.assertActive(info);
    const used = await this.prisma.userMemory.count({ where: { userId, status: MemoryStatus.ACTIVE } });
    if (used >= info.plan.limits.memories) throw new ForbiddenException({ code: APP_ERROR_CODES.MEMORY_LIMIT_REACHED, message: 'Xotira limiti tugagan' });
  }

  async assertFileAllowed(userId: string, incomingBytes: number) {
    const info = await this.entitlementForUser(userId);
    this.assertActive(info);
    const [files, storage] = await Promise.all([
      this.prisma.userFile.count({ where: { userId, status: { not: FileStatus.DELETED } } }),
      this.prisma.userFile.aggregate({ where: { userId, status: { not: FileStatus.DELETED } }, _sum: { sizeBytes: true } }),
    ]);
    if (files >= info.plan.limits.files) throw new ForbiddenException({ code: APP_ERROR_CODES.FILE_LIMIT_REACHED, message: 'Fayl limiti tugagan' });
    const usedMb = Number(storage._sum.sizeBytes ?? 0n) / 1024 / 1024;
    if (usedMb + incomingBytes / 1024 / 1024 > info.plan.limits.storageMb) throw new ForbiddenException({ code: APP_ERROR_CODES.STORAGE_LIMIT_REACHED, message: 'Saqlash limiti tugagan' });
  }

  async addCredits(userId: string, amount: number) {
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000) throw new ForbiddenException('INVALID_CREDIT_AMOUNT');
    const subscription = await this.ensureForUser(userId);
    const updated = await this.prisma.userSubscription.update({
      where: { userId },
      data: { bonusCredits: { increment: amount } },
      select: { userId: true, tier: true, status: true, bonusCredits: true, currentPeriodEnd: true },
    });
    this.invalidateUser(userId);
    return updated;
  }

  async updatePlan(actorId: string, tier: SubscriptionTier, input: Partial<{
    name: string;
    monthlyPrice: number;
    currency: FinanceCurrency;
    aiCreditsPerMonth: number;
    toolActionsPerMonth: number;
    voiceMinutesPerMonth: number;
    files: number;
    storageMb: number;
    memories: number;
    isActive: boolean;
  }>) {
    await this.seedPlans();
    const numeric = ['monthlyPrice', 'aiCreditsPerMonth', 'toolActionsPerMonth', 'voiceMinutesPerMonth', 'files', 'storageMb', 'memories'] as const;
    for (const key of numeric) {
      if (input[key] !== undefined && (!Number.isInteger(input[key]) || Number(input[key]) < 0)) throw new ForbiddenException('INVALID_PLAN_LIMIT');
    }
    const row = await this.prisma.subscriptionPlanConfig.update({
      where: { tier },
      data: { ...input, name: input.name?.trim(), updatedBy: actorId },
    });
    const plan = this.rowToPlan(row);
    this.planCache.set(tier, { expiresAt: Date.now() + this.planCacheMs, plan });
    return plan;
  }

  async assignPlan(_actorId: string, userId: string, tier: SubscriptionTier, status: SubscriptionStatus = SubscriptionStatus.ACTIVE) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    const plan = await this.getPlan(tier);
    const currentPeriodStart = new Date();
    const currentPeriodEnd = status === SubscriptionStatus.ACTIVE ? this.addOneMonth(currentPeriodStart) : null;
    const result = await this.prisma.userSubscription.upsert({
      where: { userId },
      create: { userId, tier, status, currentPeriodStart, currentPeriodEnd, entitlementSnapshot: plan as unknown as Prisma.InputJsonValue, bonusCredits: 0 },
      update: { tier, status, currentPeriodStart, currentPeriodEnd, trialEndsAt: null, entitlementSnapshot: plan as unknown as Prisma.InputJsonValue, bonusCredits: 0 },
    });
    this.invalidateUser(userId);
    return result;
  }

  private async entitlementForUser(userId: string, force = false): Promise<EntitlementInfo> {
    if (!force) {
      const cached = this.entitlementCache.get(userId);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
    }
    const value = await this.buildEntitlementForUser(userId);
    this.entitlementCache.set(userId, { expiresAt: Date.now() + this.entitlementCacheMs, value });
    return value;
  }

  private async buildEntitlementForUser(userId: string): Promise<EntitlementInfo> {
    let subscription = await this.ensureForUser(userId);
    const now = new Date();
    if (subscription.status === SubscriptionStatus.ACTIVE && subscription.currentPeriodEnd && subscription.currentPeriodEnd <= now) {
      subscription = await this.prisma.userSubscription.update({
        where: { userId },
        data: { status: SubscriptionStatus.EXPIRED },
      });
    }
    const effectiveTier = subscription.tier;
    const plan = subscription.status === SubscriptionStatus.ACTIVE && subscription.entitlementSnapshot
      ? this.snapshotToPlan(subscription.entitlementSnapshot, effectiveTier)
      : await this.getPlan(effectiveTier);
    const canUseAi = subscription.status === SubscriptionStatus.ACTIVE
      && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now);
    return {
      subscription,
      effectiveTier,
      plan,
      canUseAi,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
    };
  }

  private assertActive(info: EntitlementInfo) {
    if (!info.canUseAi) throw new ForbiddenException({ code: APP_ERROR_CODES.SUBSCRIPTION_REQUIRED, message: 'Faol obuna kerak' });
  }

  private periodWhere(info: EntitlementInfo): Prisma.DateTimeFilter {
    return { gte: info.periodStart, ...(info.periodEnd ? { lt: info.periodEnd } : {}) };
  }

  private usageGateKey(kind: string, userId: string, periodStart: Date) {
    return `${kind}:${userId}:${periodStart.getTime()}`;
  }

  private async cachedUsageGate(key: string, load: () => Promise<number>): Promise<number> {
    const cached = this.usageGateCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.used;
    const used = await load();
    this.usageGateCache.set(key, { expiresAt: Date.now() + this.usageGateCacheMs, used });
    return used;
  }

  private invalidateUser(userId: string) {
    this.entitlementCache.delete(userId);
    for (const key of this.usageGateCache.keys()) if (key.includes(`:${userId}:`)) this.usageGateCache.delete(key);
  }

  private async ensureForUser(userId: string) {
    const existing = await this.prisma.userSubscription.findUnique({ where: { userId } });
    if (existing) return existing;
    try {
      return await this.prisma.userSubscription.create({
        data: {
          userId,
          tier: SubscriptionTier.STARTER,
          status: SubscriptionStatus.EXPIRED,
          trialEndsAt: null,
          currentPeriodStart: new Date(),
          currentPeriodEnd: null,
        },
      });
    } catch {
      return this.prisma.userSubscription.findUniqueOrThrow({ where: { userId } });
    }
  }

  private planCreateData(tier: SubscriptionTier) {
    const value = SUBSCRIPTION_PLANS[tier];
    return {
      tier,
      name: value.name,
      monthlyPrice: value.monthlyPriceUzs,
      currency: FinanceCurrency.UZS,
      aiCreditsPerMonth: value.limits.aiCreditsPerMonth,
      toolActionsPerMonth: value.limits.toolActionsPerMonth,
      voiceMinutesPerMonth: value.limits.voiceMinutesPerMonth,
      files: value.limits.files,
      storageMb: value.limits.storageMb,
      memories: value.limits.memories,
    };
  }

  private async seedPlans() {
    const rows = await Promise.all((Object.keys(SUBSCRIPTION_PLANS) as SubscriptionTier[]).map((tier) =>
      this.prisma.subscriptionPlanConfig.upsert({ where: { tier }, update: {}, create: this.planCreateData(tier) }),
    ));
    for (const row of rows) this.planCache.set(row.tier, { expiresAt: Date.now() + this.planCacheMs, plan: this.rowToPlan(row) });
  }

  private async getPlan(tier: SubscriptionTier) {
    const cached = this.planCache.get(tier);
    if (cached && cached.expiresAt > Date.now()) return cached.plan;
    let row = await this.prisma.subscriptionPlanConfig.findUnique({ where: { tier } });
    if (!row) row = await this.prisma.subscriptionPlanConfig.upsert({ where: { tier }, update: {}, create: this.planCreateData(tier) });
    const plan = this.rowToPlan(row);
    this.planCache.set(tier, { expiresAt: Date.now() + this.planCacheMs, plan });
    return plan;
  }

  private rowToPlan(row: {
    tier: SubscriptionTier;
    name: string;
    monthlyPrice: number;
    currency: FinanceCurrency;
    aiCreditsPerMonth: number;
    toolActionsPerMonth: number;
    voiceMinutesPerMonth: number;
    files: number;
    storageMb: number;
    memories: number;
    isActive: boolean;
  }): EffectivePlan {
    return {
      tier: row.tier,
      name: row.name,
      monthlyPrice: row.monthlyPrice,
      currency: row.currency,
      isActive: row.isActive,
      features: [...SUBSCRIPTION_PLANS[row.tier].features],
      limits: {
        aiCreditsPerMonth: row.aiCreditsPerMonth,
        toolActionsPerMonth: row.toolActionsPerMonth,
        voiceMinutesPerMonth: row.voiceMinutesPerMonth,
        files: row.files,
        storageMb: row.storageMb,
        memories: row.memories,
      },
    };
  }

  private snapshotToPlan(value: Prisma.JsonValue, fallbackTier: SubscriptionTier): EffectivePlan {
    const row = value as unknown as Partial<EffectivePlan>;
    const fallback = SUBSCRIPTION_PLANS[fallbackTier];
    if (row?.limits) {
      return {
        tier: row.tier ?? fallbackTier,
        name: row.name ?? fallback.name,
        monthlyPrice: row.monthlyPrice ?? fallback.monthlyPriceUzs,
        currency: row.currency ?? FinanceCurrency.UZS,
        isActive: row.isActive ?? true,
        features: Array.isArray(row.features) ? row.features : [...fallback.features],
        limits: row.limits,
      } as EffectivePlan;
    }
    return {
      tier: fallbackTier,
      name: fallback.name,
      monthlyPrice: fallback.monthlyPriceUzs,
      currency: FinanceCurrency.UZS,
      isActive: true,
      features: [...fallback.features],
      limits: {
        aiCreditsPerMonth: fallback.limits.aiCreditsPerMonth,
        toolActionsPerMonth: fallback.limits.toolActionsPerMonth,
        voiceMinutesPerMonth: fallback.limits.voiceMinutesPerMonth,
        files: fallback.limits.files,
        storageMb: fallback.limits.storageMb,
        memories: fallback.limits.memories,
      },
    };
  }

  private addOneMonth(value: Date) {
    const year = value.getUTCFullYear();
    const month = value.getUTCMonth();
    const day = value.getUTCDate();
    const lastDayOfNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
    return new Date(Date.UTC(
      year,
      month + 1,
      Math.min(day, lastDayOfNextMonth),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ));
  }
}

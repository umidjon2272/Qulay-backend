import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FileStatus, FinanceCurrency, MemoryStatus, Prisma, SubscriptionStatus, SubscriptionTier, UsageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SUBSCRIPTION_PLANS } from './subscription-plans';

export type EffectivePlan = {
  tier: SubscriptionTier; name: string; monthlyPrice: number; currency: FinanceCurrency; isActive: boolean;
  limits: { aiCreditsPerMonth: number; toolActionsPerMonth: number; voiceMinutesPerMonth: number; files: number; storageMb: number; memories: number };
};

@Injectable()
export class SubscriptionsService {
  private readonly planCache = new Map<SubscriptionTier, { expiresAt: number; plan: EffectivePlan }>();
  private readonly planCacheMs = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async listPlans(includeInactive = false) {
    await this.seedPlans();
    const rows = await this.prisma.subscriptionPlanConfig.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { monthlyPrice: 'asc' } });
    return rows.map((row) => this.rowToPlan(row));
  }

  async getForUser(userId: string) {
    const subscription = await this.ensureForUser(userId);
    const trialActive = subscription.status === SubscriptionStatus.TRIALING && Boolean(subscription.trialEndsAt && subscription.trialEndsAt > new Date());
    const effectiveTier = trialActive ? SubscriptionTier.PRO : subscription.tier;
    const plan = subscription.status === SubscriptionStatus.ACTIVE && subscription.entitlementSnapshot
      ? this.snapshotToPlan(subscription.entitlementSnapshot, effectiveTier)
      : await this.getPlan(effectiveTier);
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [usageGroups, creditAggregate, files, storage, memories] = await Promise.all([
      this.prisma.aiUsage.groupBy({ by: ['type'], where: { userId, createdAt: { gte: monthStart } }, _count: { _all: true }, _sum: { audioSeconds: true } }),
      this.prisma.aiUsage.aggregate({ where: { userId, type: UsageType.TEXT, createdAt: { gte: monthStart } }, _sum: { creditUnits: true } }),
      this.prisma.userFile.count({ where: { userId, status: { not: FileStatus.DELETED } } }),
      this.prisma.userFile.aggregate({ where: { userId, status: { not: FileStatus.DELETED } }, _sum: { sizeBytes: true } }),
      this.prisma.userMemory.count({ where: { userId, status: MemoryStatus.ACTIVE } }),
    ]);
    const tools = usageGroups.find((item) => item.type === UsageType.TOOL)?._count._all ?? 0;
    const voiceSeconds = usageGroups.find((item) => item.type === UsageType.VOICE)?._sum.audioSeconds ?? 0;
    const canUseAi = trialActive || subscription.status === SubscriptionStatus.ACTIVE || subscription.tier === SubscriptionTier.STARTER;
    return { ...subscription, entitlementSnapshot: undefined, effectiveTier, trialActive, canUseAi, plan,
      usage: {
        aiCredits: { used: creditAggregate._sum.creditUnits ?? 0, limit: plan.limits.aiCreditsPerMonth },
        aiMessages: { used: creditAggregate._sum.creditUnits ?? 0, limit: plan.limits.aiCreditsPerMonth },
        toolActions: { used: tools, limit: plan.limits.toolActionsPerMonth },
        voiceMinutes: { used: Math.ceil(voiceSeconds / 60), limit: plan.limits.voiceMinutesPerMonth },
        files: { used: files, limit: plan.limits.files }, storageMb: { used: Number(storage._sum.sizeBytes ?? 0n) / 1024 / 1024, limit: plan.limits.storageMb },
        memories: { used: memories, limit: plan.limits.memories },
      },
    };
  }

  async assertAiAllowed(userId: string) {
    const info = await this.entitlementForUser(userId);
    if (!info.canUseAi) throw new ForbiddenException('SUBSCRIPTION_REQUIRED');
    const monthStart = this.monthStart();
    const aggregate = await this.prisma.aiUsage.aggregate({ where: { userId, type: UsageType.TEXT, createdAt: { gte: monthStart } }, _sum: { creditUnits: true } });
    if ((aggregate._sum.creditUnits ?? 0) >= info.plan.limits.aiCreditsPerMonth) throw new ForbiddenException('AI_CREDIT_LIMIT_REACHED');
  }

  async assertToolAllowed(userId: string) {
    const info = await this.entitlementForUser(userId);
    const used = await this.prisma.aiUsage.count({ where: { userId, type: UsageType.TOOL, createdAt: { gte: this.monthStart() } } });
    if (used >= info.plan.limits.toolActionsPerMonth) throw new ForbiddenException('TOOL_ACTION_LIMIT_REACHED');
  }

  async assertVoiceAllowed(userId: string) {
    const info = await this.entitlementForUser(userId);
    const aggregate = await this.prisma.aiUsage.aggregate({ where: { userId, type: UsageType.VOICE, createdAt: { gte: this.monthStart() } }, _sum: { audioSeconds: true } });
    const usedMinutes = Math.ceil((aggregate._sum.audioSeconds ?? 0) / 60);
    if (usedMinutes >= info.plan.limits.voiceMinutesPerMonth) throw new ForbiddenException('VOICE_LIMIT_REACHED');
  }

  async assertMemoryAllowed(userId: string) {
    const info = await this.entitlementForUser(userId);
    const used = await this.prisma.userMemory.count({ where: { userId, status: MemoryStatus.ACTIVE } });
    if (used >= info.plan.limits.memories) throw new ForbiddenException('MEMORY_LIMIT_REACHED');
  }

  async assertFileAllowed(userId: string, incomingBytes: number) {
    const info = await this.entitlementForUser(userId);
    const [files, storage] = await Promise.all([
      this.prisma.userFile.count({ where: { userId, status: { not: FileStatus.DELETED } } }),
      this.prisma.userFile.aggregate({ where: { userId, status: { not: FileStatus.DELETED } }, _sum: { sizeBytes: true } }),
    ]);
    if (files >= info.plan.limits.files) throw new ForbiddenException('FILE_LIMIT_REACHED');
    const usedMb = Number(storage._sum.sizeBytes ?? 0n) / 1024 / 1024;
    if (usedMb + incomingBytes / 1024 / 1024 > info.plan.limits.storageMb) throw new ForbiddenException('STORAGE_LIMIT_REACHED');
  }

  async updatePlan(actorId: string, tier: SubscriptionTier, input: Partial<{ name: string; monthlyPrice: number; currency: FinanceCurrency; aiCreditsPerMonth: number; toolActionsPerMonth: number; voiceMinutesPerMonth: number; files: number; storageMb: number; memories: number; isActive: boolean }>) {
    await this.seedPlans();
    const numeric = ['monthlyPrice','aiCreditsPerMonth','toolActionsPerMonth','voiceMinutesPerMonth','files','storageMb','memories'] as const;
    for (const key of numeric) if (input[key] !== undefined && (!Number.isInteger(input[key]) || Number(input[key]) < 0)) throw new ForbiddenException('INVALID_PLAN_LIMIT');
    const row = await this.prisma.subscriptionPlanConfig.update({ where: { tier }, data: { ...input, name: input.name?.trim(), updatedBy: actorId } });
    const plan = this.rowToPlan(row);
    this.planCache.set(tier, { expiresAt: Date.now() + this.planCacheMs, plan });
    return plan;
  }

  async assignPlan(_actorId: string, userId: string, tier: SubscriptionTier, status: SubscriptionStatus = SubscriptionStatus.ACTIVE) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    const plan = await this.getPlan(tier);
    const currentPeriodStart = new Date(); const currentPeriodEnd = new Date(currentPeriodStart); currentPeriodEnd.setUTCMonth(currentPeriodEnd.getUTCMonth() + 1);
    return this.prisma.userSubscription.upsert({ where: { userId }, create: { userId, tier, status, currentPeriodStart, currentPeriodEnd, entitlementSnapshot: plan as unknown as Prisma.InputJsonValue }, update: { tier, status, currentPeriodStart, currentPeriodEnd, trialEndsAt: null, entitlementSnapshot: plan as unknown as Prisma.InputJsonValue } });
  }

  private monthStart() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private async entitlementForUser(userId: string) {
    const subscription = await this.ensureForUser(userId);
    const trialActive = subscription.status === SubscriptionStatus.TRIALING && Boolean(subscription.trialEndsAt && subscription.trialEndsAt > new Date());
    const effectiveTier = trialActive ? SubscriptionTier.PRO : subscription.tier;
    const plan = subscription.status === SubscriptionStatus.ACTIVE && subscription.entitlementSnapshot
      ? this.snapshotToPlan(subscription.entitlementSnapshot, effectiveTier)
      : await this.getPlan(effectiveTier);
    const canUseAi = trialActive || subscription.status === SubscriptionStatus.ACTIVE || subscription.tier === SubscriptionTier.STARTER;
    return { subscription, trialActive, effectiveTier, plan, canUseAi };
  }

  private async ensureForUser(userId: string) {
    const existing = await this.prisma.userSubscription.findUnique({ where: { userId } });
    if (existing) return existing;
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 14 * 86400000);
    try {
      return await this.prisma.userSubscription.create({ data: { userId, tier: SubscriptionTier.STARTER, status: SubscriptionStatus.TRIALING, trialEndsAt } });
    } catch {
      // Concurrent first requests may race to create the default subscription.
      // Read the winner instead of failing a valid AI/voice request.
      return this.prisma.userSubscription.findUniqueOrThrow({ where: { userId } });
    }
  }

  private planCreateData(tier: SubscriptionTier) {
    const value = SUBSCRIPTION_PLANS[tier];
    return { tier, name: value.name, monthlyPrice: value.monthlyPriceUzs, currency: FinanceCurrency.UZS, aiCreditsPerMonth: value.limits.aiMessagesPerMonth, toolActionsPerMonth: value.limits.toolActionsPerMonth, voiceMinutesPerMonth: tier === SubscriptionTier.STARTER ? 30 : tier === SubscriptionTier.PRO ? 300 : 1200, files: value.limits.files, storageMb: value.limits.storageMb, memories: value.limits.memories };
  }

  private async seedPlans() {
    const rows = await Promise.all((Object.keys(SUBSCRIPTION_PLANS) as SubscriptionTier[]).map((tier) => this.prisma.subscriptionPlanConfig.upsert({ where: { tier }, update: {}, create: this.planCreateData(tier) })));
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
  private rowToPlan(row: { tier: SubscriptionTier; name: string; monthlyPrice: number; currency: FinanceCurrency; aiCreditsPerMonth: number; toolActionsPerMonth: number; voiceMinutesPerMonth: number; files: number; storageMb: number; memories: number; isActive: boolean }): EffectivePlan { return { tier: row.tier, name: row.name, monthlyPrice: row.monthlyPrice, currency: row.currency, isActive: row.isActive, limits: { aiCreditsPerMonth: row.aiCreditsPerMonth, toolActionsPerMonth: row.toolActionsPerMonth, voiceMinutesPerMonth: row.voiceMinutesPerMonth, files: row.files, storageMb: row.storageMb, memories: row.memories } }; }
  private snapshotToPlan(value: Prisma.JsonValue, fallbackTier: SubscriptionTier): EffectivePlan { const row = value as unknown as EffectivePlan; return row?.limits ? row : { tier: fallbackTier, name: fallbackTier, monthlyPrice: 0, currency: FinanceCurrency.UZS, isActive: true, limits: { aiCreditsPerMonth: 0, toolActionsPerMonth: 0, voiceMinutesPerMonth: 0, files: 0, storageMb: 0, memories: 0 } }; }
}

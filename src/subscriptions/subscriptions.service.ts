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

  async assertAiAllowed(userId: string) { const info = await this.getForUser(userId); if (!info.canUseAi) throw new ForbiddenException('SUBSCRIPTION_REQUIRED'); if (info.usage.aiCredits.used >= info.usage.aiCredits.limit) throw new ForbiddenException('AI_CREDIT_LIMIT_REACHED'); }
  async assertToolAllowed(userId: string) { const info = await this.getForUser(userId); if (info.usage.toolActions.used >= info.usage.toolActions.limit) throw new ForbiddenException('TOOL_ACTION_LIMIT_REACHED'); }
  async assertVoiceAllowed(userId: string) { const info = await this.getForUser(userId); if (info.usage.voiceMinutes.used >= info.usage.voiceMinutes.limit) throw new ForbiddenException('VOICE_LIMIT_REACHED'); }
  async assertMemoryAllowed(userId: string) { const info = await this.getForUser(userId); if (info.usage.memories.used >= info.usage.memories.limit) throw new ForbiddenException('MEMORY_LIMIT_REACHED'); }
  async assertFileAllowed(userId: string, incomingBytes: number) { const info = await this.getForUser(userId); if (info.usage.files.used >= info.usage.files.limit) throw new ForbiddenException('FILE_LIMIT_REACHED'); if (info.usage.storageMb.used + incomingBytes / 1024 / 1024 > info.usage.storageMb.limit) throw new ForbiddenException('STORAGE_LIMIT_REACHED'); }

  async updatePlan(actorId: string, tier: SubscriptionTier, input: Partial<{ name: string; monthlyPrice: number; currency: FinanceCurrency; aiCreditsPerMonth: number; toolActionsPerMonth: number; voiceMinutesPerMonth: number; files: number; storageMb: number; memories: number; isActive: boolean }>) {
    await this.seedPlans();
    const numeric = ['monthlyPrice','aiCreditsPerMonth','toolActionsPerMonth','voiceMinutesPerMonth','files','storageMb','memories'] as const;
    for (const key of numeric) if (input[key] !== undefined && (!Number.isInteger(input[key]) || Number(input[key]) < 0)) throw new ForbiddenException('INVALID_PLAN_LIMIT');
    return this.prisma.subscriptionPlanConfig.update({ where: { tier }, data: { ...input, name: input.name?.trim(), updatedBy: actorId } }).then((row) => this.rowToPlan(row));
  }

  async assignPlan(_actorId: string, userId: string, tier: SubscriptionTier, status: SubscriptionStatus = SubscriptionStatus.ACTIVE) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    const plan = await this.getPlan(tier);
    const currentPeriodStart = new Date(); const currentPeriodEnd = new Date(currentPeriodStart); currentPeriodEnd.setUTCMonth(currentPeriodEnd.getUTCMonth() + 1);
    return this.prisma.userSubscription.upsert({ where: { userId }, create: { userId, tier, status, currentPeriodStart, currentPeriodEnd, entitlementSnapshot: plan as unknown as Prisma.InputJsonValue }, update: { tier, status, currentPeriodStart, currentPeriodEnd, trialEndsAt: null, entitlementSnapshot: plan as unknown as Prisma.InputJsonValue } });
  }

  private async ensureForUser(userId: string) { const now = new Date(); const trialEndsAt = new Date(now.getTime() + 14 * 86400000); return this.prisma.userSubscription.upsert({ where: { userId }, create: { userId, tier: SubscriptionTier.STARTER, status: SubscriptionStatus.TRIALING, trialEndsAt }, update: {} }); }
  private async seedPlans() { for (const [tier, value] of Object.entries(SUBSCRIPTION_PLANS) as Array<[SubscriptionTier, (typeof SUBSCRIPTION_PLANS)[SubscriptionTier]]>) await this.prisma.subscriptionPlanConfig.upsert({ where: { tier }, update: {}, create: { tier, name: value.name, monthlyPrice: value.monthlyPriceUzs, currency: FinanceCurrency.UZS, aiCreditsPerMonth: value.limits.aiMessagesPerMonth, toolActionsPerMonth: value.limits.toolActionsPerMonth, voiceMinutesPerMonth: tier === SubscriptionTier.STARTER ? 30 : tier === SubscriptionTier.PRO ? 300 : 1200, files: value.limits.files, storageMb: value.limits.storageMb, memories: value.limits.memories } }); }
  private async getPlan(tier: SubscriptionTier) { await this.seedPlans(); const row = await this.prisma.subscriptionPlanConfig.findUniqueOrThrow({ where: { tier } }); return this.rowToPlan(row); }
  private rowToPlan(row: { tier: SubscriptionTier; name: string; monthlyPrice: number; currency: FinanceCurrency; aiCreditsPerMonth: number; toolActionsPerMonth: number; voiceMinutesPerMonth: number; files: number; storageMb: number; memories: number; isActive: boolean }): EffectivePlan { return { tier: row.tier, name: row.name, monthlyPrice: row.monthlyPrice, currency: row.currency, isActive: row.isActive, limits: { aiCreditsPerMonth: row.aiCreditsPerMonth, toolActionsPerMonth: row.toolActionsPerMonth, voiceMinutesPerMonth: row.voiceMinutesPerMonth, files: row.files, storageMb: row.storageMb, memories: row.memories } }; }
  private snapshotToPlan(value: Prisma.JsonValue, fallbackTier: SubscriptionTier): EffectivePlan { const row = value as unknown as EffectivePlan; return row?.limits ? row : { tier: fallbackTier, name: fallbackTier, monthlyPrice: 0, currency: FinanceCurrency.UZS, isActive: true, limits: { aiCreditsPerMonth: 0, toolActionsPerMonth: 0, voiceMinutesPerMonth: 0, files: 0, storageMb: 0, memories: 0 } }; }
}

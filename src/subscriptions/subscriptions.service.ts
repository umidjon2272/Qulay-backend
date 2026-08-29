import { ForbiddenException, Injectable } from '@nestjs/common';
import { FileStatus, MemoryStatus, SubscriptionStatus, SubscriptionTier, UsageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SUBSCRIPTION_PLANS } from './subscription-plans';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  listPlans() {
    return Object.entries(SUBSCRIPTION_PLANS).map(([tier, plan]) => ({ tier, ...plan }));
  }

  async getForUser(userId: string) {
    const subscription = await this.ensureForUser(userId);
    const effective = this.effectiveSubscription(subscription);
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [usageGroups, files, storage, memories] = await Promise.all([
      this.prisma.aiUsage.groupBy({ by: ['type'], where: { userId, createdAt: { gte: monthStart } }, _count: { _all: true } }),
      this.prisma.userFile.count({ where: { userId, status: { not: FileStatus.DELETED } } }),
      this.prisma.userFile.aggregate({ where: { userId, status: { not: FileStatus.DELETED } }, _sum: { sizeBytes: true } }),
      this.prisma.userMemory.count({ where: { userId, status: MemoryStatus.ACTIVE } }),
    ]);
    const text = usageGroups.find((item) => item.type === UsageType.TEXT)?._count._all ?? 0;
    const tools = usageGroups.find((item) => item.type === UsageType.TOOL)?._count._all ?? 0;
    const limits = SUBSCRIPTION_PLANS[effective.tier].limits;
    return {
      ...subscription,
      effectiveTier: effective.tier,
      trialActive: effective.trialActive,
      canUseAi: effective.canUseAi,
      plan: SUBSCRIPTION_PLANS[effective.tier],
      usage: {
        aiMessages: { used: text, limit: limits.aiMessagesPerMonth },
        toolActions: { used: tools, limit: limits.toolActionsPerMonth },
        files: { used: files, limit: limits.files },
        storageMb: { used: Number(storage._sum.sizeBytes ?? 0n) / 1024 / 1024, limit: limits.storageMb },
        memories: { used: memories, limit: limits.memories },
      },
    };
  }

  async assertAiAllowed(userId: string): Promise<void> {
    const info = await this.getForUser(userId);
    if (!info.canUseAi) throw new ForbiddenException('Sinov muddati tugagan. AI’dan foydalanish uchun tarifni faollashtiring.');
    if (info.usage.aiMessages.used >= info.usage.aiMessages.limit) throw new ForbiddenException('Oylik AI xabarlar limiti tugadi.');
  }

  async assertMemoryAllowed(userId: string): Promise<void> {
    const info = await this.getForUser(userId);
    if (info.usage.memories.used >= info.usage.memories.limit) throw new ForbiddenException('Xotira limiti tugadi.');
  }

  async assertFileAllowed(userId: string, incomingBytes: number): Promise<void> {
    const info = await this.getForUser(userId);
    if (info.usage.files.used >= info.usage.files.limit) throw new ForbiddenException('Fayllar limiti tugadi.');
    if (info.usage.storageMb.used + incomingBytes / 1024 / 1024 > info.usage.storageMb.limit) throw new ForbiddenException('Fayl saqlash hajmi limiti tugadi.');
  }

  private async ensureForUser(userId: string) {
    const trialDays = 14;
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    return this.prisma.userSubscription.upsert({
      where: { userId },
      create: { userId, tier: SubscriptionTier.STARTER, status: SubscriptionStatus.TRIALING, trialEndsAt },
      update: {},
    });
  }

  private effectiveSubscription(subscription: { tier: SubscriptionTier; status: SubscriptionStatus; trialEndsAt: Date | null }) {
    const trialActive = subscription.status === SubscriptionStatus.TRIALING && Boolean(subscription.trialEndsAt && subscription.trialEndsAt > new Date());
    if (trialActive) return { tier: SubscriptionTier.PRO, trialActive: true, canUseAi: true };
    const canUseAi = subscription.status === SubscriptionStatus.ACTIVE || subscription.tier === SubscriptionTier.STARTER;
    return { tier: subscription.tier, trialActive: false, canUseAi };
  }
}

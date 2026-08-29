import { SubscriptionTier } from '@prisma/client';

export type PlanLimits = {
  aiMessagesPerMonth: number;
  toolActionsPerMonth: number;
  files: number;
  storageMb: number;
  memories: number;
};

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, {
  name: string;
  monthlyPriceUzs: number;
  limits: PlanLimits;
}> = {
  STARTER: {
    name: 'Starter',
    monthlyPriceUzs: 0,
    limits: { aiMessagesPerMonth: 100, toolActionsPerMonth: 250, files: 25, storageMb: 1_000, memories: 200 },
  },
  PRO: {
    name: 'Pro',
    monthlyPriceUzs: 199_000,
    limits: { aiMessagesPerMonth: 2_000, toolActionsPerMonth: 5_000, files: 500, storageMb: 20_000, memories: 5_000 },
  },
  BUSINESS: {
    name: 'Business',
    monthlyPriceUzs: 499_000,
    limits: { aiMessagesPerMonth: 10_000, toolActionsPerMonth: 25_000, files: 5_000, storageMb: 100_000, memories: 25_000 },
  },
};

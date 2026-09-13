import { SubscriptionTier } from '@prisma/client';

export type SubscriptionFeature =
  | 'AI_CHAT'
  | 'TASKS'
  | 'REMINDERS'
  | 'CALENDAR'
  | 'GOOGLE'
  | 'TELEGRAM'
  | 'BITO'
  | 'TELEGRAM_SALES'
  | 'WHATSAPP_SALES';

export type PlanLimits = {
  aiCreditsPerMonth: number;
  toolActionsPerMonth: number;
  voiceMinutesPerMonth: number;
  files: number;
  storageMb: number;
  memories: number;
};

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, {
  name: string;
  monthlyPriceUzs: number;
  limits: PlanLimits;
  features: SubscriptionFeature[];
}> = {
  STARTER: {
    name: 'Start',
    monthlyPriceUzs: 49_000,
    limits: { aiCreditsPerMonth: 800, toolActionsPerMonth: 250, voiceMinutesPerMonth: 20, files: 25, storageMb: 1_000, memories: 200 },
    features: ['AI_CHAT', 'TASKS', 'REMINDERS', 'CALENDAR'],
  },
  PRO: {
    name: 'Pro',
    monthlyPriceUzs: 89_000,
    limits: { aiCreditsPerMonth: 2_500, toolActionsPerMonth: 5_000, voiceMinutesPerMonth: 90, files: 500, storageMb: 20_000, memories: 5_000 },
    features: ['AI_CHAT', 'TASKS', 'REMINDERS', 'CALENDAR', 'GOOGLE', 'TELEGRAM'],
  },
  BUSINESS: {
    name: 'Business',
    monthlyPriceUzs: 149_000,
    limits: { aiCreditsPerMonth: 5_000, toolActionsPerMonth: 25_000, voiceMinutesPerMonth: 180, files: 5_000, storageMb: 100_000, memories: 25_000 },
    features: ['AI_CHAT', 'TASKS', 'REMINDERS', 'CALENDAR', 'GOOGLE', 'TELEGRAM', 'BITO'],
  },
  SALES_AI: {
    name: 'Sales AI',
    monthlyPriceUzs: 199_000,
    limits: { aiCreditsPerMonth: 8_000, toolActionsPerMonth: 25_000, voiceMinutesPerMonth: 300, files: 5_000, storageMb: 100_000, memories: 25_000 },
    features: ['AI_CHAT', 'TASKS', 'REMINDERS', 'CALENDAR', 'GOOGLE', 'TELEGRAM', 'BITO', 'TELEGRAM_SALES', 'WHATSAPP_SALES'],
  },
};

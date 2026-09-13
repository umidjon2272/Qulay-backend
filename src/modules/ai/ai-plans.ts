// Legacy compatibility constants. Runtime subscription enforcement lives in
// src/subscriptions; keep this file aligned so no stale FREE/demo tariff leaks
// into future modules.
export const AI_PLANS = {
  START: { tier: 'ASSISTANT', credits: 800, reset: 'subscription_period' },
  PRO: { tier: 'ASSISTANT_PLUS', credits: 2500, reset: 'subscription_period' },
  BUSINESS: { tier: 'ANALYST', credits: 5000, reset: 'subscription_period' },
  SALES_AI: { tier: 'SALES_AGENT', credits: 8000, reset: 'subscription_period' },
} as const;

export const CREDIT_COST = {
  TOKENS_PER_CREDIT: 1000,
} as const;

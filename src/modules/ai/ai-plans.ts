export const AI_PLANS = {
  FREE: { tier: 'DEMO', credits: 20, reset: 'never' },
  STARTER: { tier: 'ASSISTANT', credits: 250, reset: 'monthly' },
  BUSINESS: { tier: 'ANALYST', credits: 1200, reset: 'monthly' },
  PROFESSIONAL: { tier: 'AGENT', credits: 4000, reset: 'monthly' },
  ENTERPRISE: { tier: 'CUSTOM', credits: null, reset: 'custom' },
} as const;

export const CREDIT_COST = {
  SIMPLE_QUESTION: 1,
  LOOKUP: 2,
  BASIC_ANALYSIS: 5,
  DEEP_ANALYSIS: 10,
  AGENT_ACTION_MIN: 10,
  AGENT_ACTION_MAX: 20,
  BULK_ACTION_MIN: 20,
  BULK_ACTION_MAX: 40,
} as const;

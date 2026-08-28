/** Single source of truth for rate-limit and lockout thresholds, so admin-facing reporting never drifts from what is actually enforced. */
export const SECURITY_LIMITS = {
  globalPerIp: { max: 240, windowMs: 60 * 1000 },
  loginPerIp: { max: 30, windowMs: 15 * 60 * 1000 },
  loginPerEmail: { max: 15, windowMs: 15 * 60 * 1000 },
  registerPerIp: { max: 10, windowMs: 10 * 60 * 1000 },
  registerPerEmail: { max: 3, windowMs: 60 * 60 * 1000 },
  passwordReset: { max: 5, windowMs: 15 * 60 * 1000 },
  passwordResetToken: { max: 5, windowMs: 15 * 60 * 1000 },
  passwordResetIpToken: { max: 20, windowMs: 15 * 60 * 1000 },
  loginBruteForce: { maxFailures: 5, failureWindowMs: 10 * 60 * 1000, lockMs: 15 * 60 * 1000 },
} as const;

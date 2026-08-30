/**
 * Stable, machine-readable error codes for exception bodies. Pass one via
 * `throw new BadRequestException({ code: APP_ERROR_CODES.X, message: 'fallback english/uzbek text' })`.
 * The frontend maps `code` to a localized (uz/ru) message; the `message` here is only
 * a fallback for clients that don't recognize the code yet. Unmigrated throw sites
 * (a plain string or object without `code`) are not broken — ProductionExceptionFilter
 * stamps them with GENERIC_ERROR automatically.
 */
export const APP_ERROR_CODES = {
  GENERIC_ERROR: 'GENERIC_ERROR',
  CURRENT_PASSWORD_INVALID: 'CURRENT_PASSWORD_INVALID',
  PASSWORD_SAME_AS_CURRENT: 'PASSWORD_SAME_AS_CURRENT',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
  RESET_TOKEN_INVALID: 'RESET_TOKEN_INVALID',
  CONTACT_NOT_FOUND: 'CONTACT_NOT_FOUND',
  MEMORY_KEY_CONFLICT: 'MEMORY_KEY_CONFLICT',
  MEMORY_DISABLED: 'MEMORY_DISABLED',
  FINANCE_CURRENCY_AMBIGUOUS: 'FINANCE_CURRENCY_AMBIGUOUS',
  FINANCE_ACCOUNT_CURRENCY_MISMATCH: 'FINANCE_ACCOUNT_CURRENCY_MISMATCH',
} as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[keyof typeof APP_ERROR_CODES];

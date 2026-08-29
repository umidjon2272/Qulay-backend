import * as Joi from 'joi';

const telegramEnvKeys = [
  'TELEGRAM_API_ID',
  'TELEGRAM_API_HASH',
  'TELEGRAM_SESSION_ENCRYPTION_KEY',
] as const;

const googleEnvKeys = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_TOKEN_ENCRYPTION_KEY',
] as const;

function validateOptionalIntegrationGroup(
  value: Record<string, unknown>,
  keys: readonly string[],
  integration: string,
  helpers: Joi.CustomHelpers,
): Record<string, unknown> | Joi.ErrorReport {
  const configured = keys.some((key) => value[key] !== undefined);
  if (!configured) return value;

  const missing = keys.filter((key) => value[key] === undefined);
  if (missing.length > 0) {
    return helpers.error(`integration.${integration}.partial`, { missing: missing.join(', ') });
  }
  return value;
}

export const envValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().min(1).required(),
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  TRUST_PROXY: Joi.boolean().truthy('true').falsy('false').default(false),
  REQUEST_BODY_LIMIT: Joi.string().pattern(/^\d+(kb|mb)$/i).default('1mb'),
  JWT_ACCESS_SECRET: Joi.string().min(64).pattern(/^[\x21-\x7e]+$/).required(),
  JWT_REFRESH_SECRET: Joi.string().min(64).pattern(/^[\x21-\x7e]+$/).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().min(1).default('30d'),
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(14).default(12),
  AUTH_TIMING_LOGS: Joi.boolean().truthy('true').falsy('false').default(false),
  PASSWORD_RESET_EXPIRES_MINUTES: Joi.number().integer().min(15).max(30).default(30),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  FRONTEND_URL: Joi.string().min(1).required(),

  // External integrations are opt-in. Their group-level completeness is checked below.
  TELEGRAM_API_ID: Joi.number().integer().positive().optional(),
  TELEGRAM_API_HASH: Joi.string().min(1).optional(),
  TELEGRAM_SESSION_ENCRYPTION_KEY: Joi.string().pattern(/^[a-fA-F0-9]{64}$/).optional(),
  GOOGLE_CLIENT_ID: Joi.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: Joi.string().uri().optional(),
  GOOGLE_TOKEN_ENCRYPTION_KEY: Joi.string().pattern(/^[a-fA-F0-9]{64}$/).optional(),
  OPENAI_API_KEY: Joi.string().min(20).optional(),
  OPENAI_MODEL: Joi.string().min(1).default('gpt-5-mini'),
  OPENAI_BASE_URL: Joi.string().uri().default('https://api.openai.com/v1'),
  AI_TIMEOUT_MS: Joi.number().integer().min(5000).max(120000).default(45000),
  EMAIL_PROVIDER: Joi.string().lowercase().valid('noop', 'resend').default('noop'),
  RESEND_API_KEY: Joi.string().min(10).optional(),
  EMAIL_FROM: Joi.string().min(3).optional(),
  SENTRY_DSN: Joi.string().uri().optional(),
  NOTIFICATION_CRON_SECRET: Joi.string().min(32).optional(),

  FILE_STORAGE_PROVIDER: Joi.string().lowercase().valid('local', 's3').default('local'),
  FILE_STORAGE_LOCAL_PATH: Joi.string().min(1).default('./uploads'),
  FILE_MAX_SIZE_MB: Joi.number().integer().min(1).max(1024).default(20),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_REGION: Joi.string().optional(),
  S3_BUCKET: Joi.string().optional(),
  S3_ACCESS_KEY_ID: Joi.string().optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().optional(),
}).custom((value, helpers) => {
  const telegramResult = validateOptionalIntegrationGroup(value, telegramEnvKeys, 'telegram', helpers);
  if (telegramResult !== value) return telegramResult;

  const googleResult = validateOptionalIntegrationGroup(value, googleEnvKeys, 'google', helpers);
  if (googleResult !== value) return googleResult;

  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) return helpers.error('jwt.secrets.same');
  if (value.NODE_ENV === 'production' && value.AUTH_TIMING_LOGS) return helpers.error('auth.timing.production');
  if (value.EMAIL_PROVIDER === 'resend' && (!value.RESEND_API_KEY || !value.EMAIL_FROM)) return helpers.error('email.resend.missing');
  if (value.FILE_STORAGE_PROVIDER === 's3' && (!value.S3_ENDPOINT || !value.S3_BUCKET || !value.S3_ACCESS_KEY_ID || !value.S3_SECRET_ACCESS_KEY)) return helpers.error('storage.s3.missing');
  return value;
}).messages({
  'integration.telegram.partial': 'Telegram integration requires all of: TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION_ENCRYPTION_KEY. Missing: {{#missing}}',
  'integration.google.partial': 'Google integration requires all of: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GOOGLE_TOKEN_ENCRYPTION_KEY. Missing: {{#missing}}',
  'jwt.secrets.same': 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
  'auth.timing.production': 'AUTH_TIMING_LOGS must be disabled in production',
  'email.resend.missing': 'EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM',
  'storage.s3.missing': 'FILE_STORAGE_PROVIDER=s3 requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
});

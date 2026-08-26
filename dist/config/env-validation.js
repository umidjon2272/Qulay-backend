"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envValidationSchema = void 0;
const Joi = require("joi");
const telegramEnvKeys = [
    'TELEGRAM_API_ID',
    'TELEGRAM_API_HASH',
    'TELEGRAM_SESSION_ENCRYPTION_KEY',
];
const googleEnvKeys = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'GOOGLE_TOKEN_ENCRYPTION_KEY',
];
function validateOptionalIntegrationGroup(value, keys, integration, helpers) {
    const configured = keys.some((key) => value[key] !== undefined);
    if (!configured)
        return value;
    const missing = keys.filter((key) => value[key] === undefined);
    if (missing.length > 0) {
        return helpers.error(`integration.${integration}.partial`, { missing: missing.join(', ') });
    }
    return value;
}
exports.envValidationSchema = Joi.object({
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
    TELEGRAM_API_ID: Joi.number().integer().positive().optional(),
    TELEGRAM_API_HASH: Joi.string().min(1).optional(),
    TELEGRAM_SESSION_ENCRYPTION_KEY: Joi.string().pattern(/^[a-fA-F0-9]{64}$/).optional(),
    GOOGLE_CLIENT_ID: Joi.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: Joi.string().min(1).optional(),
    GOOGLE_REDIRECT_URI: Joi.string().uri().optional(),
    GOOGLE_TOKEN_ENCRYPTION_KEY: Joi.string().pattern(/^[a-fA-F0-9]{64}$/).optional(),
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
    if (telegramResult !== value)
        return telegramResult;
    const googleResult = validateOptionalIntegrationGroup(value, googleEnvKeys, 'google', helpers);
    if (googleResult !== value)
        return googleResult;
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET)
        return helpers.error('jwt.secrets.same');
    if (value.NODE_ENV === 'production' && value.AUTH_TIMING_LOGS)
        return helpers.error('auth.timing.production');
    return value;
}).messages({
    'integration.telegram.partial': 'Telegram integration requires all of: TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION_ENCRYPTION_KEY. Missing: {{#missing}}',
    'integration.google.partial': 'Google integration requires all of: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GOOGLE_TOKEN_ENCRYPTION_KEY. Missing: {{#missing}}',
    'jwt.secrets.same': 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    'auth.timing.production': 'AUTH_TIMING_LOGS must be disabled in production',
});
//# sourceMappingURL=env-validation.js.map
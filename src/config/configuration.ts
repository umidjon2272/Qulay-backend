export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  trustProxy: process.env.TRUST_PROXY === 'true',
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT ?? '1mb',
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },
  bcryptSaltRounds: Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
  authTimingLogs: process.env.NODE_ENV !== 'production' && process.env.AUTH_TIMING_LOGS === 'true',
  passwordResetExpiresMinutes: Number.parseInt(process.env.PASSWORD_RESET_EXPIRES_MINUTES ?? '30', 10),
  storage: {
    provider: (process.env.FILE_STORAGE_PROVIDER ?? 'local').toUpperCase(),
    localPath: process.env.FILE_STORAGE_LOCAL_PATH ?? './uploads',
    maxSizeBytes: Number.parseInt(process.env.FILE_MAX_SIZE_MB ?? '20', 10) * 1024 * 1024,
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      bucket: process.env.S3_BUCKET,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  },
  telegram: {
    apiId: Number.parseInt(process.env.TELEGRAM_API_ID ?? '0', 10),
    apiHash: process.env.TELEGRAM_API_HASH,
    sessionEncryptionKey: process.env.TELEGRAM_SESSION_ENCRYPTION_KEY,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    tokenEncryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  },
});

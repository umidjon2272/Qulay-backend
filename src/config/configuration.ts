function inferBitoRedirectUri(): string | undefined {
  if (process.env.BITO_OAUTH_REDIRECT_URI) return process.env.BITO_OAUTH_REDIRECT_URI;
  const google = process.env.GOOGLE_REDIRECT_URI;
  if (!google) return undefined;
  try {
    const url = new URL(google);
    const nextPath = url.pathname.replace(/\/integrations\/google\/callback\/?$/, '/integrations/bito/callback');
    if (nextPath === url.pathname) return undefined;
    url.pathname = nextPath;
    return url.toString();
  } catch {
    return undefined;
  }
}


function inferInstagramRedirectUri(): string | undefined {
  if (process.env.INSTAGRAM_OAUTH_REDIRECT_URI) return process.env.INSTAGRAM_OAUTH_REDIRECT_URI;
  for (const candidate of [process.env.BITO_OAUTH_REDIRECT_URI, process.env.GOOGLE_REDIRECT_URI]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const nextPath = url.pathname.replace(/\/integrations\/(?:bito|google)\/callback\/?$/, '/integrations/instagram/callback');
      if (nextPath === url.pathname) continue;
      url.pathname = nextPath;
      return url.toString();
    } catch {
      // Ignore malformed optional fallback URLs; env validation handles explicit values.
    }
  }
  return undefined;
}

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  trustProxy: process.env.TRUST_PROXY === 'true' || process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID),
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT ?? '1mb',
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  deploymentVersion: (process.env.RENDER_GIT_COMMIT ?? process.env.DEPLOYMENT_VERSION ?? process.env.npm_package_version ?? 'unknown').slice(0, 12),
  frontendUrl: process.env.FRONTEND_URL,
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
    configured: [process.env.TELEGRAM_API_ID, process.env.TELEGRAM_API_HASH, process.env.TELEGRAM_SESSION_ENCRYPTION_KEY].every(Boolean),
    apiId: process.env.TELEGRAM_API_ID === undefined ? undefined : Number.parseInt(process.env.TELEGRAM_API_ID, 10),
    apiHash: process.env.TELEGRAM_API_HASH,
    sessionEncryptionKey: process.env.TELEGRAM_SESSION_ENCRYPTION_KEY,
    loginDiagnosticEnabled: process.env.TELEGRAM_LOGIN_DIAGNOSTIC_ENABLED === 'true',
    testPhone: process.env.TEST_TELEGRAM_PHONE,
  },
  google: {
    configured: [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI, process.env.GOOGLE_TOKEN_ENCRYPTION_KEY].every(Boolean),
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    tokenEncryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  },
  whatsapp: {
    configured: [process.env.WHATSAPP_APP_SECRET, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY].every(Boolean),
    appId: process.env.WHATSAPP_APP_ID,
    embeddedSignupConfigId: process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    tokenEncryptionKey: process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY,
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v24.0',
  },
  instagram: {
    // Manual/legacy Instagram connections can reuse the existing Meta app
    // security values. Instagram Business Login itself has a dedicated
    // Instagram App ID/Secret, so one-click OAuth requires explicit credentials.
    configured: [
      process.env.INSTAGRAM_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET,
      process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ?? process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY,
    ].every(Boolean),
    appId: process.env.INSTAGRAM_APP_ID ?? process.env.WHATSAPP_APP_ID,
    appSecret: process.env.INSTAGRAM_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET,
    webhookVerifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    tokenEncryptionKey: process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ?? process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY,
    oauthRedirectUri: inferInstagramRedirectUri(),
    oauthReady: [
      process.env.INSTAGRAM_APP_ID,
      process.env.INSTAGRAM_APP_SECRET,
      inferInstagramRedirectUri(),
      process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ?? process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY,
    ].every(Boolean),
    oauthAuthorizationUrl: process.env.INSTAGRAM_OAUTH_AUTHORIZATION_URL ?? 'https://www.instagram.com/oauth/authorize',
    oauthTokenUrl: process.env.INSTAGRAM_OAUTH_TOKEN_URL ?? 'https://api.instagram.com/oauth/access_token',
    oauthLongLivedTokenUrl: process.env.INSTAGRAM_OAUTH_LONG_LIVED_TOKEN_URL ?? 'https://graph.instagram.com/access_token',
    graphApiVersion: process.env.INSTAGRAM_GRAPH_API_VERSION ?? process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v24.0',
    graphBaseUrl: process.env.INSTAGRAM_GRAPH_BASE_URL ?? 'https://graph.facebook.com',
    loginGraphBaseUrl: process.env.INSTAGRAM_LOGIN_GRAPH_BASE_URL ?? 'https://graph.instagram.com',
    devCommentPollEnabled: process.env.INSTAGRAM_DEV_COMMENT_POLL_ENABLED === 'true',
    devCommentPollIntervalMs: Number.parseInt(process.env.INSTAGRAM_DEV_COMMENT_POLL_INTERVAL_MS ?? '60000', 10),
  },
  bito: {
    debugShapes: process.env.BITO_DEBUG_SHAPES === 'true',
    credentialEncryptionKey: process.env.BITO_CREDENTIAL_ENCRYPTION_KEY,
    serverUrl: process.env.BITO_MCP_SERVER_URL ?? 'https://mcp.bito.online',
    allowedHosts: (process.env.BITO_MCP_ALLOWED_HOSTS ?? 'mcp.bito.online,.bito.online').split(',').map((value) => value.trim()).filter(Boolean),
    timeoutMs: Number.parseInt(process.env.BITO_MCP_TIMEOUT_MS ?? '15000', 10),
    oauthRedirectUri: inferBitoRedirectUri(),
    oauthClientId: process.env.BITO_OAUTH_CLIENT_ID,
    oauthClientSecret: process.env.BITO_OAUTH_CLIENT_SECRET,
  },
  ai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
    transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe',
    visionModel: process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-5-mini',
    ttsModel: process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
    ttsVoice: process.env.OPENAI_TTS_VOICE ?? 'coral',
    realtimeModel: process.env.OPENAI_REALTIME_MODEL,
    realtimeVoice: process.env.OPENAI_REALTIME_VOICE ?? 'marin',
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    timeoutMs: Number.parseInt(process.env.AI_TIMEOUT_MS ?? '45000', 10),
  },
  email: {
    provider: (process.env.EMAIL_PROVIDER ?? 'noop').toLowerCase(),
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
  },
  monitoring: { sentryDsn: process.env.SENTRY_DSN },
  webPush: { subject: process.env.WEB_PUSH_SUBJECT, publicKey: process.env.WEB_PUSH_PUBLIC_KEY, privateKey: process.env.WEB_PUSH_PRIVATE_KEY },
  notificationCronSecret: process.env.NOTIFICATION_CRON_SECRET,
  agentCronSecret: process.env.AGENT_CRON_SECRET ?? process.env.NOTIFICATION_CRON_SECRET,
});

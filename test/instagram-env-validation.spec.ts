import { envValidationSchema } from '../src/config/env-validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@example.com:5432/db',
  NODE_ENV: 'test',
  FRONTEND_URL: 'https://qulay-ai.vercel.app',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
};

describe('Instagram environment validation', () => {
  it('allows Instagram OAuth credentials to reuse existing WhatsApp webhook/encryption security values', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      WHATSAPP_APP_SECRET: 'whatsapp-secret',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'whatsapp-webhook-verify-token',
      WHATSAPP_TOKEN_ENCRYPTION_KEY: '1'.repeat(64),
      INSTAGRAM_APP_ID: '1234567890',
      INSTAGRAM_APP_SECRET: 'instagram-secret',
      INSTAGRAM_OAUTH_REDIRECT_URI: 'https://api.example.com/api/integrations/instagram/callback',
    });

    expect(result.error).toBeUndefined();
  });

  it('rejects a one-click Instagram OAuth App ID without its matching Instagram App Secret', () => {
    const result = envValidationSchema.validate({
      ...baseEnv,
      WHATSAPP_APP_SECRET: 'whatsapp-secret',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'whatsapp-webhook-verify-token',
      WHATSAPP_TOKEN_ENCRYPTION_KEY: '1'.repeat(64),
      INSTAGRAM_APP_ID: '1234567890',
      INSTAGRAM_OAUTH_REDIRECT_URI: 'https://api.example.com/api/integrations/instagram/callback',
    });

    expect(result.error?.message).toContain('INSTAGRAM_APP_ID');
  });
});

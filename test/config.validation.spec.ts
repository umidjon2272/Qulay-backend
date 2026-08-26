import { envValidationSchema } from '../src/config/env-validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://postgres@localhost:5432/qulay_ai',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  FRONTEND_URL: 'https://app.example.com',
};

describe('environment validation', () => {
  it('accepts the required foundation without optional integrations', () => {
    const result = envValidationSchema.validate(baseEnv);
    expect(result.error).toBeUndefined();
  });

  it('requires all variables in an integration group when one is supplied', () => {
    const telegram = envValidationSchema.validate({ ...baseEnv, TELEGRAM_API_ID: 12345 });
    const google = envValidationSchema.validate({ ...baseEnv, GOOGLE_CLIENT_ID: 'client-id' });

    expect(telegram.error?.message).toContain('TELEGRAM_API_HASH');
    expect(google.error?.message).toContain('GOOGLE_CLIENT_SECRET');
  });

  it('keeps the JWT minimum and foundation URLs required', () => {
    expect(envValidationSchema.validate({ ...baseEnv, JWT_ACCESS_SECRET: 'short' }).error).toBeDefined();
    expect(envValidationSchema.validate({ ...baseEnv, FRONTEND_URL: undefined }).error).toBeDefined();
  });
});

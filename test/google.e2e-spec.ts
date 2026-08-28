import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { GoogleAuthService } from '../src/google/google-auth.service';
import { GoogleAdapterError } from '../src/google/google.errors';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationWorkerService } from '../src/notifications/notification-worker.service';

describe('Google integration API security', () => {
  let app: INestApplication;
  const googleAuth = {
    connectUrl: jest.fn(), status: jest.fn(), disconnect: jest.fn(),
    callback: jest.fn(async (_code?: string, state?: string, error?: string) => {
      if (error) throw new GoogleAdapterError('OAUTH_CANCELLED');
      if (!state || state !== 'valid-signed-state') throw new GoogleAdapterError('INVALID_STATE');
    }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleAuthService).useValue(googleAuth)
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(NotificationWorkerService).useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('blocks unauthenticated Google endpoints and accepts no raw token response', async () => {
    await request(app.getHttpServer()).get('/api/integrations/google/connect-url').expect(401);
    await request(app.getHttpServer()).get('/api/integrations/google/status').expect(401);
  });

  it('accepts Google callback metadata but passes only trusted callback inputs to auth handling', async () => {
    await request(app.getHttpServer())
      .get('/api/integrations/google/callback')
      .query({ code: 'oauth-code', state: 'valid-signed-state', scope: 'openid email calendar', iss: 'https://accounts.google.com', authuser: '0', prompt: 'consent' })
      .expect(302)
      .expect('Location', 'http://localhost:5173/settings?tab=integrations&integration=google&status=connected');

    expect(googleAuth.callback).toHaveBeenLastCalledWith('oauth-code', 'valid-signed-state', undefined);
  });

  it.each([undefined, 'invalid-state'])('redirects a missing or invalid signed state as invalid', async (state) => {
    const query: Record<string, string> = { code: 'oauth-code' };
    if (state) query.state = state;
    await request(app.getHttpServer())
      .get('/api/integrations/google/callback').query(query)
      .expect(302)
      .expect('Location', 'http://localhost:5173/settings?tab=integrations&integration=google&status=error&reason=invalid');
  });

  it('handles a Google error callback cleanly, including error_description metadata', async () => {
    await request(app.getHttpServer())
      .get('/api/integrations/google/callback')
      .query({ error: 'access_denied', error_description: 'The user denied access', state: 'valid-signed-state' })
      .expect(302)
      .expect('Location', 'http://localhost:5173/settings?tab=integrations&integration=google&status=error&reason=cancelled');
  });

  it('ignores arbitrary provider metadata without treating it as callback application input', async () => {
    await request(app.getHttpServer())
      .get('/api/integrations/google/callback')
      .query({ code: 'oauth-code', state: 'valid-signed-state', random_google_metadata: 'ignored', hd: 'example.com', redirect_uri: 'https://evil.example/callback' })
      .expect(302)
      .expect('Location', 'http://localhost:5173/settings?tab=integrations&integration=google&status=connected');
    expect(googleAuth.callback).toHaveBeenLastCalledWith('oauth-code', 'valid-signed-state', undefined);
  });

  it('handles a missing authorization code through the safe callback error redirect', async () => {
    googleAuth.callback.mockRejectedValueOnce(new GoogleAdapterError('INVALID_REQUEST'));
    await request(app.getHttpServer())
      .get('/api/integrations/google/callback')
      .query({ state: 'valid-signed-state', authuser: '0', prompt: 'none' })
      .expect(302)
      .expect('Location', 'http://localhost:5173/settings?tab=integrations&integration=google&status=error&reason=invalid');
    expect(googleAuth.callback).toHaveBeenLastCalledWith(undefined, 'valid-signed-state', undefined);
  });
});

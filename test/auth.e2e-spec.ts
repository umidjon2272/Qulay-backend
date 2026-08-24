import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Foundation and auth API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `auth-test-${Date.now()}@example.com`;
  const password = 'StrongPassword123!';
  let userId: string;
  let accessToken: string;
  let refreshToken: string;
  let concurrentUserId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    if (concurrentUserId) {
      await prisma.user.delete({ where: { id: concurrentUserId } }).catch(() => undefined);
    }
    await app.close();
  });

  it('returns health status', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200).expect({ status: 'ok' });
  });

  it('registers a user and never returns passwordHash', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: `  ${email.toUpperCase()}  `, password, firstName: 'Ali', lastName: 'Valiyev' })
      .expect(201);

    expect(response.body.user.email).toBe(email);
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    userId = response.body.user.id;
    accessToken = response.body.accessToken;
    refreshToken = response.body.refreshToken;
  });

  it('rejects duplicate registration', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, firstName: 'Ali', lastName: 'Valiyev' })
      .expect(409);
  });

  it('logs in and rejects a wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    expect(response.body.user.passwordHash).toBeUndefined();

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword123!' })
      .expect(401);
  });

  it('returns the current user from an access token', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(userId);
        expect(response.body.passwordHash).toBeUndefined();
      });
  });

  it('rotates refresh tokens and revokes the old token', async () => {
    const oldRefreshToken = refreshToken;
    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(200);
    expect(response.body.refreshToken).not.toBe(refreshToken);
    accessToken = response.body.accessToken;
    refreshToken = response.body.refreshToken;

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);
  });

  it('allows only one concurrent rotation for the same refresh token', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `auth-concurrent-${Date.now()}@example.com`,
        password,
        firstName: 'Race',
        lastName: 'Test',
      })
      .expect(201);
    concurrentUserId = registration.body.user.id;

    const results = await Promise.all([
      request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: registration.body.refreshToken }),
      request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: registration.body.refreshToken }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
  });

  it('logs out by revoking the current refresh token', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('blocks a blocked user from logging in and using an access token', async () => {
    await prisma.user.update({ where: { id: userId }, data: { status: UserStatus.BLOCKED } });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });
});

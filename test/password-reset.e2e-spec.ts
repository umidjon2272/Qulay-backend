import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { EMAIL_DELIVERY_ADAPTER, PasswordResetEmail } from '../src/auth/password-reset/email-delivery.adapter';
import { createHash } from 'node:crypto';
import request = require('supertest');

describe('Password reset API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const delivered: PasswordResetEmail[] = [];
  const email = `password-reset-${Date.now()}@example.com`;
  const oldPassword = 'OldStrongPassword123!';
  const newPassword = 'NewStrongPassword123!';
  let userId: string;
  let firstRefreshToken: string;
  let secondRefreshToken: string;

  beforeAll(async () => {
    const emailAdapter = {
      sendPasswordResetEmail: jest.fn(async (input: PasswordResetEmail) => { delivered.push(input); }),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_DELIVERY_ADAPTER)
      .useValue(emailAdapter)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    prisma = app.get(PrismaService);
    await app.init();

    const registration = await request(app.getHttpServer()).post('/api/auth/register').send({
      email, password: oldPassword, firstName: 'Reset', lastName: 'Test',
    }).expect(201);
    userId = registration.body.user.id;
    firstRefreshToken = registration.body.refreshToken;
    const secondLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: oldPassword }).expect(200);
    secondRefreshToken = secondLogin.body.refreshToken;
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  });

  it('returns the same generic response for existing and unknown emails', async () => {
    const existing = await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email }).expect(200);
    const unknown = await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: 'unknown-reset@example.com' }).expect(200);
    expect(existing.body).toEqual({ success: true, message: 'Agar bu email ro‘yxatdan o‘tgan bo‘lsa, parolni tiklash ko‘rsatmasi yuboriladi.' });
    expect(unknown.body).toEqual(existing.body);
    expect(delivered).toHaveLength(1);
  });

  it('resets the password, revokes sessions, and makes the token single-use', async () => {
    const rawToken = new URL(delivered[0].resetUrl).searchParams.get('token');
    expect(rawToken).toBeTruthy();
    await request(app.getHttpServer()).post('/api/auth/reset-password').send({ token: rawToken, newPassword, confirmPassword: newPassword }).expect(200).expect({ success: true, message: 'Parol muvaffaqiyatli yangilandi.' });

    await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: oldPassword }).expect(401);
    const loginWithNewPassword = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: newPassword }).expect(200);
    expect(loginWithNewPassword.body.user.passwordHash).toBeUndefined();
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: firstRefreshToken }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: secondRefreshToken }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/reset-password').send({ token: rawToken, newPassword: 'AnotherStrongPassword123!', confirmPassword: 'AnotherStrongPassword123!' }).expect(400);
  });

  it('rejects invalid, expired and invalid form submissions', async () => {
    await request(app.getHttpServer()).post('/api/auth/reset-password').send({ token: 'not-a-real-token', newPassword, confirmPassword: newPassword }).expect(400);
    await request(app.getHttpServer()).post('/api/auth/reset-password').send({ token: 'not-a-real-token', newPassword, confirmPassword: 'DifferentPassword123!' }).expect(400);
    await request(app.getHttpServer()).post('/api/auth/reset-password').send({ token: 'not-a-real-token', newPassword: 'short', confirmPassword: 'short' }).expect(400);

    await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email }).expect(200);
    const rawToken = new URL(delivered.at(-1)?.resetUrl ?? '').searchParams.get('token');
    const fingerprint = createHash('sha256').update(rawToken ?? '').digest('hex');
    const storedToken = await prisma.passwordResetToken.findFirstOrThrow({ where: { tokenFingerprint: fingerprint } });
    await prisma.passwordResetToken.update({ where: { id: storedToken.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await request(app.getHttpServer()).post('/api/auth/reset-password').send({ token: rawToken, newPassword, confirmPassword: newPassword }).expect(400);
  });
});

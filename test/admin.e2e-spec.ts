import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionRequestStatus, SubscriptionStatus, SubscriptionTier, UsageType, UserRole } from '@prisma/client';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/main';

describe('Admin console API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
  let targetToken: string;
  let targetRefreshToken: string;
  let adminId: string;
  let targetId: string;
  const password = 'AdminTestPassword123!';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    prisma = app.get(PrismaService);
    await app.init();

    const admin = await register('admin'); adminId = admin.user.id;
    await prisma.user.update({ where: { id: adminId }, data: { role: UserRole.ADMIN } });
    adminToken = (await login(admin.user.email)).accessToken;
    userToken = (await register('user')).accessToken;
    const target = await register('target'); targetId = target.user.id; targetToken = target.accessToken; targetRefreshToken = target.refreshToken;
  });

  afterAll(async () => {
    const ids = [adminId, targetId].filter((id): id is string => Boolean(id));
    if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    if (prisma) await prisma.user.deleteMany({ where: { email: { contains: 'admin-test-' } } }).catch(() => undefined);
    await app.close();
  });

  it('rejects a normal user with 403 and allows an admin overview', async () => {
    await request(app.getHttpServer()).get('/api/admin/overview').set('Authorization', `Bearer ${userToken}`).expect(403);
    await request(app.getHttpServer()).get('/api/admin/overview?range=7').set('Authorization', `Bearer ${adminToken}`).expect(200).expect((response) => {
      expect(response.body.kpis).toBeDefined();
      expect(response.body.userGrowth).toEqual(expect.any(Array));
      expect(response.body.passwordHash).toBeUndefined();
    });
  });

  it('supports paginated case-insensitive user search without credential leakage', async () => {
    await request(app.getHttpServer()).get('/api/admin/users?page=1&limit=10&search=TARGET').set('Authorization', `Bearer ${adminToken}`).expect(200).expect((response) => {
      expect(response.body.items.some((item: { id: string }) => item.id === targetId)).toBe(true);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain('tokenHash');
    });
  });

  it('keeps login, activity, and session facts separate during normal admin browsing', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { lastLoginAt: true, lastActivityAt: true } });
    expect(before.lastLoginAt).toBeNull();
    expect(before.lastActivityAt).toBeNull();

    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app.getHttpServer()).get('/api/health/platform').expect(200);
    await request(app.getHttpServer()).get('/api/admin/users?page=1&sort=createdAt&order=desc').set('Authorization', `Bearer ${adminToken}`).expect(200)
      .expect((response) => {
        const target = response.body.items.find((item: { id: string }) => item.id === targetId);
        expect(target).toEqual(expect.objectContaining({ lastLoginAt: null, lastActivityAt: null, activeSession: true }));
      });
    await request(app.getHttpServer()).get(`/api/admin/users/${targetId}`).set('Authorization', `Bearer ${adminToken}`).expect(200)
      .expect((response) => {
        expect(response.body.lastLoginAt).toBeNull();
        expect(response.body.lastActivityAt).toBeNull();
        expect(response.body.integrations.telegram.connected).toBe(false);
        expect(response.body.integrations.google.connected).toBe(false);
        expect(response.body.integrations.bito.connected).toBe(false);
        expect(response.body.integrations.whatsapp).toEqual(expect.objectContaining({ connected: false, productEnabled: false }));
        expect(response.body.integrations.instagram).toEqual(expect.objectContaining({ connected: false, productEnabled: false }));
      });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { lastLoginAt: true, lastActivityAt: true } });
    expect(after).toEqual(before);
  });

  it('updates lastLoginAt only after a successful login', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { lastLoginAt: true } });
    expect(before.lastLoginAt).toBeNull();
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: (await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { email: true } })).email, password: 'wrong-password' }).expect(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { lastLoginAt: true } })).lastLoginAt).toBeNull();
    await login((await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { email: true } })).email);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { lastLoginAt: true, lastActivityAt: true } }))).toEqual({ lastLoginAt: expect.any(Date), lastActivityAt: expect.any(Date) });
  });

  it('returns real usage and never treats expired or pending subscriptions as active', async () => {
    const periodStart = new Date(Date.now() - 30 * 86_400_000);
    const periodEnd = new Date(Date.now() - 86_400_000);
    await prisma.userSubscription.upsert({
      where: { userId: targetId },
      create: { userId: targetId, tier: SubscriptionTier.PRO, status: SubscriptionStatus.ACTIVE, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
      update: { tier: SubscriptionTier.PRO, status: SubscriptionStatus.ACTIVE, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
    });
    await prisma.subscriptionRequest.create({ data: { userId: targetId, tier: SubscriptionTier.BUSINESS, status: SubscriptionRequestStatus.PENDING } });
    await prisma.aiUsage.create({ data: { userId: targetId, type: UsageType.TEXT, creditUnits: 7, createdAt: new Date(Date.now() - 2 * 86_400_000) } });

    await request(app.getHttpServer()).get(`/api/admin/users/${targetId}`).set('Authorization', `Bearer ${adminToken}`).expect(200)
      .expect((response) => {
        expect(response.body.subscription).toEqual(expect.objectContaining({ status: 'EXPIRED', canUseAi: false }));
        expect(response.body.pendingSubscriptionRequest).toEqual(expect.objectContaining({ tier: 'BUSINESS', status: 'PENDING' }));
        expect(response.body.subscription.usage.aiCredits.used).toBe(7);
      });
  });

  it('blocks a user, revokes refresh sessions, and permits an explicit unblock', async () => {
    await request(app.getHttpServer()).patch(`/api/admin/users/${targetId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'BLOCKED' }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: targetRefreshToken }).expect(403);
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${targetToken}`).expect(403);
    await request(app.getHttpServer()).patch(`/api/admin/users/${targetId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }).expect(200);
  });

  it('prevents an admin from changing their own role or blocking themselves', async () => {
    await request(app.getHttpServer()).patch(`/api/admin/users/${adminId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'BLOCKED' }).expect(403);
    await request(app.getHttpServer()).patch(`/api/admin/users/${adminId}/role`).set('Authorization', `Bearer ${adminToken}`).send({ role: 'USER' }).expect(403);
  });

  it('rejects a normal user and returns real, secret-free settings for an admin', async () => {
    await request(app.getHttpServer()).get('/api/admin/settings').set('Authorization', `Bearer ${userToken}`).expect(403);
    await request(app.getHttpServer()).get('/api/admin/settings').set('Authorization', `Bearer ${adminToken}`).expect(200).expect((response) => {
      const body = response.body;
      expect(body.platform).toEqual(expect.objectContaining({ name: 'Qulay AI', defaultUserStatus: 'ACTIVE' }));
      expect(body.security.rateLimits.loginPerIp).toEqual({ max: 30, windowMinutes: 15 });
      expect(body.notifications.workerStatus).toBeDefined();
      expect(body.integrations).toEqual(expect.objectContaining({ telegram: expect.any(Object), google: expect.any(Object), openai: expect.any(Object) }));
      expect(body.storage.provider).toEqual(expect.any(String));
      expect(body.system.environment).toEqual(expect.any(String));
      const raw = JSON.stringify(body);
      expect(raw).not.toContain('SecretKey');
      expect(raw).not.toContain('secret');
      expect(raw).not.toContain('passwordHash');
    });
  });

  it('updates platform settings, audits them, and enforces registration availability', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/settings/platform')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ registrationEnabled: false })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/api/admin/settings/platform')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Qulay AI Test', registrationEnabled: false })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({ name: 'Qulay AI Test', registrationEnabled: false }));
      });

    await request(app.getHttpServer())
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.platform).toEqual(expect.objectContaining({ name: 'Qulay AI Test', registrationEnabled: false }));
      });

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: `admin-test-disabled-${Date.now()}@example.com`, password, firstName: 'Blocked', lastName: 'Signup' })
      .expect(403);

    const audit = await prisma.activityLog.findFirst({
      where: { userId: adminId, action: 'ADMIN_SETTINGS_UPDATED', entityType: 'PLATFORM_SETTINGS' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();

    await request(app.getHttpServer())
      .patch('/api/admin/settings/platform')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Qulay AI', registrationEnabled: true })
      .expect(200);
  });

  async function register(label: string) {
    return (await request(app.getHttpServer()).post('/api/auth/register').send({ email: `admin-test-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`, password, firstName: label, lastName: 'Test' }).expect(201)).body as { user: { id: string; email: string }; accessToken: string; refreshToken: string };
  }

  async function login(email: string) {
    return (await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200)).body as { accessToken: string; refreshToken: string };
  }
});

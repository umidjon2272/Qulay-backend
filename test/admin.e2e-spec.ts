import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    prisma = app.get(PrismaService);
    await app.init();

    const admin = await register('admin'); adminId = admin.user.id;
    await prisma.user.update({ where: { id: adminId }, data: { role: UserRole.ADMIN } });
    adminToken = (await login(admin.user.email)).accessToken;
    userToken = (await register('user')).accessToken;
    const target = await register('target'); targetId = target.user.id; targetToken = target.accessToken; targetRefreshToken = target.refreshToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [adminId, targetId] } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'admin-test-' } } });
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

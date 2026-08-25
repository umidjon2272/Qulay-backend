import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Notifications API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userA: { id: string; token: string };
  let userB: { id: string; token: string };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    prisma = app.get(PrismaService);
    await app.init();
    const register = async (label: string) => {
      const response = await request(app.getHttpServer()).post('/api/auth/register').send({ email: `notifications-${label}-${Date.now()}@example.com`, password: 'StrongPassword123!', firstName: label, lastName: 'Test' });
      return { id: response.body.user.id as string, token: response.body.accessToken as string };
    };
    userA = await register('A');
    userB = await register('B');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA?.id, userB?.id].filter(Boolean) } } });
    await app.close();
  });

  it('lists only own notifications, reads one and reads all', async () => {
    const own = await prisma.notification.create({ data: { userId: userA.id, type: NotificationType.REMINDER, title: 'Own', message: 'Own message', channel: NotificationChannel.IN_APP, status: NotificationStatus.SENT, sentAt: new Date() } });
    const foreign = await prisma.notification.create({ data: { userId: userB.id, type: NotificationType.REMINDER, title: 'Foreign', message: 'Foreign message', channel: NotificationChannel.IN_APP, status: NotificationStatus.SENT, sentAt: new Date() } });
    const list = await request(app.getHttpServer()).get('/api/notifications').set('Authorization', `Bearer ${userA.token}`).expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(own.id);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(foreign.id);
    await request(app.getHttpServer()).get('/api/notifications/unread-count').set('Authorization', `Bearer ${userA.token}`).expect(200).expect({ count: 1 });
    await request(app.getHttpServer()).patch(`/api/notifications/${own.id}/read`).set('Authorization', `Bearer ${userA.token}`).expect(200);
    await request(app.getHttpServer()).get('/api/notifications/unread-count').set('Authorization', `Bearer ${userA.token}`).expect(200).expect({ count: 0 });
    await prisma.notification.create({ data: { userId: userA.id, type: NotificationType.TASK, title: 'Second', message: 'Second message', channel: NotificationChannel.IN_APP, status: NotificationStatus.SENT, sentAt: new Date() } });
    await request(app.getHttpServer()).patch('/api/notifications/read-all').set('Authorization', `Bearer ${userA.token}`).expect(200).expect({ count: 1 });
  });

  it('updates preferences and blocks foreign notification access', async () => {
    await request(app.getHttpServer()).get('/api/notifications/preferences').set('Authorization', `Bearer ${userA.token}`).expect(200).expect((response) => expect(response.body.defaultMeetingMinutesBefore).toBe(15));
    await request(app.getHttpServer()).patch('/api/notifications/preferences').set('Authorization', `Bearer ${userA.token}`).send({ telegramEnabled: true }).expect(200).expect((response) => expect(response.body.telegramEnabled).toBe(true));
    const foreign = await prisma.notification.create({ data: { userId: userB.id, type: NotificationType.SYSTEM, title: 'Private', message: 'Private', channel: NotificationChannel.IN_APP, status: NotificationStatus.SENT, sentAt: new Date() } });
    await request(app.getHttpServer()).patch(`/api/notifications/${foreign.id}/read`).set('Authorization', `Bearer ${userA.token}`).expect(404);
    await request(app.getHttpServer()).delete(`/api/notifications/${foreign.id}`).set('Authorization', `Bearer ${userA.token}`).expect(404);
  });
});

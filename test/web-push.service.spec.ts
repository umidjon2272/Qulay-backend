import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { WebPushService, validatePushEndpoint } from '../src/notifications/web-push.service';
import { NotificationRecord } from '../src/notifications/notification.types';
import * as webPush from 'web-push';
import { createECDH, createHash } from 'node:crypto';
jest.mock('web-push', () => ({ sendNotification: jest.fn().mockResolvedValue({}) }));

const endpoint = 'https://fcm.googleapis.com/fcm/send/test';
const dto = { endpoint, keys: { p256dh: createECDH('prime256v1').generateKeys().toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } };
const notification = { id: 'notification', userId: 'owner', claimToken: 'claim', type: 'REMINDER', entityType: 'REMINDER' } as NotificationRecord;
function fixture(configured = true) {
  const db = {
    pushSubscription: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0), upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 'device', userId: 'owner', endpoint, ...dto.keys }]) },
    notificationPreference: { findUnique: jest.fn().mockResolvedValue({ webPushEnabled: true }), upsert: jest.fn() },
    pushReceipt: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    notification: { findFirst: jest.fn().mockResolvedValue({ id: 'notification' }), findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ language: 'uz' }) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(fn => fn(db));
  const config = { get: jest.fn((key: string) => configured ? ({ 'webPush.subject': 'mailto:admin@example.com', 'webPush.publicKey': 'public', 'webPush.privateKey': 'private' }[key]) : undefined) };
  return { db, service: new WebPushService(db as unknown as PrismaService, config as unknown as ConfigService) };
}
describe('Web Push boundaries', () => {
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(webPush.sendNotification).mockResolvedValue({} as never); });
  it.each(['http://fcm.googleapis.com/a', 'https://127.0.0.1/a', 'https://fcm.googleapis.com.evil.test/a', 'https://u:p@fcm.googleapis.com/a', 'https://fcm.googleapis.com:444/a', 'https://example.com/a'])('rejects unsafe endpoint %s', value => {
    expect(() => validatePushEndpoint(value)).toThrow();
  });
  it('accepts supported browser providers', () => {
    for (const url of [endpoint, 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x']) expect(() => validatePushEndpoint(url)).not.toThrow();
  });
  it('never exposes a private VAPID key', async () => {
    const { service } = fixture();
    expect(await service.status('owner')).toEqual({ configured: true, publicKey: 'public', enabled: true, subscriptionHashes: [createHash('sha256').update(endpoint).digest('hex')] });
  });
  it('does not register when the operator has not configured push', async () => {
    const { service, db } = fixture(false);
    await expect(service.subscribe('owner', dto)).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('does not take over another account subscription', async () => {
    const { service, db } = fixture();
    db.pushSubscription.findUnique.mockResolvedValue({ userId: 'another' });
    await expect(service.subscribe('owner', dto)).rejects.toThrow();
    expect(db.pushSubscription.upsert).not.toHaveBeenCalled();
  });
  it('limits devices and scopes unsubscribe to the authenticated user', async () => {
    const { service, db } = fixture();
    db.pushSubscription.count.mockResolvedValue(10);
    await expect(service.subscribe('owner', dto)).rejects.toThrow();
    await service.unsubscribe('owner', endpoint);
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 'owner', endpoint } });
  });
  it('persists subscription and preference atomically', async () => {
    const { service, db } = fixture();
    expect(await service.subscribe('owner', dto)).toEqual({ enabled: true });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(db.notificationPreference.upsert).toHaveBeenCalled();
  });
  it('sends only a privacy-safe payload and records per-device success', async () => {
    const { service, db } = fixture();
    await service.deliver({ ...notification, message: 'PRIVATE', title: 'PRIVATE' });
    expect(webPush.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ endpoint }), expect.not.stringContaining('PRIVATE'), expect.objectContaining({ timeout: 8000, TTL: 300 }));
    expect(db.pushReceipt.upsert).toHaveBeenCalled();
  });
  it('backfills existing future reminders without duplicating a push already scheduled', async () => {
    const { service, db } = fixture();
    const row = { id: 'inapp', entityId: 'reminder', entityType: 'REMINDER', type: 'REMINDER', title: 'Test', message: 'Test', scheduledAt: new Date() };
    db.notification.findMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    await service.subscribe('owner', dto);
    expect(db.notification.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ entityId: 'reminder', channel: 'WEB_PUSH' })] });
    db.notification.createMany.mockClear();
    db.notification.findMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([row]);
    await service.subscribe('owner', dto);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
  it('does not re-send a completed device receipt', async () => {
    const { service, db } = fixture();
    db.pushReceipt.findUnique.mockResolvedValue({ sentAt: new Date() });
    await service.deliver(notification);
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
  it('does not send after cancellation', async () => {
    const { service, db } = fixture(); db.notification.findFirst.mockResolvedValue(null);
    await service.deliver(notification);
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
  it.each([404, 410])('removes expired subscriptions for %s', async statusCode => {
    const { service, db } = fixture();
    jest.mocked(webPush.sendNotification).mockRejectedValue({ statusCode });
    await service.deliver(notification);
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 'device', userId: 'owner' } });
  });
  it('retries transient failure without exposing provider details', async () => {
    const { service, db } = fixture();
    jest.mocked(webPush.sendNotification).mockRejectedValue({ statusCode: 503, body: 'SECRET' });
    await expect(service.deliver(notification)).rejects.toThrow('Push delivery temporarily failed');
    expect(db.pushReceipt.upsert).not.toHaveBeenCalled();
  });
});

import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, ECDH } from 'node:crypto';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { PushSubscriptionDto } from './dto/push-subscription.dto';
import { NotificationRecord } from './notification.types';

// Push endpoints are untrusted input. Never turn subscription registration into
// an arbitrary server-side HTTPS request (SSRF). Add providers only after review.
export function validatePushEndpoint(endpoint: string): void {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new BadRequestException('Invalid push endpoint'); }
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || !allowed.includes(url.hostname)) {
    throw new BadRequestException('Unsupported push endpoint');
  }
}

@Injectable()
export class WebPushService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private options() {
    const subject = this.config.get<string>('webPush.subject');
    const publicKey = this.config.get<string>('webPush.publicKey');
    const privateKey = this.config.get<string>('webPush.privateKey');
    if (!subject || !publicKey || !privateKey) return null;
    return { subject, publicKey, privateKey };
  }

  async status(userId: string) {
    const options = this.options();
    const preference = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    const devices = await this.prisma.pushSubscription.findMany({ where: { userId }, select: { endpoint: true }, take: 10 });
    return { configured: Boolean(options), publicKey: options?.publicKey ?? null, enabled: preference?.webPushEnabled ?? false, subscriptionHashes: devices.map(device => createHash('sha256').update(device.endpoint).digest('hex')) };
  }

  async subscribe(userId: string, dto: PushSubscriptionDto) {
    if (!this.options()) throw new ServiceUnavailableException('Web push is not configured');
    validatePushEndpoint(dto.endpoint);
    if (Buffer.from(dto.keys.p256dh, 'base64url').length !== 65 || Buffer.from(dto.keys.auth, 'base64url').length !== 16) throw new BadRequestException('Invalid push keys');
    try { ECDH.convertKey(Buffer.from(dto.keys.p256dh, 'base64url'), 'prime256v1'); }
    catch { throw new BadRequestException('Invalid push public key'); }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.pushSubscription.findUnique({ where: { endpoint: dto.endpoint } });
      // A device cannot silently move another account's subscription to itself.
      if (existing && existing.userId !== userId) throw new BadRequestException('Unsubscribe the previous device account first');
      if (!existing && await tx.pushSubscription.count({ where: { userId } }) >= 10) throw new BadRequestException('Push device limit reached');
      await tx.pushSubscription.upsert({ where: { endpoint: dto.endpoint }, create: { userId, endpoint: dto.endpoint, ...dto.keys }, update: { ...dto.keys } });
      await tx.notificationPreference.upsert({ where: { userId }, create: { userId, webPushEnabled: true }, update: { webPushEnabled: true } });
      // Enabling push also covers reminders/tasks already scheduled before this
      // device subscribed. Serializable isolation prevents concurrent duplicate
      // copies and conflicts with cancellation rather than resurrecting it.
      let cursor: string | undefined;
      const now = new Date();
      while (true) {
        const source = await tx.notification.findMany({ where: { userId, channel: 'IN_APP', status: 'PENDING', scheduledAt: { gte: now }, entityType: { in: ['TASK', 'REMINDER', 'MEETING'] } }, orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
        if (!source.length) break;
        const prior = await tx.notification.findMany({ where: { userId, channel: 'WEB_PUSH', entityId: { in: source.flatMap(row => row.entityId ? [row.entityId] : []) }, status: { not: 'CANCELLED' } }, select: { entityId: true, entityType: true, scheduledAt: true } });
        const key = (row: { entityId: string | null; entityType: string | null; scheduledAt: Date | null }) => `${row.entityType}:${row.entityId}:${row.scheduledAt?.getTime()}`;
        const existingKeys = new Set(prior.map(key));
        const data = source.filter(row => row.entityId && !existingKeys.has(key(row))).map(row => ({ userId, type: row.type, title: row.title, message: row.message, entityId: row.entityId, entityType: row.entityType, scheduledAt: row.scheduledAt, channel: 'WEB_PUSH' as const }));
        if (data.length) await tx.notification.createMany({ data });
        cursor = source[source.length - 1].id;
        if (source.length < 100) break;
      }
      return { enabled: true };
    }, { isolationLevel: 'Serializable' });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { enabled: false };
  }

  async deliver(notification: NotificationRecord) {
    const vapidDetails = this.options();
    if (!vapidDetails) throw new ServiceUnavailableException('Web push is not configured');
    const preference = await this.prisma.notificationPreference.findUnique({ where: { userId: notification.userId } });
    if (!preference?.webPushEnabled) return;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId: notification.userId }, take: 10 });
    const user = await this.prisma.user.findUnique({ where: { id: notification.userId }, select: { language: true } });
    const routes: Record<string, string> = { TASK: '/tasks', REMINDER: '/reminders', MEETING: '/calendar', AI: '/ai-assistant' };
    // Lock-screen notifications deliberately contain no private reminder text.
    const payload = JSON.stringify({ id: notification.id, title: 'Qulay AI', body: user?.language === 'ru' ? 'Новое уведомление. Откройте Qulay AI.' : 'Yangi bildirishnoma. Qulay AI’ni oching.', url: routes[notification.entityType ?? notification.type] ?? '/notifications' });
    let failed = false;
    for (const subscription of subscriptions) {
      const receiptKey = { notificationId: notification.id, subscriptionId: subscription.id };
      if (await this.prisma.pushReceipt.findUnique({ where: { notificationId_subscriptionId: receiptKey } })) continue;
      const current = await this.prisma.notification.findFirst({ where: { id: notification.id, status: 'PENDING', claimToken: notification.claimToken }, select: { id: true } });
      if (!current) return;
      try {
        validatePushEndpoint(subscription.endpoint);
        await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { vapidDetails, timeout: 8000, TTL: 300, urgency: 'normal', topic: createHash('sha256').update(notification.id).digest('base64url').slice(0, 32) });
        await this.prisma.pushReceipt.upsert({ where: { notificationId_subscriptionId: receiptKey }, create: receiptKey, update: {} });
      } catch (error) {
        const status = (error as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id, userId: notification.userId } });
        else failed = true;
      }
    }
    // Never include the provider response/endpoint/key in logs or public errors.
    if (failed) throw new ServiceUnavailableException('Push delivery temporarily failed');
  }
}

import { NotificationChannel } from '@prisma/client';
import { TelegramNotificationAdapter } from '../src/notifications/adapters/telegram-notification.adapter';
import { WebPushNotificationAdapter } from '../src/notifications/adapters/web-push-notification.adapter';

describe('Notification delivery adapters', () => {
  it('uses the Telegram self-notification flow', async () => {
    const telegram = { sendSelfNotification: jest.fn().mockResolvedValue({ messageId: 'm1' }) } as any;
    const adapter = new TelegramNotificationAdapter(telegram);
    await adapter.deliver({ userId: 'user-a', title: 'Title', message: 'Message' } as any);
    expect(adapter.channel).toBe(NotificationChannel.TELEGRAM);
    expect(telegram.sendSelfNotification).toHaveBeenCalledWith('user-a', 'Title\nMessage');
  });

  it('delegates web push to the configured, ownership-scoped delivery service', async () => {
    const push = { deliver: jest.fn().mockResolvedValue(undefined) } as any;
    const adapter = new WebPushNotificationAdapter(push);
    const notification = { userId: 'owner', id: 'notice' } as any;
    await adapter.deliver(notification);
    expect(push.deliver).toHaveBeenCalledWith(notification);
    expect(adapter.channel).toBe(NotificationChannel.WEB_PUSH);
  });
});

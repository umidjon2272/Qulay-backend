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

  it('keeps web push as an explicit placeholder', async () => {
    const adapter = new WebPushNotificationAdapter();
    await expect(adapter.deliver({} as any)).rejects.toThrow('Web push delivery is not configured yet');
  });
});

import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { NotificationDeliveryAdapter, NotificationRecord } from './notification.types';
import { TelegramNotificationAdapter } from './adapters/telegram-notification.adapter';
import { WebPushNotificationAdapter } from './adapters/web-push-notification.adapter';

@Injectable()
export class InAppNotificationAdapter implements NotificationDeliveryAdapter {
  readonly channel = NotificationChannel.IN_APP;

  // The notification row is the in-app inbox. No external side effect is needed.
  async deliver(_notification: NotificationRecord): Promise<void> {}
}

@Injectable()
export class NotificationDeliveryService {
  private readonly adapters = new Map<NotificationChannel, NotificationDeliveryAdapter>();

  constructor(
    inApp: InAppNotificationAdapter,
    telegram: TelegramNotificationAdapter,
    webPush: WebPushNotificationAdapter,
  ) {
    for (const adapter of [inApp, telegram, webPush]) this.adapters.set(adapter.channel, adapter);
  }

  deliver(notification: NotificationRecord): Promise<void> {
    const adapter = this.adapters.get(notification.channel);
    if (!adapter) throw new Error(`No adapter registered for ${notification.channel}`);
    return adapter.deliver(notification);
  }
}

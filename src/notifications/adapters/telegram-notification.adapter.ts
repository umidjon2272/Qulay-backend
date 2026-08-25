import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { TelegramIntegrationService } from '../../telegram/telegram-integration.service';
import { NotificationDeliveryAdapter, NotificationRecord } from '../notification.types';

@Injectable()
export class TelegramNotificationAdapter implements NotificationDeliveryAdapter {
  readonly channel = NotificationChannel.TELEGRAM;

  constructor(private readonly telegram: TelegramIntegrationService) {}

  deliver(notification: NotificationRecord): Promise<void> {
    return this.telegram.sendSelfNotification(
      notification.userId,
      `${notification.title}\n${notification.message}`,
    ).then(() => undefined);
  }
}

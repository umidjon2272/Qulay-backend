import { Injectable } from '@nestjs/common';
import { WebPushService } from '../web-push.service';
import { NotificationChannel } from '@prisma/client';
import { NotificationDeliveryAdapter, NotificationRecord } from '../notification.types';

@Injectable()
export class WebPushNotificationAdapter implements NotificationDeliveryAdapter {
  constructor(private readonly push: WebPushService) {}
  readonly channel = NotificationChannel.WEB_PUSH;

  async deliver(notification: NotificationRecord): Promise<void> {
    await this.push.deliver(notification);
  }
}

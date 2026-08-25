import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { NotificationDeliveryAdapter, NotificationRecord } from '../notification.types';

@Injectable()
export class WebPushNotificationAdapter implements NotificationDeliveryAdapter {
  readonly channel = NotificationChannel.WEB_PUSH;

  async deliver(_notification: NotificationRecord): Promise<void> {
    throw new ServiceUnavailableException('Web push delivery is not configured yet');
  }
}

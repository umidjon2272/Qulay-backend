import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationCronController, NotificationsController } from './notifications.controller';
import { NotificationDeliveryService, InAppNotificationAdapter } from './notification-delivery.service';
import { TelegramNotificationAdapter } from './adapters/telegram-notification.adapter';
import { WebPushNotificationAdapter } from './adapters/web-push-notification.adapter';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationService } from './notification.service';
import { NotificationWorkerService } from './notification-worker.service';

@Module({
  imports: [PrismaModule, ActivityLogModule, TelegramModule],
  controllers: [NotificationsController, NotificationCronController],
  providers: [
    NotificationService,
    NotificationSchedulerService,
    NotificationWorkerService,
    InAppNotificationAdapter,
    TelegramNotificationAdapter,
    WebPushNotificationAdapter,
    NotificationDeliveryService,
  ],
  exports: [NotificationService, NotificationSchedulerService, NotificationWorkerService],
})
export class NotificationsModule {}

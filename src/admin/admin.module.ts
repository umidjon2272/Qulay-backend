import { Module } from '@nestjs/common';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [PrismaModule, CommonModule, ActivityLogModule, NotificationsModule, SubscriptionsModule, TelegramModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

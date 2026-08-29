import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { NotificationService } from './notification.service';
import { NotificationWorkerService } from './notification-worker.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get() list(@CurrentUser() user: AuthenticatedUser, @Query() query: NotificationQueryDto) { return this.notifications.listForUser(user.sub, query); }
  @Get('unread-count') unreadCount(@CurrentUser() user: AuthenticatedUser) { return this.notifications.unreadCount(user.sub); }
  @Get('preferences') preferences(@CurrentUser() user: AuthenticatedUser) { return this.notifications.getPreferences(user.sub); }
  @Patch('preferences') updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateNotificationPreferenceDto) { return this.notifications.updatePreferences(user.sub, dto); }
  @Patch('read-all') readAll(@CurrentUser() user: AuthenticatedUser) { return this.notifications.readAll(user.sub); }
  @Patch(':id/read') read(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.notifications.markRead(user.sub, id); }
  @Delete(':id') delete(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.notifications.deleteForUser(user.sub, id); }
}

@Controller('internal/notifications')
export class NotificationCronController {
  constructor(private readonly config: ConfigService, private readonly worker: NotificationWorkerService) {}

  @Post('process-due')
  async processDue(@Headers('x-cron-secret') supplied?: string) {
    const expected = this.config.get<string>('notificationCronSecret');
    if (!expected) throw new ServiceUnavailableException('Notification cron is not configured');
    if (!supplied || supplied !== expected) throw new UnauthorizedException('Invalid cron secret');
    return { processed: await this.worker.processDueNotifications(), processedAt: new Date().toISOString() };
  }
}

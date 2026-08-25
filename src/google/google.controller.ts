import { Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards, Body } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CalendarEventsQueryDto, CreateCalendarEventDto, DriveFilesQueryDto, GoogleCallbackQueryDto, UpdateCalendarEventDto } from './dto/google.dto';
import { GoogleAuthService } from './google-auth.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleDriveService } from './google-drive.service';
import { mapGoogleError } from './google.errors';
import { ConfigService } from '@nestjs/config';
import { SecurityRateLimitService } from '../common/security/security-rate-limit.service';
import { RateLimitException } from '../common/security/rate-limit.exception';

@Controller('integrations/google')
export class GoogleController {
  constructor(private readonly auth: GoogleAuthService, private readonly calendar: GoogleCalendarService, private readonly drive: GoogleDriveService, private readonly config: ConfigService, private readonly rateLimiter: SecurityRateLimitService) {}

  @Get('connect-url') @UseGuards(JwtAuthGuard)
  connectUrl(@CurrentUser() user: AuthenticatedUser) { return { url: this.auth.connectUrl(user.sub) }; }

  @Get('callback')
  async callback(@Query() query: GoogleCallbackQueryDto, @Req() request: Request, @Res() response: Response) {
    const frontend = this.config.getOrThrow<string>('frontendUrl').split(',')[0].trim();
    if (!this.rateLimiter.isAllowed('google-callback-ip', request.ip ?? 'unknown', 30, 60 * 1000)) {
      throw new RateLimitException('Too many OAuth callback attempts. Try again later.');
    }
    try {
      await this.auth.callback(query.code, query.state, query.error);
      return response.redirect(`${frontend}/settings?tab=integrations&google=connected`);
    } catch (error) {
      const mapped = mapGoogleError(error);
      const reason = query.error === 'access_denied' ? 'cancelled' : mapped.getStatus() === 400 ? 'invalid' : 'unavailable';
      return response.redirect(`${frontend}/settings?tab=integrations&google=error&reason=${reason}`);
    }
  }

  @Get('status') @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) { return this.auth.status(user.sub); }

  @Delete('disconnect') @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthenticatedUser) { return this.auth.disconnect(user.sub); }

  @Get('calendar/events') @UseGuards(JwtAuthGuard)
  listCalendar(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarEventsQueryDto) { return this.calendar.list(user.sub, query); }

  @Post('calendar/events') @UseGuards(JwtAuthGuard)
  createCalendar(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCalendarEventDto) { return this.calendar.create(user.sub, dto); }

  @Patch('calendar/events/:eventId') @UseGuards(JwtAuthGuard)
  updateCalendar(@CurrentUser() user: AuthenticatedUser, @Param('eventId') eventId: string, @Body() dto: UpdateCalendarEventDto) { return this.calendar.update(user.sub, eventId, dto); }

  @Delete('calendar/events/:eventId') @UseGuards(JwtAuthGuard)
  deleteCalendar(@CurrentUser() user: AuthenticatedUser, @Param('eventId') eventId: string, @Query('calendarId') calendarId?: string) { return this.calendar.delete(user.sub, eventId, calendarId); }

  @Get('drive/files') @UseGuards(JwtAuthGuard)
  listDrive(@CurrentUser() user: AuthenticatedUser, @Query() query: DriveFilesQueryDto) { return this.drive.list(user.sub, query); }

  @Get('drive/files/:fileId') @UseGuards(JwtAuthGuard)
  metadata(@CurrentUser() user: AuthenticatedUser, @Param('fileId') fileId: string) { return this.drive.metadata(user.sub, fileId); }
}

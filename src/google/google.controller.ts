import { Controller, Delete, Get, Logger, Param, Patch, Post, Query, Req, Res, UseGuards, Body } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CalendarEventsQueryDto, CreateCalendarEventDto, DriveFilesQueryDto, UpdateCalendarEventDto } from './dto/google.dto';
import { GoogleAuthService } from './google-auth.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleDriveService } from './google-drive.service';
import { mapGoogleError } from './google.errors';
import { ConfigService } from '@nestjs/config';
import { SecurityRateLimitService } from '../common/security/security-rate-limit.service';
import { RateLimitException } from '../common/security/rate-limit.exception';

@Controller('integrations/google')
export class GoogleController {
  private readonly logger = new Logger(GoogleController.name);
  constructor(private readonly auth: GoogleAuthService, private readonly calendar: GoogleCalendarService, private readonly drive: GoogleDriveService, private readonly config: ConfigService, private readonly rateLimiter: SecurityRateLimitService) {}

  @Get('connect-url') @UseGuards(JwtAuthGuard)
  connectUrl(@CurrentUser() user: AuthenticatedUser) {
    try { return { url: this.auth.connectUrl(user.sub) }; } catch (error) { throw mapGoogleError(error); }
  }

  @Get('callback')
  async callback(
    @Query('code') rawCode: unknown,
    @Query('state') rawState: unknown,
    @Query('error') rawError: unknown,
    @Query('error_description') rawErrorDescription: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const frontend = this.config.getOrThrow<string>('frontendUrl').split(',')[0].trim();
    const code = this.providerQueryValue(rawCode, 4096);
    const state = this.providerQueryValue(rawState, 4096);
    const oauthError = this.providerQueryValue(rawError, 200);
    const errorDescriptionPresent = Boolean(this.providerQueryValue(rawErrorDescription, 2000));
    if (!this.rateLimiter.isAllowed('google-callback-ip', request.ip ?? 'unknown', 30, 60 * 1000)) {
      throw new RateLimitException('Too many OAuth callback attempts. Try again later.');
    }
    try {
      await this.auth.callback(code, state, oauthError);
      const target = `${frontend}/settings?tab=integrations&integration=google&status=connected`;
      this.logger.log({ event: 'google_oauth_redirect', success: true, target });
      return response.redirect(target);
    } catch (error) {
      const mapped = mapGoogleError(error);
      const cancelled = oauthError === 'access_denied';
      const reason = cancelled ? 'cancelled' : mapped.getStatus() === 400 ? 'invalid' : 'unavailable';
      const status = cancelled ? 'cancelled' : 'error';
      const target = `${frontend}/settings?tab=integrations&integration=google&status=${status}&reason=${reason}`;
      this.logger.warn({ event: 'google_oauth_redirect', success: false, target, reason, errorDescriptionPresent });
      return response.redirect(target);
    }
  }

  /** Picks only scalar provider values used by the callback. Every other Google query field is ignored. */
  private providerQueryValue(value: unknown, maxLength: number): string | undefined {
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return undefined;
    return value;
  }

  @Get('status') @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser) { return this.auth.status(user.sub); }

  @Delete('disconnect') @UseGuards(JwtAuthGuard)
  async disconnect(@CurrentUser() user: AuthenticatedUser) {
    try { return await this.auth.disconnect(user.sub); } catch (error) { throw mapGoogleError(error); }
  }

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

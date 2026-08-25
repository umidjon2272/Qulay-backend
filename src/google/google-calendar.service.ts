import { BadRequestException, Injectable } from '@nestjs/common';
import { ActivityLogService, ACTIVITY_ACTIONS } from '../activity-log/activity-log.service';
import { GoogleApiClientService } from './google-api-client.service';
import { GoogleAuthService } from './google-auth.service';
import { CreateCalendarEventDto, CalendarEventsQueryDto, UpdateCalendarEventDto } from './dto/google.dto';
import { GoogleAdapterError, mapGoogleError } from './google.errors';

type GoogleEvent = {
  id?: string; summary?: string; description?: string; location?: string; htmlLink?: string; status?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
};

const eventPath = (calendarId: string, eventId?: string) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;

@Injectable()
export class GoogleCalendarService {
  constructor(private readonly auth: GoogleAuthService, private readonly api: GoogleApiClientService, private readonly activityLog: ActivityLogService) {}

  async list(userId: string, query: CalendarEventsQueryDto) {
    try {
      const token = await this.auth.getAccessToken(userId);
      const calendarId = query.calendarId ?? 'primary';
      const params = new URLSearchParams({ timeMin: new Date(query.from).toISOString(), timeMax: new Date(query.to).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: String(query.limit ?? 50) });
      const result = await this.api.request<{ items?: GoogleEvent[] }>(`${eventPath(calendarId)}?${params.toString()}`, token, { resource: 'calendar' });
      return (result.items ?? []).map(normalizeEvent);
    } catch (error) { throw mapGoogleError(error); }
  }

  async create(userId: string, dto: CreateCalendarEventDto) {
    this.assertPeriod(dto.start, dto.end);
    try {
      const token = await this.auth.getAccessToken(userId);
      const calendarId = dto.calendarId ?? 'primary';
      const event = await this.api.request<GoogleEvent>(eventPath(calendarId), token, { method: 'POST', resource: 'calendar', body: this.toGoogleEvent(dto) });
      const normalized = normalizeEvent(event);
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.GOOGLE_CALENDAR_EVENT_CREATED, entityType: 'GOOGLE_CALENDAR_EVENT', metadata: { source: 'GOOGLE' } });
      return normalized;
    } catch (error) { throw mapGoogleError(error); }
  }

  async update(userId: string, eventId: string, dto: UpdateCalendarEventDto) {
    if (dto.start && dto.end) this.assertPeriod(dto.start, dto.end);
    if (!Object.keys(dto).some((key) => key !== 'calendarId')) throw new BadRequestException('Kamida bitta event maydoni kerak');
    try {
      const token = await this.auth.getAccessToken(userId);
      const calendarId = dto.calendarId ?? 'primary';
      const event = await this.api.request<GoogleEvent>(eventPath(calendarId, eventId), token, { method: 'PATCH', resource: 'calendar', body: this.toGoogleEvent(dto) });
      const normalized = normalizeEvent(event);
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.GOOGLE_CALENDAR_EVENT_UPDATED, entityType: 'GOOGLE_CALENDAR_EVENT', metadata: { source: 'GOOGLE' } });
      return normalized;
    } catch (error) { throw mapGoogleError(error); }
  }

  async delete(userId: string, eventId: string, calendarId = 'primary') {
    try {
      const token = await this.auth.getAccessToken(userId);
      await this.api.request<unknown>(eventPath(calendarId, eventId), token, { method: 'DELETE', resource: 'calendar' });
      await this.activityLog.record({ userId, action: ACTIVITY_ACTIONS.GOOGLE_CALENDAR_EVENT_DELETED, entityType: 'GOOGLE_CALENDAR_EVENT', entityId: undefined, metadata: { source: 'GOOGLE' } });
      return { deleted: true, id: eventId };
    } catch (error) { throw mapGoogleError(error); }
  }

  private toGoogleEvent(dto: CreateCalendarEventDto | UpdateCalendarEventDto): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    if (dto.title !== undefined) output.summary = dto.title;
    if (dto.description !== undefined) output.description = dto.description;
    if (dto.location !== undefined) output.location = dto.location;
    if (dto.start !== undefined) output.start = { dateTime: dto.start };
    if (dto.end !== undefined) output.end = { dateTime: dto.end };
    if (dto.attendees !== undefined) output.attendees = dto.attendees.map((email) => ({ email }));
    return output;
  }

  private assertPeriod(start: string, end: string): void {
    if (new Date(start).getTime() >= new Date(end).getTime()) throw new BadRequestException('start end dan oldin bo‘lishi kerak');
  }
}

export function normalizeEvent(event: GoogleEvent) {
  return {
    id: event.id ?? '', title: event.summary ?? '', description: event.description ?? null,
    start: event.start?.dateTime ?? event.start?.date ?? null, end: event.end?.dateTime ?? event.end?.date ?? null,
    attendees: (event.attendees ?? []).map(({ email, displayName, responseStatus }) => ({ email: email ?? '', displayName: displayName ?? null, responseStatus: responseStatus ?? null })),
    location: event.location ?? null, htmlLink: event.htmlLink ?? null, status: event.status ?? null,
  };
}

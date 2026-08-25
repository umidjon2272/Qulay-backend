"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarService = void 0;
exports.normalizeEvent = normalizeEvent;
const common_1 = require("@nestjs/common");
const activity_log_service_1 = require("../activity-log/activity-log.service");
const google_api_client_service_1 = require("./google-api-client.service");
const google_auth_service_1 = require("./google-auth.service");
const google_errors_1 = require("./google.errors");
const eventPath = (calendarId, eventId) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;
let GoogleCalendarService = class GoogleCalendarService {
    constructor(auth, api, activityLog) {
        this.auth = auth;
        this.api = api;
        this.activityLog = activityLog;
    }
    async list(userId, query) {
        try {
            const token = await this.auth.getAccessToken(userId);
            const calendarId = query.calendarId ?? 'primary';
            const params = new URLSearchParams({ timeMin: new Date(query.from).toISOString(), timeMax: new Date(query.to).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: String(query.limit ?? 50) });
            const result = await this.api.request(`${eventPath(calendarId)}?${params.toString()}`, token, { resource: 'calendar' });
            return (result.items ?? []).map(normalizeEvent);
        }
        catch (error) {
            throw (0, google_errors_1.mapGoogleError)(error);
        }
    }
    async create(userId, dto) {
        this.assertPeriod(dto.start, dto.end);
        try {
            const token = await this.auth.getAccessToken(userId);
            const calendarId = dto.calendarId ?? 'primary';
            const event = await this.api.request(eventPath(calendarId), token, { method: 'POST', resource: 'calendar', body: this.toGoogleEvent(dto) });
            const normalized = normalizeEvent(event);
            await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.GOOGLE_CALENDAR_EVENT_CREATED, entityType: 'GOOGLE_CALENDAR_EVENT', metadata: { source: 'GOOGLE' } });
            return normalized;
        }
        catch (error) {
            throw (0, google_errors_1.mapGoogleError)(error);
        }
    }
    async update(userId, eventId, dto) {
        if (dto.start && dto.end)
            this.assertPeriod(dto.start, dto.end);
        if (!Object.keys(dto).some((key) => key !== 'calendarId'))
            throw new common_1.BadRequestException('Kamida bitta event maydoni kerak');
        try {
            const token = await this.auth.getAccessToken(userId);
            const calendarId = dto.calendarId ?? 'primary';
            const event = await this.api.request(eventPath(calendarId, eventId), token, { method: 'PATCH', resource: 'calendar', body: this.toGoogleEvent(dto) });
            const normalized = normalizeEvent(event);
            await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.GOOGLE_CALENDAR_EVENT_UPDATED, entityType: 'GOOGLE_CALENDAR_EVENT', metadata: { source: 'GOOGLE' } });
            return normalized;
        }
        catch (error) {
            throw (0, google_errors_1.mapGoogleError)(error);
        }
    }
    async delete(userId, eventId, calendarId = 'primary') {
        try {
            const token = await this.auth.getAccessToken(userId);
            await this.api.request(eventPath(calendarId, eventId), token, { method: 'DELETE', resource: 'calendar' });
            await this.activityLog.record({ userId, action: activity_log_service_1.ACTIVITY_ACTIONS.GOOGLE_CALENDAR_EVENT_DELETED, entityType: 'GOOGLE_CALENDAR_EVENT', entityId: undefined, metadata: { source: 'GOOGLE' } });
            return { deleted: true, id: eventId };
        }
        catch (error) {
            throw (0, google_errors_1.mapGoogleError)(error);
        }
    }
    toGoogleEvent(dto) {
        const output = {};
        if (dto.title !== undefined)
            output.summary = dto.title;
        if (dto.description !== undefined)
            output.description = dto.description;
        if (dto.location !== undefined)
            output.location = dto.location;
        if (dto.start !== undefined)
            output.start = { dateTime: dto.start };
        if (dto.end !== undefined)
            output.end = { dateTime: dto.end };
        if (dto.attendees !== undefined)
            output.attendees = dto.attendees.map((email) => ({ email }));
        return output;
    }
    assertPeriod(start, end) {
        if (new Date(start).getTime() >= new Date(end).getTime())
            throw new common_1.BadRequestException('start end dan oldin bo‘lishi kerak');
    }
};
exports.GoogleCalendarService = GoogleCalendarService;
exports.GoogleCalendarService = GoogleCalendarService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [google_auth_service_1.GoogleAuthService, google_api_client_service_1.GoogleApiClientService, activity_log_service_1.ActivityLogService])
], GoogleCalendarService);
function normalizeEvent(event) {
    return {
        id: event.id ?? '', title: event.summary ?? '', description: event.description ?? null,
        start: event.start?.dateTime ?? event.start?.date ?? null, end: event.end?.dateTime ?? event.end?.date ?? null,
        attendees: (event.attendees ?? []).map(({ email, displayName, responseStatus }) => ({ email: email ?? '', displayName: displayName ?? null, responseStatus: responseStatus ?? null })),
        location: event.location ?? null, htmlLink: event.htmlLink ?? null, status: event.status ?? null,
    };
}
//# sourceMappingURL=google-calendar.service.js.map
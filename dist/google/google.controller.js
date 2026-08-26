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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const google_dto_1 = require("./dto/google.dto");
const google_auth_service_1 = require("./google-auth.service");
const google_calendar_service_1 = require("./google-calendar.service");
const google_drive_service_1 = require("./google-drive.service");
const google_errors_1 = require("./google.errors");
const config_1 = require("@nestjs/config");
const security_rate_limit_service_1 = require("../common/security/security-rate-limit.service");
const rate_limit_exception_1 = require("../common/security/rate-limit.exception");
let GoogleController = class GoogleController {
    constructor(auth, calendar, drive, config, rateLimiter) {
        this.auth = auth;
        this.calendar = calendar;
        this.drive = drive;
        this.config = config;
        this.rateLimiter = rateLimiter;
    }
    connectUrl(user) {
        try {
            return { url: this.auth.connectUrl(user.sub) };
        }
        catch (error) {
            throw (0, google_errors_1.mapGoogleError)(error);
        }
    }
    async callback(query, request, response) {
        const frontend = this.config.getOrThrow('frontendUrl').split(',')[0].trim();
        if (!this.rateLimiter.isAllowed('google-callback-ip', request.ip ?? 'unknown', 30, 60 * 1000)) {
            throw new rate_limit_exception_1.RateLimitException('Too many OAuth callback attempts. Try again later.');
        }
        try {
            await this.auth.callback(query.code, query.state, query.error);
            return response.redirect(`${frontend}/settings?tab=integrations&google=connected`);
        }
        catch (error) {
            const mapped = (0, google_errors_1.mapGoogleError)(error);
            const reason = query.error === 'access_denied' ? 'cancelled' : mapped.getStatus() === 400 ? 'invalid' : 'unavailable';
            return response.redirect(`${frontend}/settings?tab=integrations&google=error&reason=${reason}`);
        }
    }
    status(user) { return this.auth.status(user.sub); }
    async disconnect(user) {
        try {
            return await this.auth.disconnect(user.sub);
        }
        catch (error) {
            throw (0, google_errors_1.mapGoogleError)(error);
        }
    }
    listCalendar(user, query) { return this.calendar.list(user.sub, query); }
    createCalendar(user, dto) { return this.calendar.create(user.sub, dto); }
    updateCalendar(user, eventId, dto) { return this.calendar.update(user.sub, eventId, dto); }
    deleteCalendar(user, eventId, calendarId) { return this.calendar.delete(user.sub, eventId, calendarId); }
    listDrive(user, query) { return this.drive.list(user.sub, query); }
    metadata(user, fileId) { return this.drive.metadata(user.sub, fileId); }
};
exports.GoogleController = GoogleController;
__decorate([
    (0, common_1.Get)('connect-url'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GoogleController.prototype, "connectUrl", null);
__decorate([
    (0, common_1.Get)('callback'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_dto_1.GoogleCallbackQueryDto, Object, Object]),
    __metadata("design:returntype", Promise)
], GoogleController.prototype, "callback", null);
__decorate([
    (0, common_1.Get)('status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GoogleController.prototype, "status", null);
__decorate([
    (0, common_1.Delete)('disconnect'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GoogleController.prototype, "disconnect", null);
__decorate([
    (0, common_1.Get)('calendar/events'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, google_dto_1.CalendarEventsQueryDto]),
    __metadata("design:returntype", void 0)
], GoogleController.prototype, "listCalendar", null);
__decorate([
    (0, common_1.Post)('calendar/events'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, google_dto_1.CreateCalendarEventDto]),
    __metadata("design:returntype", void 0)
], GoogleController.prototype, "createCalendar", null);
__decorate([
    (0, common_1.Patch)('calendar/events/:eventId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('eventId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, google_dto_1.UpdateCalendarEventDto]),
    __metadata("design:returntype", void 0)
], GoogleController.prototype, "updateCalendar", null);
__decorate([
    (0, common_1.Delete)('calendar/events/:eventId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('eventId')),
    __param(2, (0, common_1.Query)('calendarId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], GoogleController.prototype, "deleteCalendar", null);
__decorate([
    (0, common_1.Get)('drive/files'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, google_dto_1.DriveFilesQueryDto]),
    __metadata("design:returntype", void 0)
], GoogleController.prototype, "listDrive", null);
__decorate([
    (0, common_1.Get)('drive/files/:fileId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('fileId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], GoogleController.prototype, "metadata", null);
exports.GoogleController = GoogleController = __decorate([
    (0, common_1.Controller)('integrations/google'),
    __metadata("design:paramtypes", [google_auth_service_1.GoogleAuthService, google_calendar_service_1.GoogleCalendarService, google_drive_service_1.GoogleDriveService, config_1.ConfigService, security_rate_limit_service_1.SecurityRateLimitService])
], GoogleController);
//# sourceMappingURL=google.controller.js.map
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
exports.CreateFinanceTransactionToolInput = exports.SaveMemoryToolInput = exports.CreateContactToolInput = exports.CreateNoteToolInput = exports.CreateMeetingToolInput = exports.CreateReminderToolInput = exports.CreateTaskToolInput = exports.CompareFinancePeriodsToolInput = exports.GetFileMetadataToolInput = exports.SearchFilesToolInput = exports.SearchGoogleDriveFilesToolInput = exports.DeleteGoogleCalendarEventToolInput = exports.UpdateGoogleCalendarEventToolInput = exports.CreateGoogleCalendarEventToolInput = exports.GetGoogleCalendarEventsToolInput = exports.SendTelegramMessageToolInput = exports.SearchTelegramChatsToolInput = exports.TodayFinanceToolInput = exports.FinanceSummaryToolInput = exports.RelevantMemoriesToolInput = exports.ContactHistoryToolInput = exports.SearchContactsToolInput = exports.NotesToolInput = exports.MeetingsToolInput = exports.RemindersToolInput = exports.TasksToolInput = exports.TodayPlanInput = exports.EmptyToolInput = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const create_contact_dto_1 = require("../../contacts/dto/create-contact.dto");
const finance_validation_1 = require("../../finance/dto/finance-validation");
const dateTimeWithTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/;
const dateKey = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }) => (typeof value === 'string' ? value.trim() : value);
class EmptyToolInput {
}
exports.EmptyToolInput = EmptyToolInput;
class TodayPlanInput {
}
exports.TodayPlanInput = TodayPlanInput;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(dateKey),
    __metadata("design:type", String)
], TodayPlanInput.prototype, "date", void 0);
class TasksToolInput {
}
exports.TasksToolInput = TasksToolInput;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.TaskStatus),
    __metadata("design:type", String)
], TasksToolInput.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.TaskPriority),
    __metadata("design:type", String)
], TasksToolInput.prototype, "priority", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(dateKey),
    __metadata("design:type", String)
], TasksToolInput.prototype, "date", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], TasksToolInput.prototype, "search", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], TasksToolInput.prototype, "limit", void 0);
class RemindersToolInput {
}
exports.RemindersToolInput = RemindersToolInput;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.TaskPriority),
    __metadata("design:type", String)
], RemindersToolInput.prototype, "priority", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(dateKey),
    __metadata("design:type", String)
], RemindersToolInput.prototype, "date", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], RemindersToolInput.prototype, "search", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], RemindersToolInput.prototype, "limit", void 0);
class MeetingsToolInput {
}
exports.MeetingsToolInput = MeetingsToolInput;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(dateKey),
    __metadata("design:type", String)
], MeetingsToolInput.prototype, "date", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], MeetingsToolInput.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], MeetingsToolInput.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.MeetingStatus),
    __metadata("design:type", String)
], MeetingsToolInput.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], MeetingsToolInput.prototype, "limit", void 0);
class NotesToolInput {
}
exports.NotesToolInput = NotesToolInput;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], NotesToolInput.prototype, "search", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], NotesToolInput.prototype, "limit", void 0);
class SearchContactsToolInput {
}
exports.SearchContactsToolInput = SearchContactsToolInput;
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SearchContactsToolInput.prototype, "query", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], SearchContactsToolInput.prototype, "limit", void 0);
class ContactHistoryToolInput {
}
exports.ContactHistoryToolInput = ContactHistoryToolInput;
__decorate([
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], ContactHistoryToolInput.prototype, "contactId", void 0);
class RelevantMemoriesToolInput {
}
exports.RelevantMemoriesToolInput = RelevantMemoriesToolInput;
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], RelevantMemoriesToolInput.prototype, "query", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.MemoryType),
    __metadata("design:type", String)
], RelevantMemoriesToolInput.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(50),
    __metadata("design:type", Number)
], RelevantMemoriesToolInput.prototype, "limit", void 0);
class FinanceSummaryToolInput {
}
exports.FinanceSummaryToolInput = FinanceSummaryToolInput;
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: false }),
    __metadata("design:type", String)
], FinanceSummaryToolInput.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: false }),
    __metadata("design:type", String)
], FinanceSummaryToolInput.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.FinanceCurrency),
    __metadata("design:type", String)
], FinanceSummaryToolInput.prototype, "currency", void 0);
class TodayFinanceToolInput {
}
exports.TodayFinanceToolInput = TodayFinanceToolInput;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.FinanceCurrency),
    __metadata("design:type", String)
], TodayFinanceToolInput.prototype, "currency", void 0);
class SearchTelegramChatsToolInput {
}
exports.SearchTelegramChatsToolInput = SearchTelegramChatsToolInput;
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], SearchTelegramChatsToolInput.prototype, "query", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Number)
], SearchTelegramChatsToolInput.prototype, "limit", void 0);
class SendTelegramMessageToolInput {
}
exports.SendTelegramMessageToolInput = SendTelegramMessageToolInput;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SendTelegramMessageToolInput.prototype, "peerId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(4096),
    __metadata("design:type", String)
], SendTelegramMessageToolInput.prototype, "text", void 0);
class GetGoogleCalendarEventsToolInput {
}
exports.GetGoogleCalendarEventsToolInput = GetGoogleCalendarEventsToolInput;
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], GetGoogleCalendarEventsToolInput.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], GetGoogleCalendarEventsToolInput.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], GetGoogleCalendarEventsToolInput.prototype, "calendarId", void 0);
class CreateGoogleCalendarEventToolInput {
}
exports.CreateGoogleCalendarEventToolInput = CreateGoogleCalendarEventToolInput;
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateGoogleCalendarEventToolInput.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], CreateGoogleCalendarEventToolInput.prototype, "start", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], CreateGoogleCalendarEventToolInput.prototype, "end", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(5000),
    __metadata("design:type", String)
], CreateGoogleCalendarEventToolInput.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.IsEmail)({}, { each: true }),
    __metadata("design:type", Array)
], CreateGoogleCalendarEventToolInput.prototype, "attendees", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateGoogleCalendarEventToolInput.prototype, "location", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateGoogleCalendarEventToolInput.prototype, "calendarId", void 0);
class UpdateGoogleCalendarEventToolInput {
}
exports.UpdateGoogleCalendarEventToolInput = UpdateGoogleCalendarEventToolInput;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(1024),
    __metadata("design:type", String)
], UpdateGoogleCalendarEventToolInput.prototype, "eventId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], UpdateGoogleCalendarEventToolInput.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], UpdateGoogleCalendarEventToolInput.prototype, "start", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], UpdateGoogleCalendarEventToolInput.prototype, "end", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(5000),
    __metadata("design:type", String)
], UpdateGoogleCalendarEventToolInput.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.IsEmail)({}, { each: true }),
    __metadata("design:type", Array)
], UpdateGoogleCalendarEventToolInput.prototype, "attendees", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], UpdateGoogleCalendarEventToolInput.prototype, "location", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], UpdateGoogleCalendarEventToolInput.prototype, "calendarId", void 0);
class DeleteGoogleCalendarEventToolInput {
}
exports.DeleteGoogleCalendarEventToolInput = DeleteGoogleCalendarEventToolInput;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(1024),
    __metadata("design:type", String)
], DeleteGoogleCalendarEventToolInput.prototype, "eventId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], DeleteGoogleCalendarEventToolInput.prototype, "calendarId", void 0);
class SearchGoogleDriveFilesToolInput {
}
exports.SearchGoogleDriveFilesToolInput = SearchGoogleDriveFilesToolInput;
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], SearchGoogleDriveFilesToolInput.prototype, "query", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SearchGoogleDriveFilesToolInput.prototype, "mimeType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], SearchGoogleDriveFilesToolInput.prototype, "limit", void 0);
class SearchFilesToolInput {
}
exports.SearchFilesToolInput = SearchFilesToolInput;
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SearchFilesToolInput.prototype, "query", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], SearchFilesToolInput.prototype, "mimeType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], SearchFilesToolInput.prototype, "folderId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['UPLOAD', 'GOOGLE_DRIVE', 'TELEGRAM', 'SYSTEM']),
    __metadata("design:type", String)
], SearchFilesToolInput.prototype, "source", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], SearchFilesToolInput.prototype, "limit", void 0);
class GetFileMetadataToolInput {
}
exports.GetFileMetadataToolInput = GetFileMetadataToolInput;
__decorate([
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], GetFileMetadataToolInput.prototype, "fileId", void 0);
class CompareFinancePeriodsToolInput {
}
exports.CompareFinancePeriodsToolInput = CompareFinancePeriodsToolInput;
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: false }),
    __metadata("design:type", String)
], CompareFinancePeriodsToolInput.prototype, "currentFrom", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: false }),
    __metadata("design:type", String)
], CompareFinancePeriodsToolInput.prototype, "currentTo", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: false }),
    __metadata("design:type", String)
], CompareFinancePeriodsToolInput.prototype, "previousFrom", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: false }),
    __metadata("design:type", String)
], CompareFinancePeriodsToolInput.prototype, "previousTo", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.FinanceCurrency),
    __metadata("design:type", String)
], CompareFinancePeriodsToolInput.prototype, "currency", void 0);
class CreateTaskToolInput {
}
exports.CreateTaskToolInput = CreateTaskToolInput;
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateTaskToolInput.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(5000),
    __metadata("design:type", String)
], CreateTaskToolInput.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], CreateTaskToolInput.prototype, "dueAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(client_1.TaskPriority),
    __metadata("design:type", String)
], CreateTaskToolInput.prototype, "priority", void 0);
class CreateReminderToolInput {
}
exports.CreateReminderToolInput = CreateReminderToolInput;
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateReminderToolInput.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], CreateReminderToolInput.prototype, "remindAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(5000),
    __metadata("design:type", String)
], CreateReminderToolInput.prototype, "note", void 0);
class CreateMeetingToolInput {
}
exports.CreateMeetingToolInput = CreateMeetingToolInput;
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateMeetingToolInput.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], CreateMeetingToolInput.prototype, "startAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true, strictSeparator: true }),
    (0, class_validator_1.Matches)(dateTimeWithTimezone),
    __metadata("design:type", String)
], CreateMeetingToolInput.prototype, "endAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], CreateMeetingToolInput.prototype, "contactId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateMeetingToolInput.prototype, "location", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(5000),
    __metadata("design:type", String)
], CreateMeetingToolInput.prototype, "notes", void 0);
class CreateNoteToolInput {
}
exports.CreateNoteToolInput = CreateNoteToolInput;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateNoteToolInput.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(50000),
    __metadata("design:type", String)
], CreateNoteToolInput.prototype, "content", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], CreateNoteToolInput.prototype, "contactId", void 0);
class CreateContactToolInput extends create_contact_dto_1.CreateContactDto {
}
exports.CreateContactToolInput = CreateContactToolInput;
class SaveMemoryToolInput {
}
exports.SaveMemoryToolInput = SaveMemoryToolInput;
__decorate([
    (0, class_validator_1.IsEnum)(client_1.MemoryType),
    __metadata("design:type", String)
], SaveMemoryToolInput.prototype, "type", void 0);
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], SaveMemoryToolInput.prototype, "key", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(20000),
    __metadata("design:type", String)
], SaveMemoryToolInput.prototype, "value", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(10),
    __metadata("design:type", Number)
], SaveMemoryToolInput.prototype, "importance", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], SaveMemoryToolInput.prototype, "contactId", void 0);
class CreateFinanceTransactionToolInput {
}
exports.CreateFinanceTransactionToolInput = CreateFinanceTransactionToolInput;
__decorate([
    (0, class_validator_1.IsEnum)(client_1.FinanceTransactionType),
    __metadata("design:type", String)
], CreateFinanceTransactionToolInput.prototype, "type", void 0);
__decorate([
    (0, class_transformer_1.Transform)(({ value }) => (typeof value === 'number' ? String(value) : trim({ value }))),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsDecimal)({ decimal_digits: '0,2' }),
    (0, class_validator_1.Matches)(finance_validation_1.FINANCE_AMOUNT_PATTERN),
    __metadata("design:type", String)
], CreateFinanceTransactionToolInput.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.FinanceCurrency),
    __metadata("design:type", String)
], CreateFinanceTransactionToolInput.prototype, "currency", void 0);
__decorate([
    (0, class_transformer_1.Transform)(trim),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], CreateFinanceTransactionToolInput.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], CreateFinanceTransactionToolInput.prototype, "categoryId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4'),
    __metadata("design:type", String)
], CreateFinanceTransactionToolInput.prototype, "contactId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: false }),
    __metadata("design:type", String)
], CreateFinanceTransactionToolInput.prototype, "transactionDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(5000),
    __metadata("design:type", String)
], CreateFinanceTransactionToolInput.prototype, "description", void 0);
//# sourceMappingURL=tool-input.dto.js.map
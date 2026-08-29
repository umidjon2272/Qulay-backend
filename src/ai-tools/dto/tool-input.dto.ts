import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDecimal, IsEmail, IsEnum, IsISO8601, IsInt, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import {
  FinanceCurrency, FinanceTransactionType, MemoryType, MeetingStatus, TaskPriority, TaskStatus,
} from '@prisma/client';
import { CreateContactDto } from '../../contacts/dto/create-contact.dto';
import { UpdateContactDto } from '../../contacts/dto/update-contact.dto';
import { FINANCE_AMOUNT_PATTERN } from '../../finance/dto/finance-validation';

const dateTimeWithTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/;
const dateKey = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class EmptyToolInput {}

export class TodayPlanInput {
  @IsOptional() @IsString() @Matches(dateKey) date?: string;
}

export class TasksToolInput {
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsString() @Matches(dateKey) date?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class RemindersToolInput {
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsString() @Matches(dateKey) date?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class MeetingsToolInput {
  @IsOptional() @IsString() @Matches(dateKey) date?: string;
  @IsOptional() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) from?: string;
  @IsOptional() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) to?: string;
  @IsOptional() @IsEnum(MeetingStatus) status?: MeetingStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class NotesToolInput {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class SearchContactsToolInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) query!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class ContactHistoryToolInput {
  @IsUUID('4') contactId!: string;
}

export class RelevantMemoriesToolInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) query!: string;
  @IsOptional() @IsEnum(MemoryType) type?: MemoryType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class FinanceSummaryToolInput {
  @IsISO8601({ strict: false }) from!: string;
  @IsISO8601({ strict: false }) to!: string;
  @IsEnum(FinanceCurrency) currency!: FinanceCurrency;
}

export class TodayFinanceToolInput {
  @IsOptional() @IsEnum(FinanceCurrency) currency?: FinanceCurrency;
}

export class SearchTelegramChatsToolInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) query!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}

export class SendTelegramMessageToolInput {
  @IsString() @MinLength(1) @MaxLength(200) peerId!: string;
  @IsString() @MinLength(1) @MaxLength(4096) text!: string;
}

export class GetGoogleCalendarEventsToolInput {
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) from!: string;
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) to!: string;
  @IsOptional() @IsString() @MaxLength(200) calendarId?: string;
}

export class CreateGoogleCalendarEventToolInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) start!: string;
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) end!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true }) attendees?: string[];
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional() @IsString() @MaxLength(200) calendarId?: string;
}

export class UpdateGoogleCalendarEventToolInput {
  @IsString() @MinLength(1) @MaxLength(1024) eventId!: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) start?: string;
  @IsOptional() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) end?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true }) attendees?: string[];
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional() @IsString() @MaxLength(200) calendarId?: string;
}

export class DeleteGoogleCalendarEventToolInput {
  @IsString() @MinLength(1) @MaxLength(1024) eventId!: string;
  @IsOptional() @IsString() @MaxLength(200) calendarId?: string;
}

export class SearchGoogleDriveFilesToolInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) query!: string;
  @IsOptional() @IsString() @MaxLength(200) mimeType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class SearchFilesToolInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) query!: string;
  @IsOptional() @IsString() @MaxLength(200) mimeType?: string;
  @IsOptional() @IsUUID('4') folderId?: string;
  @IsOptional() @IsEnum(['UPLOAD', 'GOOGLE_DRIVE', 'TELEGRAM', 'SYSTEM']) source?: 'UPLOAD' | 'GOOGLE_DRIVE' | 'TELEGRAM' | 'SYSTEM';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class GetFileMetadataToolInput {
  @IsUUID('4') fileId!: string;
}

export class GetFileContentToolInput {
  @IsUUID('4') fileId!: string;
}

export class CompareFinancePeriodsToolInput {
  @IsISO8601({ strict: false }) currentFrom!: string;
  @IsISO8601({ strict: false }) currentTo!: string;
  @IsISO8601({ strict: false }) previousFrom!: string;
  @IsISO8601({ strict: false }) previousTo!: string;
  @IsEnum(FinanceCurrency) currency!: FinanceCurrency;
}

export class CreateTaskToolInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) dueAt?: string;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
}

export class CreateReminderToolInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) remindAt!: string;
  @IsOptional() @IsString() @MaxLength(5000) note?: string;
}

export class CreateMeetingToolInput {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) startAt!: string;
  @IsOptional() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) endAt?: string;
  @IsOptional() @IsUUID('4') contactId?: string;
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class CreateNoteToolInput {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) title?: string;
  @IsString() @MinLength(1) @MaxLength(50000) content!: string;
  @IsOptional() @IsUUID('4') contactId?: string;
}

export class CreateContactToolInput extends CreateContactDto {}

export class UpdateContactToolInput extends UpdateContactDto {
  @IsUUID('4') contactId!: string;
}

export class DeleteContactToolInput {
  @IsUUID('4') contactId!: string;
}

export class SaveMemoryToolInput {
  @IsEnum(MemoryType) type!: MemoryType;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) key!: string;
  @IsString() @MinLength(1) @MaxLength(20000) value!: string;
  @IsOptional() @IsInt() @Min(1) @Max(10) importance?: number;
  @IsOptional() @IsUUID('4') contactId?: string;
}

export class UpdateMemoryToolInput {
  @IsUUID('4') memoryId!: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) key?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20000) value?: string;
  @IsOptional() @IsEnum(MemoryType) type?: MemoryType;
  @IsOptional() @IsInt() @Min(1) @Max(10) importance?: number;
}

export class DeleteMemoryToolInput {
  @IsUUID('4') memoryId!: string;
}

export class CreateFinanceTransactionToolInput {
  @IsEnum(FinanceTransactionType) type!: FinanceTransactionType;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : trim({ value })))
  @IsString() @IsDecimal({ decimal_digits: '0,2' }) @Matches(FINANCE_AMOUNT_PATTERN) amount!: string;
  @IsEnum(FinanceCurrency) currency!: FinanceCurrency;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsUUID('4') categoryId?: string;
  @IsOptional() @IsUUID('4') accountId?: string;
  @IsOptional() @IsUUID('4') contactId?: string;
  @IsOptional() @IsISO8601({ strict: false }) transactionDate?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
}

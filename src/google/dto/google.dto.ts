import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsEmail, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, Matches,
} from 'class-validator';

const dateTimeWithTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class GoogleCallbackQueryDto {
  @IsOptional() @IsString() @MaxLength(4096) code?: string;
  @IsOptional() @IsString() @MaxLength(4096) state?: string;
  @IsOptional() @IsString() @MaxLength(200) error?: string;
  @IsOptional() @IsString() @MaxLength(2000) error_description?: string;
  /** Provider metadata only. Never used for authorization or token exchange. */
  @IsOptional() @IsString() @MaxLength(4096) scope?: string;
  /** Provider metadata only. The configured OAuth endpoints remain authoritative. */
  @IsOptional() @IsString() @MaxLength(2048) iss?: string;
}

export class CalendarEventsQueryDto {
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) from!: string;
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) to!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) calendarId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class AttendeeDto {
  @Transform(trim) @IsEmail() email!: string;
}

export class CreateCalendarEventDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) start!: string;
  @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) end!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true }) attendees?: string[];
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) calendarId?: string;
}

export class UpdateCalendarEventDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) start?: string;
  @IsOptional() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(dateTimeWithTimezone) end?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true }) attendees?: string[];
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) calendarId?: string;
}

export class DriveFilesQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) q?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) mimeType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @MaxLength(2000) pageToken?: string;
}

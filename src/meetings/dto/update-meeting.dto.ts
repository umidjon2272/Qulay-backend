import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MeetingStatus } from '@prisma/client';

const dateTimeWithTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/;

export class UpdateMeetingDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  participant?: string;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(dateTimeWithTimezone, { message: 'startsAt must include a timezone offset or Z' })
  startsAt?: string;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(dateTimeWithTimezone, { message: 'endsAt must include a timezone offset or Z' })
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  reminderMinutesBefore?: number;

  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;
}

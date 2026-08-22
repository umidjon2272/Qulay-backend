import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { TaskPriority, TaskStatus } from '@prisma/client';

const dateTimeWithTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/;

export class UpdateTaskDto {
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
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(dateTimeWithTimezone, { message: 'dueDate must include a timezone offset or Z' })
  dueDate?: string;
}

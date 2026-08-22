import { IsEnum, IsISO8601, IsOptional, IsString, Matches } from 'class-validator';
import { MeetingStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const dateTimeWithTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/;

export class MeetingQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(dateTimeWithTimezone, { message: 'from must include a timezone offset or Z' })
  from?: string;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(dateTimeWithTimezone, { message: 'to must include a timezone offset or Z' })
  to?: string;

  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;
}

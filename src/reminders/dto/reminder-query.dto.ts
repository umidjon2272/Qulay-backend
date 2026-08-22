import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { TaskPriority } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const booleanTransform = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export class ReminderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(booleanTransform)
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Transform(booleanTransform)
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

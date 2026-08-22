import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MemoryCategory } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class MemoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(MemoryCategory)
  category?: MemoryCategory;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

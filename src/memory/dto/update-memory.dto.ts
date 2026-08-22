import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MemoryCategory } from '@prisma/client';

export class UpdateMemoryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  key?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  value?: string;

  @IsOptional()
  @IsEnum(MemoryCategory)
  category?: MemoryCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  importance?: number;
}

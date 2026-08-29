import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MemoryStatus, MemoryType } from '@prisma/client';

export class CreateMemoryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  value!: string;

  @IsOptional()
  @IsEnum(MemoryType)
  type?: MemoryType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  importance?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  confidence?: number;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsEnum(MemoryStatus)
  status?: MemoryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsUUID('4')
  contactId?: string | null;
}

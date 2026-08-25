import { IsEnum, IsOptional } from 'class-validator';
import { FinanceCategoryType } from '@prisma/client';

export class FinanceCategoryQueryDto {
  @IsOptional()
  @IsEnum(FinanceCategoryType)
  type?: FinanceCategoryType;
}

import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { FinanceCurrency } from '@prisma/client';

export class FinanceSummaryQueryDto {
  @IsOptional()
  @IsISO8601({ strict: false })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: false })
  to?: string;

  @IsOptional()
  @IsEnum(FinanceCurrency)
  currency?: FinanceCurrency;
}

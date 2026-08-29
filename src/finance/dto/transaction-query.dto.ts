import { IsDecimal, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { FinanceCurrency, FinanceTransactionType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FINANCE_AMOUNT_PATTERN } from './finance-validation';

export class FinanceTransactionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(FinanceTransactionType)
  type?: FinanceTransactionType;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  @IsOptional()
  @IsISO8601({ strict: false })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: false })
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Matches(FINANCE_AMOUNT_PATTERN)
  minAmount?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Matches(FINANCE_AMOUNT_PATTERN)
  maxAmount?: string;

  @IsOptional()
  @IsEnum(FinanceCurrency)
  currency?: FinanceCurrency;
}

import { Transform } from 'class-transformer';
import { IsDecimal, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { FinanceCurrency, FinanceTransactionType } from '@prisma/client';
import { DATE_TIME_WITH_ZONE_PATTERN, FINANCE_AMOUNT_PATTERN } from './finance-validation';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateFinanceTransactionDto {
  @IsOptional()
  @IsEnum(FinanceTransactionType)
  type?: FinanceTransactionType;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : trim({ value })))
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  @Matches(FINANCE_AMOUNT_PATTERN, { message: 'amount must be a positive decimal with at most 2 fractional digits' })
  amount?: string;

  @IsOptional()
  @IsEnum(FinanceCurrency)
  currency?: FinanceCurrency;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(DATE_TIME_WITH_ZONE_PATTERN, { message: 'transactionDate must include a timezone offset or Z' })
  transactionDate?: string;

  @IsOptional()
  @IsUUID('4')
  contactId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  source?: string;
}

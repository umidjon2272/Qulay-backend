import { Transform } from 'class-transformer';
import { IsDecimal, IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { FinanceCurrency } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const AMOUNT_PATTERN = /^\d{1,16}(?:\.\d{1,2})?$/;

export class CreateFinanceBudgetDto {
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @IsEnum(FinanceCurrency)
  currency!: FinanceCurrency;

  @Transform(trim)
  @IsString()
  @Matches(MONTH_KEY_PATTERN)
  monthKey!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : trim({ value })))
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  @Matches(AMOUNT_PATTERN)
  amount!: string;
}

export class UpdateFinanceBudgetDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : trim({ value })))
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  @Matches(AMOUNT_PATTERN)
  amount?: string;
}

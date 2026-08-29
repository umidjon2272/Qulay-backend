import { Transform } from 'class-transformer';
import { IsBoolean, IsDecimal, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { FinanceAccountType, FinanceCurrency } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateFinanceAccountDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsEnum(FinanceAccountType)
  type!: FinanceAccountType;

  @IsEnum(FinanceCurrency)
  currency!: FinanceCurrency;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : trim({ value })))
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  @Matches(/^-?\d{1,16}(?:\.\d{1,2})?$/)
  openingBalance?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateFinanceAccountDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(FinanceAccountType)
  type?: FinanceAccountType;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : trim({ value })))
  @IsString()
  @IsDecimal({ decimal_digits: '0,2' })
  @Matches(/^-?\d{1,16}(?:\.\d{1,2})?$/)
  openingBalance?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

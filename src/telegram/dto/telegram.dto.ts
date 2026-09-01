import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const phonePattern = /^\+[1-9]\d{7,14}$/;

export class ConnectTelegramDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/[\s()-]/g, '').replace(/^00/, '+') : value))
  @IsString()
  @Matches(phonePattern, { message: 'phoneNumber must be a valid international phone number' })
  phoneNumber!: string;
}


export class VerifyTelegramCodeDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;
}

export class VerifyTelegramPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}

export class TelegramSearchQueryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;
}

export class TelegramChatsQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;
}

export class SendTelegramMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  peerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;

  @IsBoolean()
  confirmed!: boolean;
}

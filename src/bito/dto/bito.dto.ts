import { BitoAuthMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class ConnectBitoDto {
  @IsUrl({ require_tld: false, protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  serverUrl!: string;

  @IsOptional()
  @IsEnum(BitoAuthMode)
  authMode: BitoAuthMode = BitoAuthMode.NONE;

  @ValidateIf((input: ConnectBitoDto) => input.authMode !== BitoAuthMode.NONE)
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  accessToken?: string;
}

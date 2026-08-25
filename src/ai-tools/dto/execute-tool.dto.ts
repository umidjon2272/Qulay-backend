import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ExecuteToolDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  tool!: string;

  @IsObject()
  input!: Record<string, unknown>;

  @IsBoolean()
  confirmed!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class AgentChatDto {
  @IsOptional() @IsBoolean() voice?: boolean;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  message!: string;

  @IsOptional()
  @IsUUID('4')
  conversationId?: string;
}

export class AgentConfirmationDto {
  @IsBoolean()
  confirmed!: boolean;
}

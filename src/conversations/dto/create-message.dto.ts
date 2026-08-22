import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MessageRole } from '@prisma/client';

export class CreateMessageDto {
  @IsOptional()
  @IsEnum(MessageRole)
  role?: MessageRole;

  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  content!: string;
}

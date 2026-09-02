import { Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AiVoiceService, VoiceUpload } from './ai-voice.service';

export class TranscribeVoiceDto {
  @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0.1) @Max(90) durationSeconds!: number;
}
export class SpeakVoiceDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(4096) text!: string;
  @IsOptional() @IsIn(['marin', 'cedar']) voice?: 'marin' | 'cedar';
}
@Controller('ai/voice')
@UseGuards(JwtAuthGuard)
export class AiVoiceController {
  constructor(private readonly voice: AiVoiceService) {}
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 1 } }))
  transcribe(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: VoiceUpload, @Body() dto: TranscribeVoiceDto) { return this.voice.transcribe(user.sub, file, dto.durationSeconds); }
  @Post('speak')
  speak(@CurrentUser() user: AuthenticatedUser, @Body() dto: SpeakVoiceDto) { return this.voice.speak(user.sub, dto.text, dto.voice); }
  @Post('realtime/session')
  realtimeSession(@CurrentUser() user: AuthenticatedUser) { return this.voice.createRealtimeSession(user.sub); }
}

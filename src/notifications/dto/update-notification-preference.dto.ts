import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsOptional() @IsBoolean() taskEnabled?: boolean;
  @IsOptional() @IsBoolean() reminderEnabled?: boolean;
  @IsOptional() @IsBoolean() meetingEnabled?: boolean;
  @IsOptional() @IsBoolean() aiEnabled?: boolean;
  @IsOptional() @IsBoolean() telegramEnabled?: boolean;
  @IsOptional() @IsBoolean() webPushEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10080) defaultMeetingMinutesBefore?: number;
}

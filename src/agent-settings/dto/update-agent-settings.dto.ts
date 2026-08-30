import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateAgentSettingsDto {
  @IsOptional() @IsBoolean() morningBriefingEnabled?: boolean;
  @IsOptional() @IsString() @Matches(TIME_PATTERN) morningBriefingTime?: string;

  @IsOptional() @IsBoolean() eveningSummaryEnabled?: boolean;
  @IsOptional() @IsString() @Matches(TIME_PATTERN) eveningSummaryTime?: string;

  @IsOptional() @IsBoolean() telegramDelivery?: boolean;
  @IsOptional() @IsBoolean() inAppDelivery?: boolean;
  @IsOptional() @IsBoolean() proactiveEnabled?: boolean;
  @IsOptional() @IsBoolean() financialAlertsEnabled?: boolean;

  @IsOptional() @IsString() @Matches(TIME_PATTERN) quietHoursStart?: string;
  @IsOptional() @IsString() @Matches(TIME_PATTERN) quietHoursEnd?: string;

  @IsOptional() @IsString() timezone?: string;
}

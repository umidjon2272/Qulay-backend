import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { FileSource, FileStorageProvider, FinanceCurrency, SubscriptionStatus, SubscriptionTier, UserRole, UserStatus } from '@prisma/client';

export class AdminRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30, 90])
  range = 30;
}

export class AdminUsersQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(['createdAt', 'lastActivity']) sort: 'createdAt' | 'lastActivity' = 'createdAt';
  @IsOptional() @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'desc';
}

export class AdminActivityQueryDto {
  @IsOptional() @IsUUID('4') userId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class AdminStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class AdminRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}

export class UpdateSubscriptionPlanDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsInt() @Min(0) monthlyPrice?: number;
  @IsOptional() @IsEnum(FinanceCurrency) currency?: FinanceCurrency;
  @IsOptional() @IsInt() @Min(0) aiCreditsPerMonth?: number;
  @IsOptional() @IsInt() @Min(0) toolActionsPerMonth?: number;
  @IsOptional() @IsInt() @Min(0) voiceMinutesPerMonth?: number;
  @IsOptional() @IsInt() @Min(0) files?: number;
  @IsOptional() @IsInt() @Min(0) storageMb?: number;
  @IsOptional() @IsInt() @Min(0) memories?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AssignUserSubscriptionDto {
  @IsEnum(SubscriptionTier) tier!: SubscriptionTier;
  @IsOptional() @IsEnum(SubscriptionStatus) status?: SubscriptionStatus;
}


export class UpdateAdminPlatformSettingsDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsBoolean() registrationEnabled?: boolean;
}


export class AdminFilesQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(FileSource) source?: FileSource;
  @IsOptional() @IsEnum(FileStorageProvider) storageProvider?: FileStorageProvider;
  @IsOptional() @IsIn(['image', 'pdf', 'document']) type?: 'image' | 'pdf' | 'document';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

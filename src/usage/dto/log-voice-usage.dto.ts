import { IsInt, Max, Min } from 'class-validator';
export class LogVoiceUsageDto { @IsInt() @Min(1) @Max(7200) audioSeconds!: number; }

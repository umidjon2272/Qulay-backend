import { IsISO8601, IsOptional } from 'class-validator';

export class SnoozeSuggestionDto {
  @IsOptional()
  @IsISO8601({ strict: false })
  until?: string;
}

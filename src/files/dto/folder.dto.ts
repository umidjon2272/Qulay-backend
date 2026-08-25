import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateFolderDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsUUID('4') parentId?: string;
}

export class UpdateFolderDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsUUID('4') parentId?: string | null;
}

import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class UploadFileDto {
  @IsOptional() @IsUUID('4') folderId?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) label?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) title?: string;
}

import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FileSource, FileStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FileQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsString() @MaxLength(200) mimeType?: string;
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsEnum(FileSource) source?: FileSource;
  @IsOptional() @IsEnum(FileStatus) status?: FileStatus;
  @IsOptional() @IsString() @MaxLength(30) sort?: 'createdAt' | 'originalName' | 'sizeBytes';
}

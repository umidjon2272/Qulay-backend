import { FileSource, FileStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
export declare class FileQueryDto extends PaginationQueryDto {
    search?: string;
    mimeType?: string;
    folderId?: string;
    source?: FileSource;
    status?: FileStatus;
    sort?: 'createdAt' | 'originalName' | 'sizeBytes';
}

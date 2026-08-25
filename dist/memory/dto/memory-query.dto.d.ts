import { MemoryType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
export declare class MemoryQueryDto extends PaginationQueryDto {
    type?: MemoryType;
    key?: string;
    search?: string;
    contactId?: string;
    importance?: number;
}

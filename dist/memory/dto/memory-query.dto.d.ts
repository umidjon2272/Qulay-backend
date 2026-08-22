import { MemoryCategory } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
export declare class MemoryQueryDto extends PaginationQueryDto {
    category?: MemoryCategory;
    key?: string;
    search?: string;
}

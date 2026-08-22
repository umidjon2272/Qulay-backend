import { MemoryCategory } from '@prisma/client';
export declare class UpdateMemoryDto {
    key?: string;
    value?: string;
    category?: MemoryCategory;
    importance?: number;
}

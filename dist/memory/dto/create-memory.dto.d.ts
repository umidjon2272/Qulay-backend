import { MemoryCategory } from '@prisma/client';
export declare class CreateMemoryDto {
    key: string;
    value: string;
    category?: MemoryCategory;
    importance?: number;
}

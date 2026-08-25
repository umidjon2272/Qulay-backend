import { MemoryType } from '@prisma/client';
export declare class UpdateMemoryDto {
    key?: string;
    value?: string;
    type?: MemoryType;
    importance?: number;
    source?: string;
    contactId?: string | null;
}

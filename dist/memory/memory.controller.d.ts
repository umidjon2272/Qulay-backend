import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { MemoryService } from './memory.service';
export declare class MemoryController {
    private readonly memoryService;
    constructor(memoryService: MemoryService);
    list(user: AuthenticatedUser, query: MemoryQueryDto): Promise<{
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            value: string;
            userId: string;
            key: string;
            category: import(".prisma/client").$Enums.MemoryCategory;
            importance: number;
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    create(user: AuthenticatedUser, dto: CreateMemoryDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        value: string;
        userId: string;
        key: string;
        category: import(".prisma/client").$Enums.MemoryCategory;
        importance: number;
    }>;
    update(user: AuthenticatedUser, id: string, dto: UpdateMemoryDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        value: string;
        userId: string;
        key: string;
        category: import(".prisma/client").$Enums.MemoryCategory;
        importance: number;
    }>;
    delete(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
}

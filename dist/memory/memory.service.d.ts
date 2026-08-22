import { PrismaService } from '../prisma/prisma.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
export declare class MemoryService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listForUser(userId: string, query: MemoryQueryDto): Promise<{
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
    createForUser(userId: string, dto: CreateMemoryDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        value: string;
        userId: string;
        key: string;
        category: import(".prisma/client").$Enums.MemoryCategory;
        importance: number;
    }>;
    updateForUser(userId: string, id: string, dto: UpdateMemoryDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        value: string;
        userId: string;
        key: string;
        category: import(".prisma/client").$Enums.MemoryCategory;
        importance: number;
    }>;
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
    private getForUser;
}

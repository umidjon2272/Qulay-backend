import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { MemoryService } from './memory.service';
export declare class MemoryController {
    private readonly memoryService;
    constructor(memoryService: MemoryService);
    list(user: AuthenticatedUser, query: MemoryQueryDto): Promise<{
        items: ({
            contact: {
                id: string;
                email: string | null;
                firstName: string;
                lastName: string | null;
                createdAt: Date;
                updatedAt: Date;
                notes: string | null;
                userId: string;
                displayName: string;
                phone: string | null;
                telegramUsername: string | null;
                company: string | null;
                position: string | null;
                tags: string[];
            } | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            key: string;
            userId: string;
            value: string;
            type: import(".prisma/client").$Enums.MemoryType;
            contactId: string | null;
            importance: number;
            source: string;
            lastUsedAt: Date | null;
        })[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    create(user: AuthenticatedUser, dto: CreateMemoryDto): Promise<{
        contact: {
            id: string;
            email: string | null;
            firstName: string;
            lastName: string | null;
            createdAt: Date;
            updatedAt: Date;
            notes: string | null;
            userId: string;
            displayName: string;
            phone: string | null;
            telegramUsername: string | null;
            company: string | null;
            position: string | null;
            tags: string[];
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        key: string;
        userId: string;
        value: string;
        type: import(".prisma/client").$Enums.MemoryType;
        contactId: string | null;
        importance: number;
        source: string;
        lastUsedAt: Date | null;
    }>;
    update(user: AuthenticatedUser, id: string, dto: UpdateMemoryDto): Promise<{
        contact: {
            id: string;
            email: string | null;
            firstName: string;
            lastName: string | null;
            createdAt: Date;
            updatedAt: Date;
            notes: string | null;
            userId: string;
            displayName: string;
            phone: string | null;
            telegramUsername: string | null;
            company: string | null;
            position: string | null;
            tags: string[];
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        key: string;
        userId: string;
        value: string;
        type: import(".prisma/client").$Enums.MemoryType;
        contactId: string | null;
        importance: number;
        source: string;
        lastUsedAt: Date | null;
    }>;
    delete(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
}

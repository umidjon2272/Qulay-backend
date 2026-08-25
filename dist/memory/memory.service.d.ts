import { MemoryType } from '@prisma/client';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
export type MemoryRetrievalOptions = {
    type?: MemoryType;
    contactId?: string;
    importance?: number;
    limit?: number;
};
export declare class MemoryService {
    private readonly prisma;
    private readonly activityLog;
    constructor(prisma: PrismaService, activityLog: ActivityLogService);
    listForUser(userId: string, query: MemoryQueryDto): Promise<{
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
    createForUser(userId: string, dto: CreateMemoryDto): Promise<{
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
    updateForUser(userId: string, id: string, dto: UpdateMemoryDto): Promise<{
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
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
    getRelevantMemories(userId: string, query: string, options?: MemoryRetrievalOptions): Promise<({
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
    })[]>;
    private buildWhere;
    private assertContactOwnership;
    private getForUser;
    private throwDuplicateMemory;
}

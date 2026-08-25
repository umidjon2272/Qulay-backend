import { ActivityLogService } from '../activity-log/activity-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
export declare class ContactsService {
    private readonly prisma;
    private readonly activityLog;
    constructor(prisma: PrismaService, activityLog: ActivityLogService);
    listForUser(userId: string, query: ContactQueryDto): Promise<{
        items: {
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
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    getForUser(userId: string, id: string): Promise<{
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
    }>;
    createForUser(userId: string, dto: CreateContactDto): Promise<{
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
    }>;
    updateForUser(userId: string, id: string, dto: UpdateContactDto): Promise<{
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
    }>;
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
    private normalizeTags;
}

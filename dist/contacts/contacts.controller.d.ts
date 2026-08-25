import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { ContactHistoryService } from './contact-history.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ContactsService } from './contacts.service';
export declare class ContactsController {
    private readonly contactsService;
    private readonly contactHistoryService;
    constructor(contactsService: ContactsService, contactHistoryService: ContactHistoryService);
    list(user: AuthenticatedUser, query: ContactQueryDto): Promise<{
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
    history(user: AuthenticatedUser, id: string): Promise<{
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
        };
        recentMeetings: {
            id: string;
            status: import(".prisma/client").$Enums.MeetingStatus;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            title: string;
            description: string | null;
            participant: string | null;
            location: string | null;
            startsAt: Date;
            endsAt: Date;
            reminderMinutesBefore: number;
            contactId: string | null;
        }[];
        relatedNotes: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            content: string;
            title: string;
            contactId: string | null;
        }[];
        relatedMemories: {
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
        }[];
        tasks: never[];
    }>;
    get(user: AuthenticatedUser, id: string): Promise<{
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
    create(user: AuthenticatedUser, dto: CreateContactDto): Promise<{
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
    update(user: AuthenticatedUser, id: string, dto: UpdateContactDto): Promise<{
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
    delete(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
}

import { PrismaService } from '../prisma/prisma.service';
export declare class ContactHistoryService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getContactHistory(userId: string, contactId: string): Promise<{
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
}

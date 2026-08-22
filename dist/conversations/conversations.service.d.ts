import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
export declare class ConversationsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listForUser(userId: string, query: ConversationQueryDto): Promise<{
        items: {
            messageCount: number;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            title: string;
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    getForUser(userId: string, id: string): Promise<{
        messageCount: number;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
    }>;
    createForUser(userId: string, dto: CreateConversationDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
    }>;
    deleteForUser(userId: string, id: string): Promise<{
        message: string;
    }>;
}

import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
export declare class MessagesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listForConversation(userId: string, conversationId: string, query: MessageQueryDto): Promise<{
        items: {
            id: string;
            role: import(".prisma/client").$Enums.MessageRole;
            createdAt: Date;
            content: string;
            conversationId: string;
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    createForConversation(userId: string, conversationId: string, dto: CreateMessageDto): Promise<{
        id: string;
        role: import(".prisma/client").$Enums.MessageRole;
        createdAt: Date;
        content: string;
        conversationId: string;
    }>;
    private getConversationForUser;
}

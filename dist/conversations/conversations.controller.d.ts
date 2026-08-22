import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateMessageDto } from '../messages/dto/create-message.dto';
import { MessageQueryDto } from '../messages/dto/message-query.dto';
import { MessagesService } from '../messages/messages.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { ConversationsService } from './conversations.service';
export declare class ConversationsController {
    private readonly conversationsService;
    private readonly messagesService;
    constructor(conversationsService: ConversationsService, messagesService: MessagesService);
    list(user: AuthenticatedUser, query: ConversationQueryDto): Promise<{
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
    create(user: AuthenticatedUser, dto: CreateConversationDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
    }>;
    listMessages(user: AuthenticatedUser, id: string, query: MessageQueryDto): Promise<{
        items: {
            id: string;
            role: import(".prisma/client").$Enums.MessageRole;
            createdAt: Date;
            content: string;
            conversationId: string;
        }[];
        meta: import("../common/dto/pagination-query.dto").PaginationMeta;
    }>;
    addMessage(user: AuthenticatedUser, id: string, dto: CreateMessageDto): Promise<{
        id: string;
        role: import(".prisma/client").$Enums.MessageRole;
        createdAt: Date;
        content: string;
        conversationId: string;
    }>;
    get(user: AuthenticatedUser, id: string): Promise<{
        messageCount: number;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        title: string;
    }>;
    delete(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
}

import { ActivityLogService } from '../activity-log/activity-log.service';
import { ContactsService } from '../contacts/contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChatsQueryDto, TelegramSearchQueryDto } from './dto/telegram.dto';
import { TelegramClientService, TelegramPeer } from './telegram-client.service';
import { TelegramCryptoService } from './telegram-crypto.service';
export declare class TelegramIntegrationService {
    private readonly prisma;
    private readonly crypto;
    private readonly telegramClient;
    private readonly contactsService;
    private readonly activityLog;
    constructor(prisma: PrismaService, crypto: TelegramCryptoService, telegramClient: TelegramClientService, contactsService: ContactsService, activityLog: ActivityLogService);
    connect(userId: string, phoneNumber: string): Promise<{
        status: 'code_required';
    }>;
    verifyCode(userId: string, code: string): Promise<{
        status: 'connected' | 'password_required';
    }>;
    verifyPassword(userId: string, password: string): Promise<{
        status: 'connected';
    }>;
    status(userId: string): Promise<{
        connected: boolean;
        status: import(".prisma/client").$Enums.TelegramConnectionStatus;
        username: string | null;
        displayName: string | null;
        maskedPhone: string | null;
        connectedAt: Date | null;
    }>;
    disconnect(userId: string): Promise<{
        status: 'disconnected';
    }>;
    search(userId: string, query: TelegramSearchQueryDto): Promise<(TelegramPeer | {
        contactId: string;
        peerId: string;
        type: "USER" | "GROUP" | "CHANNEL";
        displayName: string;
        username: string | null;
        lastActivity: string | null;
    })[]>;
    chats(userId: string, query: TelegramChatsQueryDto): Promise<(TelegramPeer | {
        contactId: string;
        peerId: string;
        type: "USER" | "GROUP" | "CHANNEL";
        displayName: string;
        username: string | null;
        lastActivity: string | null;
    })[]>;
    prepareTelegramMessage(userId: string, peerId: string, text: string): Promise<{
        recipient: TelegramPeer;
        text: string;
        confirmationRequired: boolean;
    }>;
    sendMessage(userId: string, peerId: string, text: string): Promise<{
        messageId: string;
        recipient: TelegramPeer;
    }>;
    sendSelfNotification(userId: string, text: string): Promise<{
        messageId: string;
        recipient: TelegramPeer;
    }>;
    private finalizeConnection;
    private connected;
    private getPendingConnection;
    private decryptRequired;
    private markError;
    private handleAuthError;
    private withContactMatches;
}

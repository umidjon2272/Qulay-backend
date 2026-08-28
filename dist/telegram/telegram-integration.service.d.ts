import { ConfigService } from '@nestjs/config';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ContactsService } from '../contacts/contacts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChatsQueryDto, TelegramSearchQueryDto } from './dto/telegram.dto';
import { TelegramClientService, TelegramPeer, TelegramSentCode } from './telegram-client.service';
import { TelegramCryptoService } from './telegram-crypto.service';
type CodeRequiredResponse = {
    status: 'code_required';
    delivery: TelegramSentCode['delivery'];
    nextDelivery: TelegramSentCode['nextDelivery'];
    timeoutSeconds: TelegramSentCode['timeoutSeconds'];
};
export declare class TelegramIntegrationService {
    private readonly prisma;
    private readonly crypto;
    private readonly telegramClient;
    private readonly contactsService;
    private readonly activityLog;
    private readonly config;
    private readonly logger;
    constructor(prisma: PrismaService, crypto: TelegramCryptoService, telegramClient: TelegramClientService, contactsService: ContactsService, activityLog: ActivityLogService, config: ConfigService);
    connect(userId: string, phoneNumber: string): Promise<CodeRequiredResponse>;
    resendCode(userId: string): Promise<CodeRequiredResponse>;
    private assertResendAllowed;
    private logCodeRequested;
    verifyCode(userId: string, code: string): Promise<{
        status: 'connected' | 'password_required';
    }>;
    verifyPassword(userId: string, password: string): Promise<{
        status: 'connected';
    }>;
    status(userId: string): Promise<{
        connected: boolean;
        status: string;
        username: null;
        displayName: null;
        maskedPhone: null;
        connectedAt: null;
    } | {
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
    private requireStored;
    private decryptPendingSession;
    private markError;
    private handleAuthError;
    private withContactMatches;
    private isConfigured;
    private assertConfigured;
}
export {};

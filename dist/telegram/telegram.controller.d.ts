import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { ConnectTelegramDto, SendTelegramMessageDto, TelegramChatsQueryDto, TelegramSearchQueryDto, VerifyTelegramCodeDto, VerifyTelegramPasswordDto } from './dto/telegram.dto';
import { TelegramIntegrationService } from './telegram-integration.service';
import { SecurityRateLimitService } from '../common/security/security-rate-limit.service';
export declare class TelegramController {
    private readonly telegram;
    private readonly rateLimiter;
    constructor(telegram: TelegramIntegrationService, rateLimiter: SecurityRateLimitService);
    connect(user: AuthenticatedUser, dto: ConnectTelegramDto): Promise<{
        status: "code_required";
    }>;
    verifyCode(user: AuthenticatedUser, dto: VerifyTelegramCodeDto): Promise<{
        status: "connected" | "password_required";
    }>;
    verifyPassword(user: AuthenticatedUser, dto: VerifyTelegramPasswordDto): Promise<{
        status: "connected";
    }>;
    status(user: AuthenticatedUser): Promise<{
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
    disconnect(user: AuthenticatedUser): Promise<{
        status: "disconnected";
    }>;
    search(user: AuthenticatedUser, query: TelegramSearchQueryDto): Promise<(import("./telegram-client.service").TelegramPeer | {
        contactId: string;
        peerId: string;
        type: "USER" | "GROUP" | "CHANNEL";
        displayName: string;
        username: string | null;
        lastActivity: string | null;
    })[]>;
    chats(user: AuthenticatedUser, query: TelegramChatsQueryDto): Promise<(import("./telegram-client.service").TelegramPeer | {
        contactId: string;
        peerId: string;
        type: "USER" | "GROUP" | "CHANNEL";
        displayName: string;
        username: string | null;
        lastActivity: string | null;
    })[]>;
    send(user: AuthenticatedUser, dto: SendTelegramMessageDto): Promise<{
        status: string;
        preview: {
            recipient: import("./telegram-client.service").TelegramPeer;
            text: string;
            confirmationRequired: boolean;
        };
        messageId?: undefined;
    } | {
        status: string;
        messageId: string;
        preview?: undefined;
    }>;
    private assertAllowed;
}

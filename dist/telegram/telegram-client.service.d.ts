import { ConfigService } from '@nestjs/config';
export type TelegramAccount = {
    telegramUserId: string;
    username: string | null;
    displayName: string | null;
    phoneNumber: string | null;
};
export type TelegramPeer = {
    peerId: string;
    type: 'USER' | 'GROUP' | 'CHANNEL';
    displayName: string;
    username: string | null;
    lastActivity: string | null;
};
export type TelegramPendingLogin = {
    encryptedSessionSource: string;
    phoneCodeHash: string;
};
export type TelegramDeliveryType = 'telegram_app' | 'sms' | 'call' | 'email' | 'fragment' | 'firebase_sms' | 'unknown';
export type TelegramSentCodeMeta = {
    delivery: TelegramDeliveryType;
    nextDelivery: TelegramDeliveryType | null;
    timeoutSeconds: number | null;
    rawType: string;
    rawNextType: string | null;
};
export type TelegramSentCode = {
    session: string;
    phoneCodeHash: string;
} & TelegramSentCodeMeta;
export declare abstract class TelegramClientService {
    abstract beginLogin(phoneNumber: string): Promise<TelegramSentCode>;
    abstract resendCode(input: {
        session: string;
        phoneNumber: string;
        phoneCodeHash: string;
    }): Promise<TelegramSentCode>;
    abstract verifyCode(input: {
        session: string;
        phoneNumber: string;
        phoneCodeHash: string;
        code: string;
    }): Promise<{
        status: 'connected' | 'password_required';
        session: string;
        account?: TelegramAccount;
    }>;
    abstract verifyPassword(input: {
        session: string;
        password: string;
    }): Promise<{
        session: string;
        account: TelegramAccount;
    }>;
    abstract logout(session: string): Promise<void>;
    abstract search(session: string, query: string, limit: number): Promise<TelegramPeer[]>;
    abstract chats(session: string, search: string | undefined, limit: number): Promise<TelegramPeer[]>;
    abstract resolvePeer(session: string, peerId: string): Promise<TelegramPeer>;
    abstract sendMessage(session: string, peerId: string, text: string): Promise<{
        messageId: string;
        recipient: TelegramPeer;
    }>;
}
export declare class TeleprotoTelegramClientService extends TelegramClientService {
    private readonly logger;
    private readonly apiId;
    private readonly apiHash;
    constructor(config: ConfigService);
    beginLogin(phoneNumber: string): Promise<TelegramSentCode>;
    resendCode(input: {
        session: string;
        phoneNumber: string;
        phoneCodeHash: string;
    }): Promise<TelegramSentCode>;
    private requestSentCode;
    private logSentCodeDiagnostic;
    private sentCodeLength;
    private describeSentCode;
    private mapDeliveryType;
    private mapNextDeliveryType;
    verifyCode(input: {
        session: string;
        phoneNumber: string;
        phoneCodeHash: string;
        code: string;
    }): Promise<{
        status: 'connected' | 'password_required';
        session: string;
        account?: TelegramAccount;
    }>;
    verifyPassword(input: {
        session: string;
        password: string;
    }): Promise<{
        session: string;
        account: TelegramAccount;
    }>;
    logout(session: string): Promise<void>;
    search(session: string, query: string, limit: number): Promise<TelegramPeer[]>;
    chats(session: string, search: string | undefined, limit: number): Promise<TelegramPeer[]>;
    resolvePeer(session: string, peerId: string): Promise<TelegramPeer>;
    sendMessage(session: string, peerId: string, text: string): Promise<{
        messageId: string;
        recipient: TelegramPeer;
    }>;
    private client;
    private credentials;
    private savedSession;
    private account;
    private listPeers;
    private toPeer;
}

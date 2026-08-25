export declare class ConnectTelegramDto {
    phoneNumber: string;
}
export declare class VerifyTelegramCodeDto {
    code: string;
}
export declare class VerifyTelegramPasswordDto {
    password: string;
}
export declare class TelegramSearchQueryDto {
    q: string;
    limit: number;
}
export declare class TelegramChatsQueryDto {
    search?: string;
    limit: number;
}
export declare class SendTelegramMessageDto {
    peerId: string;
    text: string;
    confirmed: boolean;
}

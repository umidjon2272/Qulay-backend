import { ConfigService } from '@nestjs/config';
export declare class TelegramCryptoService {
    private readonly key;
    constructor(config: ConfigService);
    encrypt(value: string): string;
    decrypt(payload: string): string;
    maskPhone(payload: string | null): string | null;
    private requiredKey;
}

import { ConfigService } from '@nestjs/config';
export declare class GoogleCryptoService {
    private readonly key;
    constructor(config: ConfigService);
    encrypt(value: string): string;
    decrypt(payload: string): string;
}

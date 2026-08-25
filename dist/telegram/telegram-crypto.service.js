"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramCryptoService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
let TelegramCryptoService = class TelegramCryptoService {
    constructor(config) {
        const key = config.getOrThrow('telegram.sessionEncryptionKey');
        this.key = Buffer.from(key, 'hex');
        if (this.key.length !== 32)
            throw new Error('TELEGRAM_SESSION_ENCRYPTION_KEY must be 32 bytes in hex');
    }
    encrypt(value) {
        const iv = (0, crypto_1.randomBytes)(12);
        const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', this.key, iv);
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return [iv, ciphertext, authTag].map((part) => part.toString('base64url')).join('.');
    }
    decrypt(payload) {
        try {
            const [ivEncoded, ciphertextEncoded, authTagEncoded] = payload.split('.');
            if (!ivEncoded || !ciphertextEncoded || !authTagEncoded)
                throw new Error('Malformed encrypted payload');
            const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', this.key, Buffer.from(ivEncoded, 'base64url'));
            decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64url'));
            return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, 'base64url')), decipher.final()]).toString('utf8');
        }
        catch {
            throw new common_1.InternalServerErrorException('Telegram secure state is unavailable');
        }
    }
    maskPhone(payload) {
        if (!payload)
            return null;
        try {
            const phone = this.decrypt(payload);
            return phone.length <= 4 ? '****' : `${phone.slice(0, 3)}****${phone.slice(-2)}`;
        }
        catch {
            throw new common_1.BadRequestException('Telegram phone state is invalid');
        }
    }
};
exports.TelegramCryptoService = TelegramCryptoService;
exports.TelegramCryptoService = TelegramCryptoService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TelegramCryptoService);
//# sourceMappingURL=telegram-crypto.service.js.map
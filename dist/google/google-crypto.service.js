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
exports.GoogleCryptoService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
let GoogleCryptoService = class GoogleCryptoService {
    constructor(config) {
        const encoded = config.getOrThrow('google.tokenEncryptionKey');
        this.key = Buffer.from(encoded, 'hex');
        if (this.key.length !== 32)
            throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes in hex');
    }
    encrypt(value) {
        const iv = (0, node_crypto_1.randomBytes)(12);
        const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', this.key, iv);
        const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString('base64url')).join('.');
    }
    decrypt(payload) {
        try {
            const [ivEncoded, ciphertextEncoded, authTagEncoded] = payload.split('.');
            if (!ivEncoded || !ciphertextEncoded || !authTagEncoded)
                throw new Error('Malformed encrypted payload');
            const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', this.key, Buffer.from(ivEncoded, 'base64url'));
            decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64url'));
            return Buffer.concat([
                decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
                decipher.final(),
            ]).toString('utf8');
        }
        catch {
            throw new common_1.InternalServerErrorException('Google secure state is unavailable');
        }
    }
};
exports.GoogleCryptoService = GoogleCryptoService;
exports.GoogleCryptoService = GoogleCryptoService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GoogleCryptoService);
//# sourceMappingURL=google-crypto.service.js.map
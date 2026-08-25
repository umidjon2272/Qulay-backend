import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class TelegramCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const key = config.getOrThrow<string>('telegram.sessionEncryptionKey');
    this.key = Buffer.from(key, 'hex');
    if (this.key.length !== 32) throw new Error('TELEGRAM_SESSION_ENCRYPTION_KEY must be 32 bytes in hex');
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv, ciphertext, authTag].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(payload: string): string {
    try {
      const [ivEncoded, ciphertextEncoded, authTagEncoded] = payload.split('.');
      if (!ivEncoded || !ciphertextEncoded || !authTagEncoded) throw new Error('Malformed encrypted payload');
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivEncoded, 'base64url'));
      decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new InternalServerErrorException('Telegram secure state is unavailable');
    }
  }

  maskPhone(payload: string | null): string | null {
    if (!payload) return null;
    try {
      const phone = this.decrypt(payload);
      return phone.length <= 4 ? '****' : `${phone.slice(0, 3)}****${phone.slice(-2)}`;
    } catch {
      throw new BadRequestException('Telegram phone state is invalid');
    }
  }
}

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class GoogleCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const encoded = config.getOrThrow<string>('google.tokenEncryptionKey');
    this.key = Buffer.from(encoded, 'hex');
    if (this.key.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes in hex');
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(payload: string): string {
    try {
      const [ivEncoded, ciphertextEncoded, authTagEncoded] = payload.split('.');
      if (!ivEncoded || !ciphertextEncoded || !authTagEncoded) throw new Error('Malformed encrypted payload');
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivEncoded, 'base64url'));
      decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException('Google secure state is unavailable');
    }
  }
}


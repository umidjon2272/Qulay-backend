import { ConfigService } from '@nestjs/config';
import { TelegramCryptoService } from '../src/telegram/telegram-crypto.service';

describe('TelegramCryptoService', () => {
  it('round-trips encrypted values without storing plaintext', () => {
    const service = new TelegramCryptoService(new ConfigService({ telegram: { sessionEncryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' } }));
    const encrypted = service.encrypt('+998901234567');
    expect(encrypted).not.toContain('+998901234567');
    expect(service.decrypt(encrypted)).toBe('+998901234567');
    expect(service.maskPhone(encrypted)).toBe('+99****67');
  });
});

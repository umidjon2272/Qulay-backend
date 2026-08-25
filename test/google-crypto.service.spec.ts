import { ConfigService } from '@nestjs/config';
import { GoogleCryptoService } from '../src/google/google-crypto.service';

describe('GoogleCryptoService', () => {
  it('encrypts and decrypts token payloads with authenticated encryption', () => {
    const service = new GoogleCryptoService(new ConfigService({ google: { tokenEncryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' } }));
    const encrypted = service.encrypt('refresh-token-value');
    expect(encrypted).not.toContain('refresh-token-value');
    expect(service.decrypt(encrypted)).toBe('refresh-token-value');
    expect(() => service.decrypt(`${encrypted}tampered`)).toThrow();
  });
});

import { isWhatsAppSalesRelevant, oggOpusDurationSeconds, shouldActivateWhatsAppSalesContext } from '../src/whatsapp/whatsapp-sales-policy';

describe('WhatsApp sales policy', () => {
  it('responds to sales questions and ignores unrelated first messages', () => {
    expect(isWhatsAppSalesRelevant('Cola bormi?', false, 'text')).toBe(true);
    expect(isWhatsAppSalesRelevant('bugun futbol bormi?', false, 'text')).toBe(false);
    expect(isWhatsAppSalesRelevant('kecha kino ko‘rdim', false, 'text')).toBe(false);
  });

  it('keeps short follow-ups inside an active sales context', () => {
    expect(isWhatsAppSalesRelevant('20 ta', true, 'text')).toBe(true);
    expect(shouldActivateWhatsAppSalesContext('salom', false)).toBe(true);
  });

  it('reads Ogg granule duration at 48kHz', () => {
    const buffer = Buffer.alloc(28);
    buffer.write('OggS', 0, 'ascii');
    buffer.writeBigUInt64LE(48_000n * 60n, 6);
    buffer[26] = 1;
    buffer[27] = 0;
    expect(oggOpusDurationSeconds(buffer)).toBe(60);
  });
});

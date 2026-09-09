import { bitoBusinessIntent, bitoInventoryIntent, bitoFollowUpIntent } from '../src/bito/bito-intent';

describe('Bito intent boundaries', () => {
  it.each(['Omborda nimalar bor?', 'Bitoda qidir omborda nimalar bor', 'Bitoda omborda nimalar bor?', 'Omborda nechta mahsulot bor?', 'Omborda Cola qancha?', 'Cola qancha qoldi?', 'Qoldiq qancha?', 'Qaysi mahsulot qolmagan?', 'Kam qolgan mahsulotlar qaysi?', 'Bito’da mahsulotlar nechta?'])('routes inventory: %s', message => {
    expect(bitoBusinessIntent(message)).toBe(true);
    expect(bitoInventoryIntent(message)).toBe(true);
  });
  it.each(['Bugungi savdo qancha?', 'Bugungi foyda qancha?', 'Eng ko‘p sotilgan mahsulot qaysi?', 'Bito’da qidir', 'Bito ulaganmanu ushanga ulangin'])('routes business, not inventory: %s', message => {
    expect(bitoBusinessIntent(message)).toBe(true);
    expect(bitoInventoryIntent(message)).toBe(false);
  });
  it.each(['Hammasini chiqar', 'Hammasini ayt', '46 tasini chiqar', '78 tasini chiqar', 'To‘liq ko‘rsat'])('recognizes follow-up: %s', message => expect(bitoFollowUpIntent(message)).toBe(true));
  it.each(['Drive’dan ombor hisoboti faylini top', 'Telegramda Azizni qidir', 'Bugungi daromad qancha?', 'Kalendarni ko‘rsat'])('preserves other integrations: %s', message => expect(bitoBusinessIntent(message)).toBe(false));
  it.each(['Bito ombor qoldig‘ini yangila', 'Bito mahsulot yarat', 'Bito stock transfer'])('never runs inventory prefetch for a write: %s', message => expect(bitoInventoryIntent(message)).toBe(false));
});

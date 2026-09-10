import {
  bitoBusinessIntent,
  bitoConnectionIntent,
  bitoFollowUpIntent,
  bitoInventoryIncludeZero,
  bitoInventoryIntent,
  bitoInventorySearchTerm,
  bitoInventorySummaryIntent,
  bitoWriteIntent,
} from '../src/bito/bito-intent';

describe('Bito intent boundaries', () => {
  it.each([
    'Omborda nimalar bor?',
    'ombordagi mahsulotlarni ko‘rsat',
    'Bitoda qidir omborda nimalar bor',
    'Omborda nechta mahsulot bor?',
    'Cola qancha qoldi?',
    'Qaysi mahsulotlar qolmagan?',
  ])('routes current-stock questions deterministically: %s', message => {
    expect(bitoBusinessIntent(message)).toBe(true);
    expect(bitoInventoryIntent(message)).toBe(true);
  });

  it.each([
    'xodimlarni ko‘rsat',
    'mijozlar nechta?',
    'yetkazib beruvchilar ro‘yxati',
    'xaridlarni chiqar',
    'bugungi savdo qancha?',
    'foydam qancha bitoda?',
    'qarzdor mijozlar',
    'kassadagi tushum',
    'ishlab chiqarish hisobotlari',
    'Bito transferlar tarixi',
  ])('routes broad ERP read domains to Bito: %s', message => expect(bitoBusinessIntent(message)).toBe(true));

  it.each(['Bito ulanganmi?', 'Bito connection status', 'Bito ulanish holati'])('recognizes pure connection checks: %s', message => {
    expect(bitoConnectionIntent(message)).toBe(true);
    expect(bitoInventoryIntent(message)).toBe(false);
  });

  it.each(['Hammasini chiqar', '46 tasini chiqar', 'To‘liq ko‘rsat', 'yana davom et'])('recognizes follow-up: %s', message => expect(bitoFollowUpIntent(message)).toBe(true));

  it.each(['Drive’dan ombor hisoboti faylini top', 'Telegramda Azizni qidir', 'Bugungi shaxsiy rejam', 'Kalendarni ko‘rsat'])('preserves other integrations: %s', message => expect(bitoBusinessIntent(message)).toBe(false));

  it.each(['Bito ombor qoldig‘ini yangila', 'Bito mahsulot yarat', 'Bito transfer qil', 'Bito mijozni o‘chir', 'Bito buyurtmani tasdiqla', 'Bito SMS yubor', 'Bito transferni qabul qil'])('recognizes writes and disables inventory prefetch: %s', message => {
    expect(bitoWriteIntent(message)).toBe(true);
    expect(bitoInventoryIntent(message)).toBe(false);
  });

  it('extracts a concrete product search without turning generic stock asks into searches', () => {
    expect(bitoInventorySearchTerm('Omborda Coca Cola Zero qancha qoldi?')).toBe('coca cola zero');
    expect(bitoInventorySearchTerm('Cola qancha qoldi?')).toBe('cola');
    expect(bitoInventorySearchTerm('Omborda nimalar bor?')).toBeUndefined();
    expect(bitoInventorySearchTerm('46 tasini chiqar')).toBeUndefined();
  });

  it('requests aggregate inventory summary only for total-position questions', () => {
    expect(bitoInventorySummaryIntent('Omborda nechta mahsulot bor?')).toBe(true);
    expect(bitoInventorySummaryIntent('Jami mahsulotlar soni qancha?')).toBe(true);
    expect(bitoInventorySummaryIntent('Cola qancha qoldi?')).toBe(false);
    expect(bitoInventorySummaryIntent('Omborda nimalar bor?')).toBe(false);
  });

  it('includes zero stock only for explicit all/out-of-stock requests', () => {
    expect(bitoInventoryIncludeZero('Omborda nimalar bor?')).toBe(false);
    expect(bitoInventoryIncludeZero('Hammasini chiqar')).toBe(true);
    expect(bitoInventoryIncludeZero('Qaysi mahsulotlar qolmagan?')).toBe(true);
  });
});

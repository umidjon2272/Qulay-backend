import { normalizeAmount, normalizeToolInput, confirmationReply } from '../src/ai-tools/ai-input-normalizer';

describe('Uzbek amounts, dates and approval boundaries', () => {
  it.each([['500 min', '500000'], ['500ming', '500000'], ['500k', '500000'], ['yarim mln', '500000'], ['1,5 mln', '1500000'], ['500 000 UZS', '500000'], ['12.50', '12.50'], ['2.25 million', '2250000']])('normalizes %s', (input, expected) => expect(normalizeAmount(input)).toBe(expected));
  it('preserves user timezone across the UTC day boundary and freezes dates before approval', () => {
    const input = normalizeToolInput('create_finance_transaction', { type: 'daromad', amount: '500 min', currency: 'som', title: 'Daromad', transactionDate: 'bugunga' }, 'Asia/Tashkent', new Date('2026-08-31T21:30:00Z'));
    expect(input).toMatchObject({ type: 'INCOME', amount: '500000', currency: 'UZS', transactionDate: '2026-08-31T19:00:00.000Z' });
    expect(normalizeToolInput('create_finance_transaction', input, 'Asia/Tashkent', new Date('2026-09-02T10:00:00Z'))).toEqual(input);
  });
  it('rejects impossible calendar dates', () => expect(() => normalizeToolInput('create_finance_transaction', { transactionDate: '31.02.2026' })).toThrow());
  it.each(['ha', 'xa', 'haa', 'ha tasdiqlayman', 'xo‘p', 'mayli', 'davay', 'да'])('accepts standalone approval %s', text => expect(confirmationReply(text)).toBe(true));
  it.each(['ha lekin 600 ming', 'ha, Sardorga yuborma', 'Shamshodga yoz', 'hammasi yaxshimi', 'yo‘q 300 ming qil'])('does not confuse a name or correction with approval: %s', text => expect(confirmationReply(text)).toBeNull());
  it.each(['yo‘q', 'bekor qil', 'нет'])('cancels %s', text => expect(confirmationReply(text)).toBe(false));
});

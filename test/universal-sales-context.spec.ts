import {
  normalizeSalesTextForUnderstanding,
  salesLookupQuery,
  salesStatePrompt,
  suppressUnaskedExactStock,
  updateUniversalSalesState,
} from '../src/ai-agent/universal-sales-context';

describe('universal sales context', () => {
  it('understands common Uzbek sales typos without rewriting the visible message', () => {
    expect(normalizeSalesTextForUnderstanding('mjoz qmat desa arzonro bomidmi dastafka qlaszmi')).toContain('mijoz');
    expect(normalizeSalesTextForUnderstanding('mjoz qmat desa arzonro bomidmi dastafka qlaszmi')).toContain('qimmat');
    expect(normalizeSalesTextForUnderstanding('mjoz qmat desa arzonro bomidmi dastafka qlaszmi')).toContain('arzonroq');
    expect(normalizeSalesTextForUnderstanding('mjoz qmat desa arzonro bomidmi dastafka qlaszmi')).toContain('delivery');
    expect(normalizeSalesTextForUnderstanding('aayfon 13 por borm')).toContain('iphone 13 pro');
    expect(normalizeSalesTextForUnderstanding('koka kola borm')).toContain('coca cola');
  });

  it('keeps the product while short follow-ups change variant and quantity', () => {
    const first = updateUniversalSalesState(undefined, 'Coca Cola bormi?');
    expect(first.product?.toLowerCase()).toContain('coca cola');

    const second = updateUniversalSalesState(first, '1.5 litrlik kerak');
    expect(second.product).toBe(first.product);
    expect(second.variant).toBe('1.5L');

    const third = updateUniversalSalesState(second, '5 ta olaman');
    expect(third.product).toBe(first.product);
    expect(third.variant).toBe('1.5L');
    expect(third.quantity).toBe(5);
  });

  it('tracks phone-style model/color follow-ups without forgetting the product', () => {
    const first = updateUniversalSalesState(undefined, 'iPhone bormi?');
    const second = updateUniversalSalesState(first, '13 Pro kerak');
    const third = updateUniversalSalesState(second, 'qora rangchi?');
    expect(third.product?.toLowerCase()).toContain('iphone');
    expect(third.variant?.toLowerCase()).toContain('13 pro');
    expect(third.color).toBe('qora');
  });

  it('tracks delivery, address, phone and payment as persistent checkout facts', () => {
    let state = updateUniversalSalesState(undefined, 'Coca Cola 5 ta olaman');
    state = updateUniversalSalesState(state, 'dastafka qiling');
    state = updateUniversalSalesState(state, 'Chilonzor 12 kvartal 18 uy');
    state = updateUniversalSalesState(state, '+998 90 123 45 67');
    state = updateUniversalSalesState(state, 'Click qilaman');

    expect(state.fulfillment).toBe('DELIVERY');
    expect(state.address).toContain('Chilonzor');
    expect(state.phone).toContain('998');
    expect(state.paymentMethod).toBe('CLICK');
  });

  it('does not replace an active product on objection or cheaper-alternative follow-ups', () => {
    const first = updateUniversalSalesState(undefined, 'iPhone 13 Pro bormi?');
    const second = updateUniversalSalesState(first, 'qmat emasmi?');
    const third = updateUniversalSalesState(second, 'arzonro bomidmi?');
    expect(third.product).toBe(first.product);
    expect(second.lastIntent).toBe('PRICE_OBJECTION');
    expect(third.lastIntent).toBe('CHEAPER_ALTERNATIVE');
  });

  it('marks exact-stock requests separately from simple availability', () => {
    const availability = updateUniversalSalesState(undefined, 'Coca Cola bormi?');
    const exact = updateUniversalSalesState(availability, 'nechta qoldi?');
    expect(availability.wantsExactStock).toBe(false);
    expect(exact.wantsExactStock).toBe(true);
    expect(exact.lastIntent).toBe('EXACT_STOCK');
  });


  it('hides exact stock counts unless the customer explicitly asked for them', () => {
    const availability = updateUniversalSalesState(undefined, 'Coca Cola bormi?');
    expect(suppressUnaskedExactStock('Ha, bor — omborda 472 dona mavjud. Nechta kerak?', availability)).not.toContain('472');
    const exact = updateUniversalSalesState(availability, 'nechta qoldi?');
    expect(suppressUnaskedExactStock('Ha, omborda 472 dona mavjud.', exact)).toContain('472');
  });

  it('feeds structured context into product lookup and seller prompt summaries', () => {
    let state = updateUniversalSalesState(undefined, 'Coca Cola bormi?');
    state = updateUniversalSalesState(state, '1.5 litrlik kerak');
    state = updateUniversalSalesState(state, '5 ta');
    expect(salesLookupQuery(state, 'qmat emasmi')).toContain('Coca Cola');
    expect(salesLookupQuery(state, 'qmat emasmi')).toContain('1.5L');
    expect(salesStatePrompt(state)).toContain('miqdor=5');
  });
});

import {
  applySalesTurnUnderstanding,
  normalizeSalesTextForUnderstanding,
  professionalSalesFallbackReply,
  reconcileUniversalSalesStateFromInventory,
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

  it('surfaces professional seller memory without exposing implementation details', () => {
    const prompt = salesStatePrompt({
      version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', model: '13 pro',
      quotedPrice: 4_800_000, previousQuote: 5_000_000, priceObjection: true,
      lastSellerQuestion: 'Nechta olasiz?', handoffState: 'AI_ACTIVE',
    });
    expect(prompt).toContain('oxirgi_taklif_narxi=4800000');
    expect(prompt).toContain('oldingi_taklif_narxi=5000000');
    expect(prompt).toContain('oxirgi_sotuvchi_savoli=Nechta olasiz?');
    expect(prompt).toContain('handoff=AI_ACTIVE');
  });

  it('records a Bito-verified price as the current customer quote on a price turn', () => {
    const pricedTurn = applySalesTurnUnderstanding({
      version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', model: '13 pro', quantity: 2,
    }, {
      intent: 'PRICE', topicSwitch: false, followUp: true, needsCatalogLookup: true,
      catalogScope: 'SELECTION', clearUnavailableSelection: false,
      businessFactRequest: 'NONE', answerGoal: 'quote two units',
    }, '2 ta olsam qancha?');
    const verified = reconcileUniversalSalesStateFromInventory(pricedTurn, {
      availabilityStatus: 'IN_STOCK',
      items: [{ name: 'iPhone 13 Pro', price: 4_800_000, quantity: 5 }],
    });
    expect(verified.unitPrice).toBe(4_800_000);
    expect(verified.totalPrice).toBe(9_600_000);
    expect(verified.quotedPrice).toBe(4_800_000);
  });

  it('keeps multiple verified alternatives and resolves ordinal selection instead of always taking the first one', () => {
    const selected = applySalesTurnUnderstanding(undefined, {
      intent: 'AVAILABILITY', topicSwitch: false, followUp: false, needsCatalogLookup: true,
      catalogScope: 'SELECTION', clearUnavailableSelection: false, product: 'iphone', model: '16 pro',
      businessFactRequest: 'NONE', answerGoal: 'check exact model',
    }, '16 pro');
    const unavailable = reconcileUniversalSalesStateFromInventory(selected, {
      availabilityStatus: 'NOT_FOUND',
      familyAlternatives: [
        { name: 'iPhone 13 Pro 128GB qora', price: 4_800_000, quantity: 3 },
        { name: 'iPhone 14 Pro 128GB qora', price: 5_800_000, quantity: 2 },
        { name: 'iPhone 15 128GB qora', price: 6_300_000, quantity: 5 },
      ],
    });
    expect(unavailable.factStatus?.model?.status).toBe('UNAVAILABLE');
    expect(unavailable.offeredAlternatives).toHaveLength(3);

    const accepted = applySalesTurnUnderstanding(unavailable, {
      intent: 'ACKNOWLEDGEMENT', topicSwitch: false, followUp: true, needsCatalogLookup: false,
      catalogScope: 'NONE', clearUnavailableSelection: true, businessFactRequest: 'NONE', answerGoal: 'select second offer',
    }, '2-chisini olaman');
    expect(accepted.model?.toLowerCase()).toContain('14 pro');
    expect(accepted.acceptedOffer?.toLowerCase()).toContain('14 pro');
    expect(accepted.unitPrice).toBe(5_800_000);
  });

  it('keeps the recent alternative set so the customer can switch from the second offer back to the first', () => {
    let state = reconcileUniversalSalesStateFromInventory({
      version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', productFamily: 'iphone', model: '16 pro', variant: '16 pro',
    }, {
      availabilityStatus: 'NOT_FOUND',
      familyAlternatives: [
        { name: 'iPhone 13 Pro', price: 4_800_000, quantity: 3 },
        { name: 'iPhone 14 Pro', price: 5_800_000, quantity: 2 },
      ],
    });
    const rankedFirst = state.offeredAlternatives?.[0];
    const rankedSecond = state.offeredAlternatives?.[1];
    expect(rankedFirst).toBeTruthy();
    expect(rankedSecond).toBeTruthy();
    state = applySalesTurnUnderstanding(state, {
      intent: 'ACKNOWLEDGEMENT', topicSwitch: false, followUp: true, needsCatalogLookup: false,
      catalogScope: 'NONE', clearUnavailableSelection: true, businessFactRequest: 'NONE', answerGoal: 'select second offer',
    }, '2-chisini olaman');
    expect(state.acceptedOffer).toBe(rankedSecond?.name);
    expect(state.offeredAlternatives).toHaveLength(2);

    state = applySalesTurnUnderstanding(state, {
      intent: 'ACKNOWLEDGEMENT', topicSwitch: false, followUp: true, needsCatalogLookup: false,
      catalogScope: 'NONE', clearUnavailableSelection: true, businessFactRequest: 'NONE', answerGoal: 'switch to first offer',
    }, 'birinchisini olaman');
    expect(state.acceptedOffer).toBe(rankedFirst?.name);
    expect(state.unitPrice).toBe(rankedFirst?.unitPrice);
  });

  it('ranks real Bito alternatives by model proximity and budget instead of provider order', () => {
    const unavailable = reconcileUniversalSalesStateFromInventory({
      version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', productFamily: 'iphone',
      model: '16 pro', variant: '16 pro', budget: '5.5 mln',
    }, {
      availabilityStatus: 'NOT_FOUND',
      familyAlternatives: [
        { name: 'iPhone 13 Pro 128GB qora', price: 4_800_000, quantity: 10 },
        { name: 'iPhone 15 Pro 128GB qora', price: 5_400_000, quantity: 1 },
        { name: 'iPhone 14 Pro 128GB qora', price: 5_000_000, quantity: 8 },
      ],
    });

    expect(unavailable.offeredAlternatives?.[0]?.name).toContain('15 Pro');
    expect(unavailable.lastOfferedProducts?.[0]).toContain('15 Pro');
  });

  it('does not mistake purchase quantity for an ordinal alternative selection', () => {
    const unavailable = reconcileUniversalSalesStateFromInventory({
      version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', productFamily: 'iphone', model: '16 pro', variant: '16 pro',
    }, {
      availabilityStatus: 'NOT_FOUND',
      familyAlternatives: [
        { name: 'iPhone 13 Pro', price: 4_800_000, quantity: 3 },
        { name: 'iPhone 14 Pro', price: 5_800_000, quantity: 2 },
      ],
    });
    const next = applySalesTurnUnderstanding(unavailable, {
      intent: 'PRICE', topicSwitch: false, followUp: true, needsCatalogLookup: true,
      catalogScope: 'FAMILY', clearUnavailableSelection: false, quantity: 2, businessFactRequest: 'NONE', answerGoal: 'clarify selected offer before quoting',
    }, '2 ta olsam qancha berasiz');
    expect(next.model).toBe('16 pro');
    expect(next.acceptedOffer).toBeUndefined();
    expect(next.quantity).toBe(2);
    expect(next.offeredAlternatives).toHaveLength(2);
  });

  it('keeps the accepted alternative when quantity, delivery, address and card follow-ups arrive', () => {
    let state = applySalesTurnUnderstanding({
      version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', model: '13 pro',
      acceptedOffer: 'iPhone 13 Pro 128GB qora', unitPrice: 4_800_000,
    }, {
      intent: 'PRICE', topicSwitch: false, followUp: true, needsCatalogLookup: false,
      catalogScope: 'NONE', clearUnavailableSelection: false, quantity: 2, businessFactRequest: 'NONE', answerGoal: 'quote two units',
    }, '2 ta olsam qancha berasiz');
    expect(state.model).toBe('13 pro');
    expect(state.quantity).toBe(2);
    expect(state.totalPrice).toBe(9_600_000);

    state = applySalesTurnUnderstanding(state, {
      intent: 'DELIVERY', topicSwitch: false, followUp: true, needsCatalogLookup: false,
      catalogScope: 'NONE', clearUnavailableSelection: false, fulfillment: 'DELIVERY', businessFactRequest: 'DELIVERY_POLICY', answerGoal: 'delivery',
    }, 'dastavka qlasizmi');
    state = applySalesTurnUnderstanding(state, {
      intent: 'ADDRESS', topicSwitch: false, followUp: true, needsCatalogLookup: false,
      catalogScope: 'NONE', clearUnavailableSelection: false, address: 'Toshkent Chilonzor 12', businessFactRequest: 'NONE', answerGoal: 'save address',
    }, 'Toshkent Chilonzor 12');
    state = applySalesTurnUnderstanding(state, {
      intent: 'PAYMENT', topicSwitch: false, followUp: true, needsCatalogLookup: false,
      catalogScope: 'NONE', clearUnavailableSelection: false, paymentMethod: 'CARD', businessFactRequest: 'NONE', answerGoal: 'payment',
    }, 'karta');
    expect(state.model).toBe('13 pro');
    expect(state.address).toBe('Toshkent Chilonzor 12');
    expect(state.paymentMethod).toBe('CARD');
    expect(state.conversationMode).toBe('SALES');
    expect(state.customer).toBe(true);
  });

  it('keeps short active-customer reactions natural instead of falling back to a product reset prompt', () => {
    const state = { version: 1 as const, customer: true, conversationMode: 'SALES' as const, product: 'iphone', model: '13 pro' };
    expect(professionalSalesFallbackReply(state, 'a')).toMatch(/eshitaman|ha/i);
    expect(professionalSalesFallbackReply(state, '😂')).toMatch(/[🙂😄😂]|eshitaman/i);
  });

  it('uses the seller last question to understand a bare phone storage reply', () => {
    const previous = {
      version: 1 as const,
      customer: true,
      conversationMode: 'SALES' as const,
      product: 'iphone',
      model: '13 pro',
      lastSellerQuestion: 'Qancha xotira kerak — 128GBmi yoki 256GBmi?',
    };

    const next = applySalesTurnUnderstanding(previous, {
      intent: 'VARIANT', topicSwitch: false, followUp: true, needsCatalogLookup: true,
      catalogScope: 'SELECTION', clearUnavailableSelection: false,
      businessFactRequest: 'NONE', answerGoal: 'apply storage selection',
    }, '128');

    expect(next.product).toBe('iphone');
    expect(next.model).toBe('13 pro');
    expect(next.storage).toBe('128GB');
    expect(next.factStatus?.storage).toMatchObject({ value: '128GB', status: 'PROPOSED', source: 'CUSTOMER' });
  });

  it('clears accepted-offer identity when the customer semantically switches to another product', () => {
    const switched = applySalesTurnUnderstanding({
      version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', model: '13 pro',
      acceptedOffer: 'iPhone 13 Pro', unitPrice: 4_800_000, quantity: 2,
      quotedPrice: 4_800_000, previousQuote: 5_000_000,
    }, {
      intent: 'AVAILABILITY', topicSwitch: true, followUp: false, needsCatalogLookup: true,
      catalogScope: 'PRODUCT', clearUnavailableSelection: false, product: 'Coca Cola', productFamily: 'coca cola',
      businessFactRequest: 'NONE', answerGoal: 'switch product',
    }, 'Coca Cola bormi?');
    expect(switched.productFamily).toBe('coca cola');
    expect(switched.acceptedOffer).toBeUndefined();
    expect(switched.unitPrice).toBeUndefined();
    expect(switched.quantity).toBeUndefined();
    expect(switched.quotedPrice).toBeUndefined();
    expect(switched.previousQuote).toBeUndefined();
  });

});

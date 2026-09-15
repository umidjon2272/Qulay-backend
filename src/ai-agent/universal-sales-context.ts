import { bitoInventorySearchTerm } from '../bito/bito-intent';

export type UniversalSalesIntent =
  | 'AVAILABILITY'
  | 'PRICE'
  | 'EXACT_STOCK'
  | 'PRICE_OBJECTION'
  | 'CHEAPER_ALTERNATIVE'
  | 'ADVICE'
  | 'VARIANT'
  | 'QUANTITY'
  | 'DELIVERY'
  | 'PICKUP'
  | 'ADDRESS'
  | 'PHONE'
  | 'PAYMENT'
  | 'ORDER'
  | 'GENERAL';

export type SalesFactStatus = 'PROPOSED' | 'VERIFIED' | 'UNAVAILABLE';
export type SalesFactKey = 'product' | 'productFamily' | 'variant' | 'model' | 'size' | 'color';
export type SalesFact = {
  value: string;
  status: SalesFactStatus;
  source: 'CUSTOMER' | 'BITO';
  checkedAt?: string;
};

export type SalesNextBestAction =
  | 'IDENTIFY_PRODUCT'
  | 'VERIFY_PRODUCT'
  | 'CLARIFY_VARIANT'
  | 'OFFER_ALTERNATIVE'
  | 'HANDLE_PRICE_OBJECTION'
  | 'FIND_CHEAPER_ALTERNATIVE'
  | 'RECOMMEND'
  | 'ASK_QUANTITY'
  | 'ASK_FULFILLMENT'
  | 'ASK_ADDRESS'
  | 'ASK_PHONE'
  | 'ASK_PAYMENT'
  | 'CONFIRM_ORDER'
  | 'ANSWER_CURRENT_QUESTION';

export type SalesTurnPlan = {
  intent: UniversalSalesIntent;
  knownFacts: string[];
  missingFacts: string[];
  productLookupNeeded: boolean;
  businessRuleNeeded: boolean;
  nextBestAction: SalesNextBestAction;
};

export type UniversalSalesState = {
  version: 1;
  product?: string;
  productFamily?: string;
  variant?: string;
  model?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  color?: string;
  size?: string;
  budget?: string;
  fulfillment?: 'DELIVERY' | 'PICKUP';
  address?: string;
  phone?: string;
  paymentMethod?: 'CASH' | 'CARD' | 'CLICK' | 'PAYME' | 'TRANSFER' | 'OTHER';
  timing?: string;
  lastIntent?: UniversalSalesIntent;
  wantsExactStock?: boolean;
  requestedCheaper?: boolean;
  requestedAdvice?: boolean;
  factStatus?: Partial<Record<SalesFactKey, SalesFact>>;
  updatedAt?: string;
};

const UZ_NUMBER_WORDS: Record<string, number> = {
  bir: 1, bitta: 1, bita: 1,
  ikki: 2, ikkita: 2,
  uch: 3, uchta: 3,
  tort: 4, "to'rt": 4, totta: 4,
  besh: 5, beshta: 5,
  olti: 6, oltita: 6,
  yetti: 7, yettita: 7,
  sakkiz: 8, sakkizta: 8,
  toqqiz: 9, "to'qqiz": 9, toqqizta: 9,
  on: 10, "o'n": 10, onta: 10,
};

const COLOR_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:qora(?:si|sidan|dan|rang(?:i|idan)?)?|black|chern(?:iy|aya)?|черн\p{L}*)\b/iu, 'qora'],
  [/\b(?:oq(?:i|idan|dan|rang(?:i|idan)?)?|white|bel(?:iy|aya)?|бел\p{L}*)\b/iu, 'oq'],
  [/\b(?:qizil(?:i|idan|dan|rang(?:i|idan)?)?|red|krasn\p{L}*|красн\p{L}*)\b/iu, 'qizil'],
  [/\b(?:kok|ko['‘’]?k)(?:i|idan|dan|rang(?:i|idan)?)?\b|\b(?:blue|sin\p{L}*|син\p{L}*)\b/iu, "ko‘k"],
  [/\b(?:yashil(?:i|idan|dan|rang(?:i|idan)?)?|green|zelen\p{L}*|зелен\p{L}*)\b/iu, 'yashil'],
  [/\b(?:kulrang(?:i|idan|dan|rang(?:i|idan)?)?|grey|gray|ser\p{L}*|сер\p{L}*)\b/iu, 'kulrang'],
];

/**
 * Shadow-normalization for intent understanding only. Never replace a product
 * name shown to the customer with this string. The goal is to understand
 * colloquial Uzbek, typos and compact model/quantity forms without mutating
 * the customer's visible text.
 */
export function normalizeSalesTextForUnderstanding(input: string): string {
  let text = input
    .normalize('NFKC')
    .replace(/[‘’ʻʼ`]/g, "'")
    .replace(/(\p{L}{2,})(\d)/gu, '$1 $2')
    .replace(/(\d)(\p{L}{2,})/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

  const replacements: Array<[RegExp, string]> = [
    [/\b(?:dastaf?ka|dostaf?ka|dostavka|доставк\p{L}*)\b/giu, ' delivery '],
    [/\b(?:qmat|qimmatku|qimmatmi|qimmat)\b/giu, ' qimmat '],
    [/\b(?:arzonro|arzonroq|arzonrogi|arzonrog'i|arzonrog)\b/giu, ' arzonroq '],
    [/\b(?:qanca|qanch|qancha)\b/giu, ' qancha '],
    [/\bnechpul\b/giu, ' nech pul '],
    [/\b(?:kere|keremas|kerak)\b/giu, ' kerak '],
    [/\b(?:olb|opket|obket|olib)\b/giu, ' olib '],
    [/\b(?:qaytga|qatta|qayerga)\b/giu, ' qayerga '],
    [/\b(?:bomidi|bomidmi|bomiydimi|borm|bomi|bormi)\b/giu, ' bormi '],
    [/\b(?:mjoz|mijz|mjz|mijoz)\b/giu, ' mijoz '],
    [/\b(?:klent|klen|client|klient|клиент)\b/giu, ' mijoz '],
    [/\b(?:tolov|to'lov|oplata|оплат\p{L}*)\b/giu, " to'lov "],
    [/\b(?:samovivoz|samovyvoz|самовывоз)\b/giu, ' pickup '],
    [/\b(?:maslaxat|maslahat|tavsiya)\b/giu, ' maslahat '],
    [/\b(?:adres|адрес)\b/giu, ' manzil '],
    [/\b(?:a+y+fon|ayfon|aifon|aiphon|iphon)(?:lar|lari|ni|ga|da|dan|chi)?\b/giu, ' iphone '],
    [/\b(?:por|proo)\b/giu, ' pro '],
    [/\b(?:koka)\b/giu, ' coca '],
    [/\b(?:kola)\b/giu, ' cola '],
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, ' ').trim();
}

export function coerceUniversalSalesState(value: unknown): UniversalSalesState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { version: 1 };
  const source = value as Record<string, unknown>;
  const state: UniversalSalesState = { version: 1 };
  const stringField = (key: keyof UniversalSalesState, max = 300) => {
    const raw = source[key as string];
    if (typeof raw === 'string' && raw.trim()) (state as Record<string, unknown>)[key as string] = raw.trim().slice(0, max);
  };
  for (const key of ['product', 'productFamily', 'variant', 'model', 'color', 'size', 'budget', 'address', 'phone', 'timing', 'updatedAt'] as const) {
    stringField(key, key === 'address' ? 500 : 300);
  }
  if (typeof source.quantity === 'number' && Number.isFinite(source.quantity) && source.quantity > 0) state.quantity = Math.min(source.quantity, 1_000_000);
  if (typeof source.unitPrice === 'number' && Number.isFinite(source.unitPrice) && source.unitPrice >= 0) state.unitPrice = source.unitPrice;
  if (typeof source.totalPrice === 'number' && Number.isFinite(source.totalPrice) && source.totalPrice >= 0) state.totalPrice = source.totalPrice;
  if (source.fulfillment === 'DELIVERY' || source.fulfillment === 'PICKUP') state.fulfillment = source.fulfillment;
  if (['CASH', 'CARD', 'CLICK', 'PAYME', 'TRANSFER', 'OTHER'].includes(String(source.paymentMethod))) state.paymentMethod = source.paymentMethod as UniversalSalesState['paymentMethod'];
  if (['AVAILABILITY', 'PRICE', 'EXACT_STOCK', 'PRICE_OBJECTION', 'CHEAPER_ALTERNATIVE', 'ADVICE', 'VARIANT', 'QUANTITY', 'DELIVERY', 'PICKUP', 'ADDRESS', 'PHONE', 'PAYMENT', 'ORDER', 'GENERAL'].includes(String(source.lastIntent))) {
    state.lastIntent = source.lastIntent as UniversalSalesIntent;
  }
  if (typeof source.wantsExactStock === 'boolean') state.wantsExactStock = source.wantsExactStock;
  if (typeof source.requestedCheaper === 'boolean') state.requestedCheaper = source.requestedCheaper;
  if (typeof source.requestedAdvice === 'boolean') state.requestedAdvice = source.requestedAdvice;

  if (source.factStatus && typeof source.factStatus === 'object' && !Array.isArray(source.factStatus)) {
    const factStatus: Partial<Record<SalesFactKey, SalesFact>> = {};
    for (const key of ['product', 'productFamily', 'variant', 'model', 'size', 'color'] as const) {
      const raw = (source.factStatus as Record<string, unknown>)[key];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const row = raw as Record<string, unknown>;
      const status = String(row.status);
      const factValue = typeof row.value === 'string' ? row.value.trim().slice(0, 300) : '';
      if (!factValue || !['PROPOSED', 'VERIFIED', 'UNAVAILABLE'].includes(status)) continue;
      factStatus[key] = {
        value: factValue,
        status: status as SalesFactStatus,
        source: row.source === 'BITO' ? 'BITO' : 'CUSTOMER',
        ...(typeof row.checkedAt === 'string' ? { checkedAt: row.checkedAt.slice(0, 50) } : {}),
      };
    }
    if (Object.keys(factStatus).length) state.factStatus = factStatus;
  }
  return state;
}

export function updateUniversalSalesState(previous: UniversalSalesState | undefined, rawText: string): UniversalSalesState {
  const state: UniversalSalesState = { ...coerceUniversalSalesState(previous), version: 1 };
  const normalized = normalizeSalesTextForUnderstanding(rawText);
  if (!normalized) return state;

  const exactStock = /(?:nechta|qancha|necha)\s+(?:qold|bor)|(?:qoldiq|stock)\s+(?:qancha|nechta)|сколько\s+(?:остал|есть)/iu.test(normalized);
  const priceObjection = /\b(?:qimmat|дорог\p{L}*|expensive)\b/iu.test(normalized);
  const cheaper = /\b(?:arzonroq|arzon|дешев\p{L}*|cheaper|budget)\b/iu.test(normalized) && /(?:bormi|variant|bor|есть|есть\s+ли|kerak|qidir|top)/iu.test(normalized);
  const advice = /\b(?:maslahat|qaysi\s+biri\s+yaxshi|nimani\s+olasiz|nimani\s+tavsiya|совет|посовет|recommend)\b/iu.test(normalized);
  const availability = /\b(?:bormi|mavjud|available|есть\s+ли|в\s+налич)/iu.test(normalized)
    || /\b(?:qanaqa|qanday|qaysi)\b.{0,60}\bbor\b/iu.test(normalized);
  const price = /\b(?:narx(?:i|ini|lar)?|price|nech\s+pul|qancha\s+tur|qanchadan|цена|сколько\s+стоит)\b/iu.test(normalized)
    || /(?:\b\d+\s*(?:ta|dona|шт|pcs)\b|\b(?:olsam|olaman|bering)\b).*\b(?:qancha|nech\s+pul)\b/iu.test(normalized);
  const delivery = /\b(?:delivery|yetkaz\p{L}*|kuryer|курьер)\b/iu.test(normalized);
  const pickup = /\b(?:pickup|olib\s+ket\p{L}*|borib\s+ol\p{L}*)\b/iu.test(normalized);
  const order = /\b(?:olaman|bering|buyurtma|zakaz|order|беру|заказ\p{L}*)\b/iu.test(normalized);

  const phone = rawText.match(/(?:\+?998[\s()-]*)?(?:\d[\s()-]*){9}/u)?.[0]?.replace(/[^+\d]/g, '');
  const payment = detectPayment(normalized);
  const quantity = extractQuantity(normalized);
  const volume = extractVolume(normalized);
  const color = detectColor(normalized);
  const size = extractSize(normalized);
  const compactModel = extractCompactModel(rawText);
  const budget = extractBudget(normalized);
  const timing = extractTiming(rawText, normalized);
  const address = phone ? undefined : detectAddress(rawText, normalized, delivery || state.fulfillment === 'DELIVERY');

  const hadProduct = Boolean(state.product);
  const previousProduct = state.product;
  const productCandidate = bitoInventorySearchTerm(normalized)?.trim();
  const followUpSignals = Boolean(volume || color || size || compactModel || quantity !== undefined || delivery || pickup || payment || priceObjection || cheaper || advice || phone || address);

  if (productCandidate && isUsefulProductCandidate(productCandidate, normalized)) {
    const clean = cleanProductCandidate(productCandidate);
    const parsed = parseProductCandidate(clean);
    const activeFamily = state.productFamily || inferProductFamily(state.product ?? '');
    const sameFamily = Boolean(activeFamily && parsed.family && canonicalComparable(activeFamily) === canonicalComparable(parsed.family));
    const modelOnlyFollowUp = hadProduct && isModelOnlyCandidate(clean);
    const attributeFollowUp = hadProduct && Boolean(volume || color || size);
    const sameFamilyModelFollowUp = hadProduct && sameFamily && Boolean(parsed.model);
    const followUpCandidate = modelOnlyFollowUp || attributeFollowUp || sameFamilyModelFollowUp;

    const explicitNewFamily = hadProduct && parsed.family && activeFamily
      && canonicalComparable(parsed.family) !== canonicalComparable(activeFamily);
    const catalogSelectionSignal = availability || price || order
      || /\b(?:kerak|model|variant|hajm|rang|litr|ltr|kg|dona|ta)\b/iu.test(normalized)
      || /\d/u.test(clean);
    const shouldReplaceProduct = !hadProduct
      || Boolean(explicitNewFamily && !attributeFollowUp && catalogSelectionSignal);

    if (shouldReplaceProduct) {
      const nextProduct = parsed.product || clean;
      const changed = previousProduct && canonicalComparable(previousProduct) !== canonicalComparable(nextProduct);
      if (changed) clearDependentCatalogFacts(state);
      if (changed) clearPriceFacts(state);
      state.product = nextProduct;
      state.productFamily = parsed.family || inferProductFamily(nextProduct);
      setFact(state, 'product', nextProduct, 'PROPOSED', 'CUSTOMER');
      if (state.productFamily) setFact(state, 'productFamily', state.productFamily, 'PROPOSED', 'CUSTOMER');
      if (parsed.model) {
        state.model = parsed.model;
        state.variant = parsed.model;
        setFact(state, 'model', parsed.model, 'PROPOSED', 'CUSTOMER');
        setFact(state, 'variant', parsed.model, 'PROPOSED', 'CUSTOMER');
      }
    } else if (followUpCandidate && parsed.model && !attributeFollowUp) {
      if (state.model && canonicalComparable(state.model) !== canonicalComparable(parsed.model)) {
        clearModelDependentFacts(state);
        clearPriceFacts(state);
      }
      state.model = parsed.model;
      state.variant = parsed.model;
      setFact(state, 'model', parsed.model, 'PROPOSED', 'CUSTOMER');
      setFact(state, 'variant', parsed.model, 'PROPOSED', 'CUSTOMER');
    }
  }

  if (volume) {
    if (state.variant && canonicalComparable(state.variant) !== canonicalComparable(volume)) clearPriceFacts(state);
    state.variant = volume;
    setFact(state, 'variant', volume, 'PROPOSED', 'CUSTOMER');
  }
  if (compactModel && hadProduct && !volume && !color && !size && !containsProductPhrase(compactModel, state.product)) {
    const normalizedModel = normalizeSalesTextForUnderstanding(compactModel);
    if (state.model && canonicalComparable(state.model) !== canonicalComparable(normalizedModel)) {
      clearModelDependentFacts(state);
      clearPriceFacts(state);
    }
    state.variant = normalizedModel;
    state.model = normalizedModel;
    setFact(state, 'variant', normalizedModel, 'PROPOSED', 'CUSTOMER');
    setFact(state, 'model', normalizedModel, 'PROPOSED', 'CUSTOMER');
  }
  if (color) {
    if (state.color && canonicalComparable(state.color) !== canonicalComparable(color)) clearPriceFacts(state);
    state.color = color;
    setFact(state, 'color', color, 'PROPOSED', 'CUSTOMER');
  }
  if (size) {
    if (state.size && canonicalComparable(state.size) !== canonicalComparable(size)) clearPriceFacts(state);
    state.size = size;
    setFact(state, 'size', size, 'PROPOSED', 'CUSTOMER');
  }

  if (phone && phone.replace(/\D/g, '').length >= 9) state.phone = phone.slice(0, 30);
  if (payment) state.paymentMethod = payment;
  if (delivery) state.fulfillment = 'DELIVERY';
  if (pickup) state.fulfillment = 'PICKUP';
  if (quantity !== undefined) {
    state.quantity = quantity;
    if (typeof state.unitPrice === 'number') state.totalPrice = roundMoney(state.unitPrice * quantity);
  }
  if (budget) state.budget = budget;
  if (timing) state.timing = timing;
  if (address) state.address = address;

  state.wantsExactStock = exactStock;
  state.requestedCheaper = cheaper;
  state.requestedAdvice = advice;
  state.lastIntent = exactStock ? 'EXACT_STOCK'
    : cheaper ? 'CHEAPER_ALTERNATIVE'
      : priceObjection ? 'PRICE_OBJECTION'
        : advice ? 'ADVICE'
          : delivery ? 'DELIVERY'
            : pickup ? 'PICKUP'
              : payment ? 'PAYMENT'
                : phone ? 'PHONE'
                  : address ? 'ADDRESS'
                    : price ? 'PRICE'
                      : availability ? 'AVAILABILITY'
                        : quantity !== undefined ? 'QUANTITY'
                          : (volume || color || size || compactModel) ? 'VARIANT'
                            : order ? 'ORDER'
                              : 'GENERAL';
  state.updatedAt = new Date().toISOString();
  return state;
}

export function salesCatalogLookupQuery(state: UniversalSalesState | undefined, currentText: string): string | undefined {
  const value = coerceUniversalSalesState(state);
  const direct = bitoInventorySearchTerm(normalizeSalesTextForUnderstanding(currentText))?.trim();
  if (!value.product) return direct;

  const parts: string[] = [value.product];
  for (const extra of [value.model, value.variant, value.color, value.size]) {
    if (!extra) continue;
    const base = canonicalComparable(parts.join(' '));
    const candidate = canonicalComparable(extra);
    if (candidate && !base.includes(candidate)) parts.push(extra);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 300) || direct;
}

export function reconcileUniversalSalesStateFromInventory(
  current: UniversalSalesState | undefined,
  inventoryPayload: unknown,
): UniversalSalesState {
  const state = coerceUniversalSalesState(current);
  const snapshot = findInventorySnapshot(inventoryPayload);
  if (!snapshot) return state;
  const status = typeof snapshot.availabilityStatus === 'string' ? snapshot.availabilityStatus : '';
  if (!['IN_STOCK', 'OUT_OF_STOCK', 'NOT_FOUND'].includes(status)) return state;
  const checkedAt = new Date().toISOString();

  if (status === 'IN_STOCK') {
    for (const key of ['product', 'productFamily', 'variant', 'model', 'size', 'color'] as const) {
      const value = state[key];
      if (typeof value === 'string' && value.trim()) setFact(state, key, value, 'VERIFIED', 'BITO', checkedAt);
    }
    const items = Array.isArray(snapshot.items) ? snapshot.items.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : [];
    const selectedSpecific = Boolean(state.model || state.variant || state.size || state.color);
    if ((items.length === 1 || selectedSpecific) && items.length) {
      const publicPrice = items.map(item => item.price).find(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
      if (typeof publicPrice === 'number') {
        state.unitPrice = publicPrice;
        if (state.quantity) state.totalPrice = roundMoney(publicPrice * state.quantity);
      }
    }
    return state;
  }

  const specific = (['color', 'size', 'variant', 'model'] as const).find(key => {
    const value = state[key];
    return typeof value === 'string' && value.trim().length > 0;
  });

  if (status === 'OUT_OF_STOCK') {
    if (state.productFamily) setFact(state, 'productFamily', state.productFamily, 'VERIFIED', 'BITO', checkedAt);
    if (state.product) {
      setFact(state, 'product', state.product, specific ? 'VERIFIED' : 'UNAVAILABLE', 'BITO', checkedAt);
    }
    if (specific && state[specific]) {
      setFact(state, specific, String(state[specific]), 'UNAVAILABLE', 'BITO', checkedAt);
      clearPriceFacts(state);
    }
    return state;
  }

  // NOT_FOUND: reject only the most specific current proposal. Never silently
  // replace it with a family alternative or an older variant.
  if (specific && state[specific]) {
    setFact(state, specific, String(state[specific]), 'UNAVAILABLE', 'BITO', checkedAt);
    clearPriceFacts(state);
  } else if (state.product) {
    setFact(state, 'product', state.product, 'UNAVAILABLE', 'BITO', checkedAt);
    clearPriceFacts(state);
  }
  return state;
}

export function planSalesNextAction(state: UniversalSalesState | undefined, currentText = ''): SalesTurnPlan {
  const value = coerceUniversalSalesState(state);
  const intent = value.lastIntent ?? 'GENERAL';
  const knownFacts: string[] = [];
  const missingFacts: string[] = [];
  if (value.product) knownFacts.push('product');
  if (value.variant || value.model || value.size || value.color) knownFacts.push('variant');
  if (value.quantity) knownFacts.push('quantity');
  if (value.fulfillment) knownFacts.push('fulfillment');
  if (value.address) knownFacts.push('address');
  if (value.phone) knownFacts.push('phone');
  if (value.paymentMethod) knownFacts.push('payment');

  const selectedFact = getMostSpecificCatalogFact(value);
  const selectedUnavailable = selectedFact?.status === 'UNAVAILABLE';
  const selectedUnverified = selectedFact?.status === 'PROPOSED';
  let nextBestAction: SalesNextBestAction = 'ANSWER_CURRENT_QUESTION';

  if (intent === 'CHEAPER_ALTERNATIVE') nextBestAction = 'FIND_CHEAPER_ALTERNATIVE';
  else if (intent === 'PRICE_OBJECTION') nextBestAction = 'HANDLE_PRICE_OBJECTION';
  else if (intent === 'ADVICE') nextBestAction = 'RECOMMEND';
  else if (selectedUnavailable) nextBestAction = 'OFFER_ALTERNATIVE';
  else if (!value.product) nextBestAction = 'IDENTIFY_PRODUCT';
  else if (selectedUnverified) nextBestAction = 'VERIFY_PRODUCT';
  else if ((intent === 'AVAILABILITY' || intent === 'PRICE') && !value.variant && !value.model && !value.size && !value.color) nextBestAction = 'CLARIFY_VARIANT';
  else if (intent === 'ORDER' && !value.quantity) nextBestAction = 'ASK_QUANTITY';
  else if (value.quantity && !value.fulfillment) nextBestAction = 'ASK_FULFILLMENT';
  else if (value.fulfillment === 'DELIVERY' && !value.address) nextBestAction = 'ASK_ADDRESS';
  else if (value.fulfillment === 'DELIVERY' && !value.phone) nextBestAction = 'ASK_PHONE';
  else if (value.fulfillment && !value.paymentMethod) nextBestAction = 'ASK_PAYMENT';
  else if (value.product && value.quantity && value.fulfillment && (value.fulfillment === 'PICKUP' || (value.address && value.phone)) && value.paymentMethod) nextBestAction = 'CONFIRM_ORDER';

  if (!value.product) missingFacts.push('product');
  if (nextBestAction === 'CLARIFY_VARIANT') missingFacts.push('variant');
  if (nextBestAction === 'ASK_QUANTITY') missingFacts.push('quantity');
  if (nextBestAction === 'ASK_FULFILLMENT') missingFacts.push('fulfillment');
  if (nextBestAction === 'ASK_ADDRESS') missingFacts.push('address');
  if (nextBestAction === 'ASK_PHONE') missingFacts.push('phone');
  if (nextBestAction === 'ASK_PAYMENT') missingFacts.push('payment');

  return {
    intent,
    knownFacts,
    missingFacts,
    productLookupNeeded: likelyNeedsProductLookup(value, currentText) || selectedUnverified || selectedUnavailable,
    businessRuleNeeded: ['PRICE_OBJECTION', 'CHEAPER_ALTERNATIVE', 'DELIVERY', 'PICKUP', 'PAYMENT'].includes(intent),
    nextBestAction,
  };
}

export function salesStatePrompt(state: UniversalSalesState | undefined): string {
  const value = coerceUniversalSalesState(state);
  const known: string[] = [];
  if (value.product) known.push(`mahsulot=${value.product}`);
  if (value.productFamily) known.push(`mahsulot_oilasi=${value.productFamily}`);
  if (value.variant) known.push(`variant=${value.variant}`);
  if (value.model) known.push(`model=${value.model}`);
  if (value.color) known.push(`rang=${value.color}`);
  if (value.size) known.push(`o'lcham=${value.size}`);
  if (value.quantity) known.push(`miqdor=${value.quantity}`);
  if (typeof value.unitPrice === 'number') known.push(`birlik_narx=${value.unitPrice}`);
  if (typeof value.totalPrice === 'number') known.push(`jami_narx=${value.totalPrice}`);
  if (value.budget) known.push(`byudjet=${value.budget}`);
  if (value.fulfillment) known.push(`olish_usuli=${value.fulfillment}`);
  if (value.address) known.push(`manzil=${value.address}`);
  if (value.phone) known.push(`telefon=${value.phone}`);
  if (value.paymentMethod) known.push(`to'lov=${value.paymentMethod}`);
  if (value.timing) known.push(`vaqt=${value.timing}`);
  if (value.lastIntent) known.push(`oxirgi_intent=${value.lastIntent}`);
  if (value.requestedCheaper) known.push('arzonroq_variant_so‘ralgan=true');
  if (value.requestedAdvice) known.push('maslahat_so‘ralgan=true');
  if (value.wantsExactStock) known.push('exact_qoldiq_so‘ralgan=true');
  for (const [key, fact] of Object.entries(value.factStatus ?? {})) {
    if (fact && typeof fact === 'object') known.push(`${key}_status=${fact.status}`);
  }
  const plan = planSalesNextAction(value);
  known.push(`next_best_action=${plan.nextBestAction}`);
  return known.length ? known.join('; ') : 'hali strukturali sotuv fakti yo‘q';
}

export function salesLookupQuery(state: UniversalSalesState | undefined, currentText: string): string {
  const value = coerceUniversalSalesState(state);
  return [
    value.product ? `product ${value.product}` : '',
    value.productFamily ? `family ${value.productFamily}` : '',
    value.model ? `model ${value.model}` : '',
    value.variant ? `variant ${value.variant}` : '',
    value.color ? `color ${value.color}` : '',
    value.size ? `size ${value.size}` : '',
    value.requestedCheaper ? 'cheaper alternative price' : '',
    value.requestedAdvice ? 'recommendation alternatives' : '',
    normalizeSalesTextForUnderstanding(currentText),
  ].filter(Boolean).join(' | ').slice(0, 1200);
}

export function suppressUnaskedExactStock(answer: string, state: UniversalSalesState | undefined): string {
  const value = coerceUniversalSalesState(state);
  if (value.wantsExactStock) return answer;
  return answer
    .replace(/(?:,?\s*)?(?:omborda|qoldiqda|qoldiq|stock(?:da)?|остаток)\s*[:—-]?\s*\d[\d\s.,]*\s*(?:dona|ta|pcs|шт)\s*(?:mavjud|bor|qoldi|qolgan|есть)?/giu, '')
    .replace(/(?:,?\s*)?\d[\d\s.,]*\s*(?:dona|ta|pcs|шт)\s*(?:qoldi|qolgan|mavjud|в\s+наличии)/giu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

export function customerSafeSalesAnswer(answer: string, state: UniversalSalesState | undefined): string {
  let sanitized = answer
    .replace(/savolingizni\s+operator(?:ga)?\s+qoldir(?:dim|amiz|aman)?[.!]?/giu, 'Bu joyini hozir aniq ayta olmayman.')
    .replace(/operator(?:\s+tekshiradi|ga\s+beraman|ga\s+qoldiraman)[.!]?/giu, 'Bu joyini hozir aniq ayta olmayman.')
    .replace(/\b(?:BITO|MCP|QULAY\s*backend|backend|inventory\s+snapshot|tool(?:lar)?|API(?:\s*key)?|OAuth|access[-_ ]?token|refresh[-_ ]?token)\b/giu, '')
    .replace(/\b(?:BITO|WHATSAPP|TELEGRAM)_[A-Z0-9_]+\b/g, '')
    .replace(/\btekshirdim\b[,:-]?\s*/giu, '')
    .replace(/\boperator(?:ga|dan|ni|ning|lar)?\b/giu, 'sotuvchi')
    .replace(/\btizimda\s+(?:ko['‘’]?rinmadi|topilmadi)\b/giu, 'hozir topilmadi')
    .replace(/\b(?:implementation|provider)\s+(?:detail|tafsilot)\w*\b/giu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  sanitized = suppressUnaskedExactStock(sanitized, state);
  if (!sanitized) {
    const product = coerceUniversalSalesState(state).product;
    sanitized = product ? `${product} bo‘yicha yordam beraman. Qaysi variant kerak edi?` : 'Yordam beraman. Qaysi mahsulot kerak edi?';
  }
  return sanitized.slice(0, 3900);
}

export function likelyNeedsProductLookup(state: UniversalSalesState | undefined, currentText: string): boolean {
  const value = coerceUniversalSalesState(state);
  const normalized = normalizeSalesTextForUnderstanding(currentText);
  const explicitProductNeed = /\b(?:bormi|bor|mavjud|narx|price|qoldiq|stock|variant|model|rang|hajm|litr|ltr|arzonroq|qimmat|maslahat|recommend|chegirma|qancha|nech\s+pul|olaman|bering|qanaqa|qanday|qaysi|цена|налич|остат|дешев|дорог)\b/iu.test(normalized)
    || /\b\d+(?:[.,]\d+)?\s*(?:ta|dona|kg|g|litr|ltr|ml|шт)\b/iu.test(normalized);
  if (explicitProductNeed) return true;
  if (!value.product) return false;
  return /\b(?:qora|oq|qizil|ko['‘’]?k|yashil|xl|xxl|xs|delivery|yetkaz)\b/iu.test(normalized);
}

function setFact(
  state: UniversalSalesState,
  key: SalesFactKey,
  value: string,
  status: SalesFactStatus,
  source: 'CUSTOMER' | 'BITO',
  checkedAt?: string,
): void {
  state.factStatus = { ...(state.factStatus ?? {}) };
  state.factStatus[key] = { value, status, source, ...(checkedAt ? { checkedAt } : {}) };
}

function clearPriceFacts(state: UniversalSalesState): void {
  delete state.unitPrice;
  delete state.totalPrice;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clearDependentCatalogFacts(state: UniversalSalesState): void {
  for (const key of ['variant', 'model', 'color', 'size'] as const) delete state[key];
  if (state.factStatus) {
    const next = { ...state.factStatus };
    for (const key of ['variant', 'model', 'color', 'size'] as const) delete next[key];
    state.factStatus = next;
  }
}

function clearModelDependentFacts(state: UniversalSalesState): void {
  for (const key of ['color', 'size'] as const) delete state[key];
  if (state.factStatus) {
    const next = { ...state.factStatus };
    for (const key of ['color', 'size'] as const) delete next[key];
    state.factStatus = next;
  }
}

function getMostSpecificCatalogFact(state: UniversalSalesState): SalesFact | undefined {
  for (const key of ['color', 'size', 'variant', 'model', 'product'] as const) {
    const fact = state.factStatus?.[key];
    if (fact) return fact;
  }
  return undefined;
}

function findInventorySnapshot(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > 5 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findInventorySnapshot(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  const object = value as Record<string, unknown>;
  if (typeof object.availabilityStatus === 'string' && ['IN_STOCK', 'OUT_OF_STOCK', 'NOT_FOUND'].includes(object.availabilityStatus)) return object;
  for (const key of ['data', 'result', 'payload', 'output']) {
    const found = findInventorySnapshot(object[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function inferProductFamily(product: string): string | undefined {
  const normalized = normalizeSalesTextForUnderstanding(product);
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!tokens.length) return undefined;
  if (tokens[0] === 'iphone') return 'iphone';
  if (tokens[0] === 'coca' && tokens[1] === 'cola') return 'coca cola';
  const family = tokens
    .filter(token => !/\d/u.test(token) && !/^(?:pro|max|plus|mini|ultra|pet|zero)$/iu.test(token))
    .slice(0, 2);
  if (family.length) return family.join(' ').trim();
  const first = tokens[0];
  if (!first) return undefined;
  return /\p{L}/u.test(first) && !/\d/u.test(first) && !/^(?:pro|max|plus|mini|ultra|pet|zero)$/iu.test(first) ? first : undefined;
}

function parseProductCandidate(candidate: string): { product: string; family?: string; model?: string } {
  const clean = cleanProductCandidate(candidate);
  const family = inferProductFamily(clean);
  if (!family || !/\d/u.test(clean)) return { product: clean, ...(family ? { family } : {}) };
  const cleanTokens = canonicalComparable(clean).split(' ').filter(Boolean);
  const familyTokens = canonicalComparable(family).split(' ').filter(Boolean);
  const startsWithFamily = familyTokens.length > 0 && familyTokens.every((token, index) => cleanTokens[index] === token);
  if (!startsWithFamily) return { product: clean, family };
  const model = cleanTokens.slice(familyTokens.length).join(' ').trim();
  return { product: family, family, ...(model ? { model } : {}) };
}

function isModelOnlyCandidate(candidate: string): boolean {
  const normalized = canonicalComparable(candidate);
  if (!normalized || !/\d/u.test(normalized)) return false;
  const tokens = normalized.split(' ').filter(Boolean);
  const generic = /^(?:pro|por|proo|max|plus|mini|ultra|pet|zero|gb|tb)$/iu;
  return tokens.every(token => /\d/u.test(token) || generic.test(token));
}

function canonicalComparable(value: string | undefined): string {
  return normalizeSalesTextForUnderstanding(value ?? '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsProductPhrase(model: string, product: string | undefined): boolean {
  if (!product) return false;
  const m = canonicalComparable(model);
  const p = canonicalComparable(product);
  return Boolean(m && p && (m.includes(p) || p.includes(m)));
}

function extractQuantity(text: string): number | undefined {
  const numeric = text.match(/\b(\d{1,7})(?:[.,]\d+)?\s*(?:ta|dona|шт|pcs|pieces?)\b/iu);
  if (numeric) return Math.max(1, Number(numeric[1]));
  const plainAfterOrder = text.match(/\b(?:olaman|bering|kerak)\s+(\d{1,7})\b/iu);
  if (plainAfterOrder) return Math.max(1, Number(plainAfterOrder[1]));
  for (const [word, number] of Object.entries(UZ_NUMBER_WORDS)) {
    if (new RegExp(`\\b${escapeRegex(word)}(?:\\s*(?:ta|dona))?\\b`, 'iu').test(text)) return number;
  }
  return undefined;
}

function extractVolume(text: string): string | undefined {
  const match = text.match(/\b(\d+(?:[.,]\d+)?)\s*(ml|millilitr(?:dan|idan|lik)?|l|ltr(?:dan|idan)?|litr(?:dan|idan|lik|likdan)?)\b/iu);
  if (!match) return undefined;
  const amount = match[1].replace(',', '.');
  return /ml/i.test(match[2]) ? `${amount} ml` : `${amount}L`;
}

function extractSize(text: string): string | undefined {
  const match = text.match(/\b(3xl|2xl|xxl|xl|xs|s|m|l)\b/iu);
  return match?.[1]?.toUpperCase();
}

function extractCompactModel(text: string): string | undefined {
  const cleaned = normalizeSalesTextForUnderstanding(text)
    .replace(/[?!.,]+$/u, '')
    .replace(/\b(?:kerak|bormi|bor\s+mi|mavjudmi|mavjud|please|iltimos)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 2 || cleaned.length > 60) return undefined;
  if (!/\d/u.test(cleaned) || !/\p{L}/u.test(cleaned)) return undefined;
  const compactTokens = cleaned.match(/[\p{L}\p{N}+.-]+/gu) ?? [];
  if (compactTokens.length > 4) return undefined;
  if (/(?:\b\d+(?:[.,]\d+)?\s*(?:ta|dona|kg|g|litr|litrlik|ltr|ml)\b)/iu.test(cleaned)) return undefined;
  return cleaned;
}

function detectColor(text: string): string | undefined {
  for (const [pattern, value] of COLOR_PATTERNS) if (pattern.test(text)) return value;
  return undefined;
}

function detectPayment(text: string): UniversalSalesState['paymentMethod'] | undefined {
  if (/\b(?:click)\b/iu.test(text)) return 'CLICK';
  if (/\b(?:payme)\b/iu.test(text)) return 'PAYME';
  if (/\b(?:naqd|cash|налич)\b/iu.test(text)) return 'CASH';
  if (/\b(?:karta|card|terminal|карта)\b/iu.test(text)) return 'CARD';
  if (/\b(?:perevod|transfer|o['‘’]?tkazma|перевод)\b/iu.test(text)) return 'TRANSFER';
  return undefined;
}

function extractBudget(text: string): string | undefined {
  const match = text.match(/\b(\d+(?:[.,]\d+)?)\s*(mln|million|млн|ming|k|тыс)?\s*(?:so['‘’]?m|sum|uzs|usd|dollar|доллар)?\b/iu);
  if (!match || !/(?:byudjet|budget|atrofida|gacha|дан|до|mln|million|млн)/iu.test(text)) return undefined;
  return match[0].trim();
}

function extractTiming(rawText: string, normalized: string): string | undefined {
  const hasTimeSignal = /\b(?:bugun|ertaga|indin|today|tomorrow|сегодня|завтра|soat|at|ga)\b/iu.test(normalized);
  if (!hasTimeSignal) return undefined;
  const clock = rawText.match(/\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:ga|da|larda)?\b/u);
  if (!clock && !/\b(?:bugun|ertaga|indin|today|tomorrow|сегодня|завтра)\b/iu.test(normalized)) return undefined;
  return rawText.trim().slice(0, 120);
}

function detectAddress(rawText: string, normalized: string, deliverySelected: boolean): string | undefined {
  if (!deliverySelected) return undefined;
  if (/\b(?:delivery|yetkaz|manzil|telefon|to'lov|click|payme|naqd|karta)\b/iu.test(normalized) && normalized.split(/\s+/u).length <= 4) return undefined;
  const looksAddress = /(?:\b(?:ko['‘’]?cha|mahalla|mavze|kvartal|uy|dom|xonadon|tuman|tumani|rayon|street|district|улиц|дом|квартал)\b|\d{1,4}[-/ ]?(?:uy|dom|kv|kvartal)?)/iu.test(normalized);
  if (!looksAddress) return undefined;
  return rawText.trim().slice(0, 500);
}

function isUsefulProductCandidate(candidate: string, normalized: string): boolean {
  if (!/[\p{L}]/u.test(candidate)) return false;
  if (detectColor(candidate)) return false;
  const value = candidate.toLocaleLowerCase();
  if (/^(?:qora|oq|qizil|kok|ko'k|yashil|kulrang|arzonroq|delivery|pickup|click|payme|naqd|karta|manzil|telefon|qimmat|alo|sotuvchi|olsam|olsak|olsa)$/iu.test(value)) return false;
  if (/^(?:litrlik|litr|ltr|dona|variant|model|rang|hajm)$/iu.test(value)) return false;
  if (normalizeSalesTextForUnderstanding(candidate) === normalizeSalesTextForUnderstanding(normalized) && /^(?:qimmat|arzonroq|maslahat)/iu.test(normalized)) return false;
  return true;
}

function cleanProductCandidate(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

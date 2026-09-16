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
  | 'CATALOG_OPTIONS'
  | 'COMPARISON'
  | 'STORE_INFO'
  | 'ACKNOWLEDGEMENT'
  | 'SOFT_EXIT'
  | 'GREETING'
  | 'NON_SALES'
  | 'GENERAL';

export type SalesFactStatus = 'PROPOSED' | 'VERIFIED' | 'UNAVAILABLE';
export type SalesFactKey = 'product' | 'productFamily' | 'variant' | 'model' | 'storage' | 'size' | 'color';
export type SalesFact = {
  value: string;
  status: SalesFactStatus;
  source: 'CUSTOMER' | 'BITO';
  checkedAt?: string;
};

export type SalesOfferedAlternative = {
  name: string;
  product?: string;
  productFamily?: string;
  model?: string;
  storage?: string;
  variant?: string;
  color?: string;
  size?: string;
  unitPrice?: number;
  stockQuantity?: number;
  source: 'BITO';
  offeredAt: string;
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

export type SalesCatalogScope = 'NONE' | 'FAMILY' | 'PRODUCT' | 'SELECTION';
export type SalesBusinessFactRequest = 'NONE' | 'STORE_ADDRESS' | 'BUSINESS_HOURS' | 'PUBLIC_PHONE' | 'DELIVERY_POLICY' | 'PAYMENT_METHODS' | 'PAYMENT_DETAILS';

/**
 * Semantic interpretation produced by the sales conversation brain. This is
 * intentionally customer-language state, not ERP truth. Product facts remain
 * PROPOSED until the Bito catalog validates them.
 */
export type SalesTurnUnderstanding = {
  intent: UniversalSalesIntent;
  topicSwitch: boolean;
  followUp: boolean;
  needsCatalogLookup: boolean;
  catalogScope: SalesCatalogScope;
  clearUnavailableSelection: boolean;
  product?: string;
  productFamily?: string;
  model?: string;
  storage?: string;
  variant?: string;
  color?: string;
  size?: string;
  quantity?: number;
  budget?: string;
  fulfillment?: 'DELIVERY' | 'PICKUP';
  address?: string;
  phone?: string;
  paymentMethod?: 'CASH' | 'CARD' | 'CLICK' | 'PAYME' | 'TRANSFER' | 'OTHER';
  timing?: string;
  businessFactRequest: SalesBusinessFactRequest;
  answerGoal?: string;
};

export type UniversalSalesState = {
  version: 1;
  product?: string;
  productFamily?: string;
  variant?: string;
  model?: string;
  storage?: string;
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
  offeredAlternative?: SalesOfferedAlternative;
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
  for (const key of ['product', 'productFamily', 'variant', 'model', 'storage', 'color', 'size', 'budget', 'address', 'phone', 'timing', 'updatedAt'] as const) {
    stringField(key, key === 'address' ? 500 : 300);
  }
  if (typeof source.quantity === 'number' && Number.isFinite(source.quantity) && source.quantity > 0) state.quantity = Math.min(source.quantity, 1_000_000);
  if (typeof source.unitPrice === 'number' && Number.isFinite(source.unitPrice) && source.unitPrice >= 0) state.unitPrice = source.unitPrice;
  if (typeof source.totalPrice === 'number' && Number.isFinite(source.totalPrice) && source.totalPrice >= 0) state.totalPrice = source.totalPrice;
  if (source.fulfillment === 'DELIVERY' || source.fulfillment === 'PICKUP') state.fulfillment = source.fulfillment;
  if (['CASH', 'CARD', 'CLICK', 'PAYME', 'TRANSFER', 'OTHER'].includes(String(source.paymentMethod))) state.paymentMethod = source.paymentMethod as UniversalSalesState['paymentMethod'];
  if (['AVAILABILITY', 'PRICE', 'EXACT_STOCK', 'PRICE_OBJECTION', 'CHEAPER_ALTERNATIVE', 'ADVICE', 'VARIANT', 'QUANTITY', 'DELIVERY', 'PICKUP', 'ADDRESS', 'PHONE', 'PAYMENT', 'ORDER', 'CATALOG_OPTIONS', 'COMPARISON', 'STORE_INFO', 'ACKNOWLEDGEMENT', 'SOFT_EXIT', 'GREETING', 'NON_SALES', 'GENERAL'].includes(String(source.lastIntent))) {
    state.lastIntent = source.lastIntent as UniversalSalesIntent;
  }
  if (typeof source.wantsExactStock === 'boolean') state.wantsExactStock = source.wantsExactStock;
  if (typeof source.requestedCheaper === 'boolean') state.requestedCheaper = source.requestedCheaper;
  if (typeof source.requestedAdvice === 'boolean') state.requestedAdvice = source.requestedAdvice;

  if (source.offeredAlternative && typeof source.offeredAlternative === 'object' && !Array.isArray(source.offeredAlternative)) {
    const raw = source.offeredAlternative as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 300) : '';
    if (name) {
      const offered: SalesOfferedAlternative = {
        name,
        source: 'BITO',
        offeredAt: typeof raw.offeredAt === 'string' ? raw.offeredAt.slice(0, 50) : new Date().toISOString(),
      };
      for (const key of ['product', 'productFamily', 'model', 'storage', 'variant', 'color', 'size'] as const) {
        const rawValue = raw[key];
        if (typeof rawValue === 'string' && rawValue.trim()) offered[key] = rawValue.trim().slice(0, 300);
      }
      if (typeof raw.unitPrice === 'number' && Number.isFinite(raw.unitPrice) && raw.unitPrice >= 0) offered.unitPrice = raw.unitPrice;
      if (typeof raw.stockQuantity === 'number' && Number.isFinite(raw.stockQuantity) && raw.stockQuantity >= 0) offered.stockQuantity = raw.stockQuantity;
      state.offeredAlternative = offered;
    }
  }

  if (source.factStatus && typeof source.factStatus === 'object' && !Array.isArray(source.factStatus)) {
    const factStatus: Partial<Record<SalesFactKey, SalesFact>> = {};
    for (const key of ['product', 'productFamily', 'variant', 'model', 'storage', 'size', 'color'] as const) {
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
    || /\b(?:qanaqa|qanday|qaysi\p{L}*)\b.{0,60}\bbor\b/iu.test(normalized);
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
  const storage = extractStorage(normalized);
  const size = extractSize(normalized);
  const compactModel = extractCompactModel(rawText);
  const budget = extractBudget(normalized);
  const timing = extractTiming(rawText, normalized);
  const address = phone ? undefined : detectAddress(rawText, normalized, delivery || state.fulfillment === 'DELIVERY');

  const hadProduct = Boolean(state.product);
  const previousProduct = state.product;
  const productCandidate = bitoInventorySearchTerm(normalized)?.trim();
  const followUpSignals = Boolean(volume || color || storage || size || compactModel || quantity !== undefined || delivery || pickup || payment || priceObjection || cheaper || advice || phone || address);

  if (productCandidate && isUsefulProductCandidate(productCandidate, normalized)) {
    const clean = cleanProductCandidate(productCandidate);
    const parsed = parseProductCandidate(clean);
    const activeFamily = state.productFamily || inferProductFamily(state.product ?? '');
    const sameFamily = Boolean(activeFamily && parsed.family && canonicalComparable(activeFamily) === canonicalComparable(parsed.family));
    const modelOnlyFollowUp = hadProduct && isModelOnlyCandidate(clean);
    const attributeFollowUp = hadProduct && Boolean(volume || color || storage || size);
    const sameFamilyModelFollowUp = hadProduct && sameFamily && Boolean(parsed.model);
    const followUpCandidate = modelOnlyFollowUp || attributeFollowUp || sameFamilyModelFollowUp;

    const explicitNewFamily = hadProduct && parsed.family && activeFamily
      && canonicalComparable(parsed.family) !== canonicalComparable(activeFamily);
    const catalogSelectionSignal = availability || price || order
      || /\b(?:kerak|model|variant|hajm|rang|xotira|pamyat|gb|tb|litr|ltr|kg|dona|ta)\b/iu.test(normalized)
      || /\d/u.test(clean);
    const shouldReplaceProduct = !hadProduct
      || Boolean(explicitNewFamily && !attributeFollowUp && catalogSelectionSignal);

    if (shouldReplaceProduct) {
      const nextProduct = parsed.product || clean;
      const changed = previousProduct && canonicalComparable(previousProduct) !== canonicalComparable(nextProduct);
      if (changed) {
        clearDependentCatalogFacts(state);
        clearPriceFacts(state);
        delete state.quantity;
      }
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
  if (compactModel && hadProduct && !volume && !color && !storage && !size && !containsProductPhrase(compactModel, state.product)) {
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
  if (storage) {
    if (state.storage && canonicalComparable(state.storage) !== canonicalComparable(storage)) clearPriceFacts(state);
    state.storage = storage;
    setFact(state, 'storage', storage, 'PROPOSED', 'CUSTOMER');
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
                          : (volume || color || storage || size || compactModel) ? 'VARIANT'
                            : order ? 'ORDER'
                              : 'GENERAL';
  state.updatedAt = new Date().toISOString();
  return state;
}

export function applySalesTurnUnderstanding(
  previous: UniversalSalesState | undefined,
  understanding: SalesTurnUnderstanding,
  rawText: string,
): UniversalSalesState {
  const state = coerceUniversalSalesState(previous);
  const before = coerceUniversalSalesState(previous);

  if (understanding.topicSwitch) {
    clearProductSelectionContext(state);
    delete state.offeredAlternative;
  } else if (shouldAcceptOfferedAlternative(state, understanding, rawText)) {
    acceptOfferedAlternative(state);
  }
  if (understanding.clearUnavailableSelection) clearUnavailableSelectionFacts(state);

  // Keep a conservative deterministic fallback for literal facts (phone,
  // quantity, payment, obvious volume/color) if the semantic brain omitted
  // them. Product/topic decisions still come from the semantic understanding.
  const fallback = updateUniversalSalesState(state, rawText);

  const nextProduct = cleanOptional(understanding.product);
  const nextFamily = cleanOptional(understanding.productFamily);
  const nextModel = cleanOptional(understanding.model);
  const nextStorage = cleanOptional(understanding.storage);
  const nextVariant = cleanOptional(understanding.variant);
  const nextColor = cleanOptional(understanding.color);
  const nextSize = cleanOptional(understanding.size);
  const explicitSelection = Boolean(nextProduct || nextFamily || nextModel || nextStorage || nextVariant || nextColor || nextSize);
  if (explicitSelection && state.offeredAlternative) {
    const offered = canonicalComparable(state.offeredAlternative.name);
    const requested = canonicalComparable([nextProduct, nextFamily, nextModel, nextStorage, nextVariant, nextColor, nextSize].filter(Boolean).join(' '));
    if (requested && !offered.includes(requested) && !requested.includes(offered)) delete state.offeredAlternative;
  }

  if (nextProduct || nextFamily) {
    const product = nextProduct || nextFamily!;
    const changedFamily = Boolean(
      state.productFamily && nextFamily
      && canonicalComparable(state.productFamily) !== canonicalComparable(nextFamily),
    );
    const changedProduct = Boolean(
      state.product && product
      && canonicalComparable(state.product) !== canonicalComparable(product),
    );
    if ((changedFamily || changedProduct) && !understanding.topicSwitch) {
      clearProductSelectionContext(state);
    }
    const productFactChanged = !state.product || canonicalComparable(state.product) !== canonicalComparable(product);
    const resolvedFamily = nextFamily || inferProductFamily(product) || state.productFamily;
    const familyFactChanged = Boolean(resolvedFamily && (!state.productFamily || canonicalComparable(state.productFamily) !== canonicalComparable(resolvedFamily)));
    state.product = product;
    state.productFamily = resolvedFamily;
    if (productFactChanged || !state.factStatus?.product) setFact(state, 'product', product, 'PROPOSED', 'CUSTOMER');
    if (state.productFamily && (familyFactChanged || !state.factStatus?.productFamily)) setFact(state, 'productFamily', state.productFamily, 'PROPOSED', 'CUSTOMER');
  } else if (!state.product && fallback.product) {
    state.product = fallback.product;
    state.productFamily = fallback.productFamily || inferProductFamily(fallback.product);
    setFact(state, 'product', state.product, 'PROPOSED', 'CUSTOMER');
    if (state.productFamily) setFact(state, 'productFamily', state.productFamily, 'PROPOSED', 'CUSTOMER');
  }

  const previousSelection = [state.model, state.storage, state.variant, state.color, state.size].filter(Boolean).join('|');
  if (nextModel) {
    const changed = !state.model || canonicalComparable(state.model) !== canonicalComparable(nextModel);
    state.model = nextModel;
    if (!nextVariant) state.variant = nextModel;
    if (changed || !state.factStatus?.model) setFact(state, 'model', nextModel, 'PROPOSED', 'CUSTOMER');
    if (!nextVariant && (changed || !state.factStatus?.variant)) setFact(state, 'variant', nextModel, 'PROPOSED', 'CUSTOMER');
  }
  if (nextStorage) {
    const changed = !state.storage || canonicalComparable(state.storage) !== canonicalComparable(nextStorage);
    state.storage = nextStorage;
    if (changed || !state.factStatus?.storage) setFact(state, 'storage', nextStorage, 'PROPOSED', 'CUSTOMER');
  }
  if (nextVariant) {
    const changed = !state.variant || canonicalComparable(state.variant) !== canonicalComparable(nextVariant);
    state.variant = nextVariant;
    if (changed || !state.factStatus?.variant) setFact(state, 'variant', nextVariant, 'PROPOSED', 'CUSTOMER');
  }
  if (nextColor) {
    const changed = !state.color || canonicalComparable(state.color) !== canonicalComparable(nextColor);
    state.color = nextColor;
    if (changed || !state.factStatus?.color) setFact(state, 'color', nextColor, 'PROPOSED', 'CUSTOMER');
  }
  if (nextSize) {
    const changed = !state.size || canonicalComparable(state.size) !== canonicalComparable(nextSize);
    state.size = nextSize;
    if (changed || !state.factStatus?.size) setFact(state, 'size', nextSize, 'PROPOSED', 'CUSTOMER');
  }

  // Literal fallbacks are safe only for attributes that are explicitly present
  // in this turn. They must never resurrect a product selection cleared by a
  // semantic topic switch.
  if (!nextVariant && fallback.variant && fallback.variant !== before.variant && state.product) {
    state.variant = fallback.variant;
    setFact(state, 'variant', fallback.variant, 'PROPOSED', 'CUSTOMER');
  }
  if (!nextStorage && fallback.storage && fallback.storage !== before.storage) {
    state.storage = fallback.storage;
    setFact(state, 'storage', fallback.storage, 'PROPOSED', 'CUSTOMER');
  }
  if (!nextColor && fallback.color && fallback.color !== before.color) {
    state.color = fallback.color;
    setFact(state, 'color', fallback.color, 'PROPOSED', 'CUSTOMER');
  }
  if (!nextSize && fallback.size && fallback.size !== before.size) {
    state.size = fallback.size;
    setFact(state, 'size', fallback.size, 'PROPOSED', 'CUSTOMER');
  }

  const currentSelection = [state.model, state.storage, state.variant, state.color, state.size].filter(Boolean).join('|');
  if (previousSelection !== currentSelection) clearPriceFacts(state);

  const quantity = finitePositive(understanding.quantity) ?? (
    fallback.quantity !== before.quantity ? finitePositive(fallback.quantity) : undefined
  );
  if (quantity !== undefined) state.quantity = quantity;

  const budget = cleanOptional(understanding.budget) || (fallback.budget !== before.budget ? fallback.budget : undefined);
  if (budget) state.budget = budget;

  const fulfillment = understanding.fulfillment || (fallback.fulfillment !== before.fulfillment ? fallback.fulfillment : undefined);
  if (fulfillment) state.fulfillment = fulfillment;
  const address = cleanOptional(understanding.address) || (fallback.address !== before.address ? fallback.address : undefined);
  if (address) state.address = address;
  const phone = cleanOptional(understanding.phone) || (fallback.phone !== before.phone ? fallback.phone : undefined);
  if (phone) state.phone = phone;
  const payment = understanding.paymentMethod || (fallback.paymentMethod !== before.paymentMethod ? fallback.paymentMethod : undefined);
  if (payment) state.paymentMethod = payment;
  const timing = cleanOptional(understanding.timing) || (fallback.timing !== before.timing ? fallback.timing : undefined);
  if (timing) state.timing = timing;

  if (typeof state.unitPrice === 'number' && state.quantity) state.totalPrice = roundMoney(state.unitPrice * state.quantity);
  else if (!state.quantity) delete state.totalPrice;

  state.lastIntent = understanding.intent;
  state.wantsExactStock = understanding.intent === 'EXACT_STOCK';
  state.requestedCheaper = understanding.intent === 'CHEAPER_ALTERNATIVE';
  state.requestedAdvice = understanding.intent === 'ADVICE';
  state.updatedAt = new Date().toISOString();
  return state;
}

export function salesCatalogLookupScopeForUnderstanding(
  state: UniversalSalesState | undefined,
  understanding: SalesTurnUnderstanding | undefined,
): SalesCatalogScope {
  const value = coerceUniversalSalesState(state);
  let scope = understanding?.catalogScope ?? 'SELECTION';
  if (scope === 'NONE') return 'NONE';

  // If the customer previously selected an unavailable subvariant and now says
  // “5 ta olaman / ko‘rsat / boshqasidan”, do not keep querying the rejected
  // exact variant forever. Broaden only the LOOKUP to the family so the model
  // can offer real alternatives. The unavailable selection stays in state
  // until the customer explicitly accepts a replacement, so we never silently
  // substitute 1L for 1.5L or black for red.
  const introducedNewSelection = Boolean(
    understanding?.model || understanding?.storage || understanding?.variant || understanding?.color || understanding?.size,
  );
  const hasUnavailableSpecific = (['color', 'storage', 'size', 'variant', 'model'] as const).some(
    key => value.factStatus?.[key]?.status === 'UNAVAILABLE',
  );
  if (hasUnavailableSpecific && !introducedNewSelection
    && ['QUANTITY', 'PRICE', 'ORDER', 'CATALOG_OPTIONS', 'ACKNOWLEDGEMENT'].includes(understanding?.intent ?? '')) {
    scope = 'FAMILY';
  }
  return scope;
}

export function salesCatalogLookupQueryForUnderstanding(
  state: UniversalSalesState | undefined,
  understanding: SalesTurnUnderstanding | undefined,
  currentText: string,
): string | undefined {
  const value = coerceUniversalSalesState(state);
  const scope = salesCatalogLookupScopeForUnderstanding(value, understanding);
  if (scope === 'NONE') return undefined;
  if (scope === 'FAMILY') {
    return (value.productFamily || value.product || bitoInventorySearchTerm(normalizeSalesTextForUnderstanding(currentText)) || undefined)?.trim();
  }
  if (scope === 'PRODUCT') {
    return (value.product || value.productFamily || bitoInventorySearchTerm(normalizeSalesTextForUnderstanding(currentText)) || undefined)?.trim();
  }
  return salesCatalogLookupQuery(value, currentText);
}

export function salesTurnUnderstandingPrompt(understanding: SalesTurnUnderstanding | undefined): string {
  if (!understanding) return 'Semantik turn tahlili mavjud emas; suhbat tarixidan tabiiy xulosa qiling.';
  const facts = [
    `intent=${understanding.intent}`,
    `follow_up=${understanding.followUp}`,
    `topic_switch=${understanding.topicSwitch}`,
    `catalog_lookup=${understanding.needsCatalogLookup}`,
    `catalog_scope=${understanding.catalogScope}`,
    `business_fact=${understanding.businessFactRequest}`,
  ];
  if (understanding.answerGoal) facts.push(`answer_goal=${understanding.answerGoal.slice(0, 500)}`);
  return facts.join('; ');
}

export function salesCatalogLookupQuery(state: UniversalSalesState | undefined, currentText: string): string | undefined {
  const value = coerceUniversalSalesState(state);
  const direct = bitoInventorySearchTerm(normalizeSalesTextForUnderstanding(currentText))?.trim();
  if (!value.product) return direct;

  const parts: string[] = [value.product];
  for (const extra of [value.model, value.storage, value.variant, value.color, value.size]) {
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
  scope: SalesCatalogScope = 'SELECTION',
): UniversalSalesState {
  const state = coerceUniversalSalesState(current);
  const snapshot = findInventorySnapshot(inventoryPayload);
  if (!snapshot) return state;
  const status = typeof snapshot.availabilityStatus === 'string' ? snapshot.availabilityStatus : '';
  if (!['IN_STOCK', 'OUT_OF_STOCK', 'NOT_FOUND'].includes(status)) return state;
  const checkedAt = new Date().toISOString();

  if (status === 'IN_STOCK') {
    const verifiedKeys: SalesFactKey[] = scope === 'FAMILY'
      ? ['productFamily', 'product']
      : scope === 'PRODUCT'
        ? ['productFamily', 'product', 'model']
        : ['product', 'productFamily', 'variant', 'model', 'storage', 'size', 'color'];
    for (const key of verifiedKeys) {
      const value = state[key];
      if (typeof value === 'string' && value.trim()) setFact(state, key, value, 'VERIFIED', 'BITO', checkedAt);
    }
    const items = Array.isArray(snapshot.items) ? snapshot.items.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : [];
    const publicPrices = [...new Set(items
      .map(item => item.price)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0))];

    // A family browse (“iPhone bormi?”, alternatives after an unavailable
    // 1.5L) is not an accepted concrete selection. Never attach an arbitrary
    // family price to the active order or mark an unavailable subvariant as
    // verified merely because some sibling variant exists.
    if (scope === 'FAMILY') {
      if (hasUnavailableSpecificFact(state)) captureOfferedAlternative(state, items, checkedAt);
      return state;
    }

    // Never choose an arbitrary price when a query still resolves to several
    // real variants (for example storage/color variants of the same phone).
    // A deterministic unit price is safe only for one row or one common price.
    if (items.length === 1 || publicPrices.length === 1) {
      const publicPrice = publicPrices[0];
      if (typeof publicPrice === 'number') {
        state.unitPrice = publicPrice;
        if (state.quantity) state.totalPrice = roundMoney(publicPrice * state.quantity);
      }
    } else if (publicPrices.length > 1) {
      clearPriceFacts(state);
    }
    return state;
  }

  const specific = (['color', 'storage', 'size', 'variant', 'model'] as const).find(key => {
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
    captureOfferedAlternative(state, Array.isArray(snapshot.familyAlternatives) ? snapshot.familyAlternatives : [], checkedAt);
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
  captureOfferedAlternative(state, Array.isArray(snapshot.familyAlternatives) ? snapshot.familyAlternatives : [], checkedAt);
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

  const conversationalOnly = ['ACKNOWLEDGEMENT', 'GREETING', 'SOFT_EXIT', 'NON_SALES', 'STORE_INFO', 'CATALOG_OPTIONS', 'COMPARISON'].includes(intent);
  if (conversationalOnly) nextBestAction = 'ANSWER_CURRENT_QUESTION';
  else if (intent === 'CHEAPER_ALTERNATIVE') nextBestAction = 'FIND_CHEAPER_ALTERNATIVE';
  else if (intent === 'PRICE_OBJECTION') nextBestAction = 'HANDLE_PRICE_OBJECTION';
  else if (intent === 'ADVICE') nextBestAction = 'RECOMMEND';
  else if (selectedUnavailable) nextBestAction = 'OFFER_ALTERNATIVE';
  else if (!value.product) nextBestAction = 'IDENTIFY_PRODUCT';
  else if (selectedUnverified) nextBestAction = 'VERIFY_PRODUCT';
  else if ((intent === 'AVAILABILITY' || intent === 'PRICE') && !value.variant && !value.model && !value.size && !value.color) nextBestAction = 'CLARIFY_VARIANT';
  else if (intent === 'ORDER' && !value.quantity) nextBestAction = 'ASK_QUANTITY';
  else if (['ORDER', 'QUANTITY', 'PRICE'].includes(intent) && value.quantity && !value.fulfillment) nextBestAction = 'ASK_FULFILLMENT';
  else if (['DELIVERY', 'ADDRESS', 'PHONE', 'PAYMENT', 'ORDER'].includes(intent) && value.fulfillment === 'DELIVERY' && !value.address) nextBestAction = 'ASK_ADDRESS';
  else if (['DELIVERY', 'ADDRESS', 'PHONE', 'PAYMENT', 'ORDER'].includes(intent) && value.fulfillment === 'DELIVERY' && !value.phone) nextBestAction = 'ASK_PHONE';
  else if (['DELIVERY', 'PICKUP', 'PAYMENT', 'ORDER'].includes(intent) && value.fulfillment && !value.paymentMethod) nextBestAction = 'ASK_PAYMENT';
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
  if (value.storage) known.push(`xotira=${value.storage}`);
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
  if (value.offeredAlternative) {
    known.push(`taklif_qilingan_real_variant=${value.offeredAlternative.name}`);
    if (typeof value.offeredAlternative.unitPrice === 'number') known.push(`taklif_narxi=${value.offeredAlternative.unitPrice}`);
  }
  for (const [key, fact] of Object.entries(value.factStatus ?? {})) {
    if (fact && typeof fact === 'object') known.push(`${key}_status=${fact.status}`);
  }
  // Do not expose a deterministic funnel step to the response model. The
  // semantic sales brain decides the useful next move from the whole dialog;
  // this state is only memory + verification truth.
  return known.length ? known.join('; ') : 'hali strukturali sotuv fakti yo‘q';
}

export function salesLookupQuery(state: UniversalSalesState | undefined, currentText: string): string {
  const value = coerceUniversalSalesState(state);
  return [
    value.product ? `product ${value.product}` : '',
    value.productFamily ? `family ${value.productFamily}` : '',
    value.model ? `model ${value.model}` : '',
    value.storage ? `storage ${value.storage}` : '',
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
    .replace(/(?:,?\s*)?\d[\d\s.,]*\s*(?:dona|ta|pcs|шт)\s*(?:qoldi|qolgan|mavjud|bor|есть|в\s+наличии)/giu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

export function customerSafeSalesAnswer(answer: string, state: UniversalSalesState | undefined): string {
  let sanitized = answer
    .replace(/savolingizni\s+operator(?:ga)?\s+qoldir(?:dim|amiz|aman)?[.!]?/giu, 'Buni hozir ishonchli ayta olmayman.')
    .replace(/operator(?:\s+tekshiradi|ga\s+beraman|ga\s+qoldiraman)[.!]?/giu, 'Buni hozir ishonchli ayta olmayman.')
    .replace(/\b(?:BITO|MCP|QULAY\s*backend|backend|inventory\s+snapshot|tool(?:lar)?|API(?:\s*key)?|OAuth|access[-_ ]?token|refresh[-_ ]?token)\b/giu, '')
    .replace(/\b(?:BITO|WHATSAPP|TELEGRAM)_[A-Z0-9_]+\b/g, '')
    .replace(/\btekshirdim\b[,:-]?\s*/giu, '')
    .replace(/\boperator(?:ga|dan|ni|ning|lar)?\b/giu, 'sotuvchi')
    .replace(/\btizimda\s+(?:ko['‘’]?rinmadi|topilmadi)\b/giu, 'hozir topilmadi')
    .replace(/\b(?:implementation|provider)\s+(?:detail|tafsilot)\w*\b/giu, '')
    .replace(/^\s*(?:orqali|bilan)\s*[:.,;—-]*\s*/iu, '')
    .replace(/(?:^|[.!?]\s+)(?:orqali|bilan)\s*[.!?]?\s*/giu, '$1')
    .replace(/^[\s,.:;—-]+/u, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  sanitized = suppressUnaskedExactStock(sanitized, state)
    .replace(/^[\s,.:;—-]+/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!sanitized) {
    const product = coerceUniversalSalesState(state).product;
    sanitized = product ? `${product} bo‘yicha yordam beraman. Qaysi variant kerak edi?` : 'Yordam beraman. Qaysi mahsulot kerak edi?';
  }
  return sanitized.slice(0, 3900);
}


export function salesSelectionLabel(state: UniversalSalesState | undefined): string | undefined {
  const value = coerceUniversalSalesState(state);
  const parts: string[] = [];
  for (const item of [value.product, value.model, value.storage, value.variant, value.color, value.size]) {
    const clean = item?.trim();
    if (!clean) continue;
    const comparable = canonicalComparable(clean);
    if (parts.some(part => canonicalComparable(part).includes(comparable) || comparable.includes(canonicalComparable(part)))) continue;
    parts.push(clean);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim() || undefined;
}

export function deterministicSalesFallbackReply(
  state: UniversalSalesState | undefined,
  intent?: UniversalSalesIntent,
  language = 'uz',
): string {
  const value = coerceUniversalSalesState(state);
  const selected = salesSelectionLabel(value);
  const mostSpecific = getMostSpecificCatalogFact(value);
  const unavailable = mostSpecific?.status === 'UNAVAILABLE';
  const verified = mostSpecific?.status === 'VERIFIED';
  const ru = language === 'ru';

  if (unavailable) {
    const unavailableText = selected
      ? (ru ? `${selected} сейчас нет в наличии.` : `${selected} hozir yo‘q ekan.`)
      : (ru ? 'Этого варианта сейчас нет в наличии.' : 'Bu variant hozir yo‘q ekan.');
    const offer = value.offeredAlternative;
    if (!offer) return unavailableText;
    const price = typeof offer.unitPrice === 'number'
      ? ` — ${new Intl.NumberFormat(ru ? 'ru-RU' : 'uz-UZ').format(offer.unitPrice)} so'm`
      : '';
    return ru ? `${unavailableText} Есть ${offer.name}${price}.` : `${unavailableText} ${offer.name} bor${price}.`;
  }
  if ((intent ?? value.lastIntent) === 'AVAILABILITY' && verified) {
    const hasSpecific = Boolean(value.model || value.storage || value.variant || value.color || value.size);
    if (selected) {
      if (hasSpecific) return ru ? `${selected} есть в наличии.` : `${selected} bor.`;
      return ru ? `${selected} есть. Какая модель вам нужна?` : `${selected} bor. Qaysi model kerak edi?`;
    }
  }
  if ((intent ?? value.lastIntent) === 'PRICE' && selected) {
    return ru ? `По ${selected} уточню точную цену по актуальным данным.` : `${selected} bo‘yicha aniq narxni real ma’lumotdan tekshirib aytaman.`;
  }
  return ru ? 'Помогу. Какой товар или модель вам нужна?' : 'Yordam beraman. Qaysi mahsulot yoki model kerak edi?';
}

export function likelyNeedsProductLookup(state: UniversalSalesState | undefined, currentText: string): boolean {
  const value = coerceUniversalSalesState(state);
  const normalized = normalizeSalesTextForUnderstanding(currentText);
  const explicitProductNeed = /\b(?:bormi|bor|mavjud|narx|price|qoldiq|stock|variant|model|rang|xotira|pamyat|gb|tb|hajm|litr|ltr|arzonroq|qimmat|maslahat|recommend|chegirma|qancha|nech\s+pul|olaman|bering|qanaqa|qanday|qaysi|цена|налич|остат|дешев|дорог)\b/iu.test(normalized)
    || /\b\d+(?:[.,]\d+)?\s*(?:ta|dona|kg|g|litr|ltr|ml|шт)\b/iu.test(normalized);
  if (explicitProductNeed) return true;
  if (!value.product) return false;
  return /\b(?:qora|oq|qizil|ko['‘’]?k|yashil|xotira|pamyat|gb|tb|xl|xxl|xs|delivery|yetkaz)\b/iu.test(normalized);
}


function hasUnavailableSpecificFact(state: UniversalSalesState): boolean {
  return (['color', 'storage', 'size', 'variant', 'model', 'product'] as const)
    .some(key => state.factStatus?.[key]?.status === 'UNAVAILABLE');
}

function captureOfferedAlternative(state: UniversalSalesState, rawItems: unknown[], checkedAt: string): void {
  const candidates = rawItems
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => item as Record<string, unknown>)
    .filter(item => typeof item.name === 'string' && item.name.trim())
    .filter(item => typeof item.quantity !== 'number' || item.quantity > 0);
  const item = candidates[0];
  if (!item) return;
  const name = String(item.name).trim().slice(0, 300);
  const parsed = parseProductCandidate(name);
  const normalized = normalizeSalesTextForUnderstanding(name);
  const storage = extractStorage(normalized);
  const color = detectColor(normalized);
  const size = extractSize(normalized);
  const volume = extractVolume(normalized);
  const offered: SalesOfferedAlternative = {
    name,
    product: parsed.product,
    productFamily: parsed.family || inferProductFamily(parsed.product),
    ...(parsed.model ? { model: parsed.model, variant: parsed.model } : {}),
    ...(storage ? { storage } : {}),
    ...(color ? { color } : {}),
    ...(size ? { size } : {}),
    ...(volume ? { variant: volume } : {}),
    ...(typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0 ? { unitPrice: item.price } : {}),
    ...(typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity >= 0 ? { stockQuantity: item.quantity } : {}),
    source: 'BITO',
    offeredAt: checkedAt,
  };
  state.offeredAlternative = offered;
}

function shouldAcceptOfferedAlternative(state: UniversalSalesState, understanding: SalesTurnUnderstanding, rawText: string): boolean {
  if (!state.offeredAlternative || understanding.topicSwitch) return false;
  const explicitSelection = Boolean(
    understanding.product || understanding.productFamily || understanding.model || understanding.storage
    || understanding.variant || understanding.color || understanding.size,
  );
  if (explicitSelection) return false;
  const normalized = normalizeSalesTextForUnderstanding(rawText);
  if (/\b(?:yo['‘’]?q|kerak\s+emas|olmayman|boshqa|нет|не\s+надо|no)\b/iu.test(normalized)) return false;
  if (['QUANTITY', 'PRICE', 'ORDER'].includes(understanding.intent)) return true;
  if (understanding.intent !== 'ACKNOWLEDGEMENT') return false;
  return /^(?:ha|xa|mayli|xo['‘’]?p|hop|bo['‘’]?ladi|boladi|ok|okay|да|хорошо|ладно)[!.?,\s]*$/iu.test(normalized);
}

function acceptOfferedAlternative(state: UniversalSalesState): void {
  const offer = state.offeredAlternative;
  if (!offer) return;
  clearProductSelectionContext(state);
  state.product = offer.product || offer.productFamily || offer.name;
  state.productFamily = offer.productFamily || inferProductFamily(state.product);
  state.model = offer.model;
  state.storage = offer.storage;
  state.variant = offer.variant || offer.model;
  state.color = offer.color;
  state.size = offer.size;
  const checkedAt = offer.offeredAt || new Date().toISOString();
  if (state.product) setFact(state, 'product', state.product, 'VERIFIED', 'BITO', checkedAt);
  if (state.productFamily) setFact(state, 'productFamily', state.productFamily, 'VERIFIED', 'BITO', checkedAt);
  if (state.model) setFact(state, 'model', state.model, 'VERIFIED', 'BITO', checkedAt);
  if (state.variant) setFact(state, 'variant', state.variant, 'VERIFIED', 'BITO', checkedAt);
  if (state.storage) setFact(state, 'storage', state.storage, 'VERIFIED', 'BITO', checkedAt);
  if (state.color) setFact(state, 'color', state.color, 'VERIFIED', 'BITO', checkedAt);
  if (state.size) setFact(state, 'size', state.size, 'VERIFIED', 'BITO', checkedAt);
  if (typeof offer.unitPrice === 'number') state.unitPrice = offer.unitPrice;
  delete state.offeredAlternative;
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

function cleanOptional(value: string | undefined): string | undefined {
  const clean = value?.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 500) : undefined;
}

function finitePositive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(value, 1_000_000) : undefined;
}

function clearProductSelectionContext(state: UniversalSalesState): void {
  for (const key of ['product', 'productFamily', 'variant', 'model', 'storage', 'color', 'size'] as const) delete state[key];
  delete state.quantity;
  delete state.budget;
  clearPriceFacts(state);
  if (state.factStatus) {
    const next = { ...state.factStatus };
    for (const key of ['product', 'productFamily', 'variant', 'model', 'storage', 'color', 'size'] as const) delete next[key];
    state.factStatus = next;
  }
}

function clearUnavailableSelectionFacts(state: UniversalSalesState): void {
  if (!state.factStatus) return;
  const next = { ...state.factStatus };
  for (const key of ['color', 'storage', 'size', 'variant', 'model'] as const) {
    const fact = next[key];
    if (!fact || fact.status !== 'UNAVAILABLE') continue;
    if (state[key] && canonicalComparable(String(state[key])) === canonicalComparable(fact.value)) delete state[key];
    delete next[key];
  }
  state.factStatus = next;
  clearPriceFacts(state);
}

function clearPriceFacts(state: UniversalSalesState): void {
  delete state.unitPrice;
  delete state.totalPrice;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clearDependentCatalogFacts(state: UniversalSalesState): void {
  for (const key of ['variant', 'model', 'storage', 'color', 'size'] as const) delete state[key];
  if (state.factStatus) {
    const next = { ...state.factStatus };
    for (const key of ['variant', 'model', 'storage', 'color', 'size'] as const) delete next[key];
    state.factStatus = next;
  }
}

function clearModelDependentFacts(state: UniversalSalesState): void {
  for (const key of ['storage', 'color', 'size'] as const) delete state[key];
  if (state.factStatus) {
    const next = { ...state.factStatus };
    for (const key of ['storage', 'color', 'size'] as const) delete next[key];
    state.factStatus = next;
  }
}

function getMostSpecificCatalogFact(state: UniversalSalesState): SalesFact | undefined {
  for (const key of ['color', 'storage', 'size', 'variant', 'model', 'product'] as const) {
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

function extractStorage(text: string): string | undefined {
  const match = text.match(/\b(\d{1,4})\s*(gb|tb)\b/iu);
  if (!match) return undefined;
  return `${Number(match[1])}${match[2].toUpperCase()}`;
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

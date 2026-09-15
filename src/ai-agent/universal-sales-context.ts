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

export type UniversalSalesState = {
  version: 1;
  product?: string;
  variant?: string;
  quantity?: number;
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
  [/\b(?:qora|black|chern(?:iy|aya)?|черн\p{L}*)\b/iu, 'qora'],
  [/\b(?:oq|white|bel(?:iy|aya)?|бел\p{L}*)\b/iu, 'oq'],
  [/\b(?:qizil|red|krasn\p{L}*|красн\p{L}*)\b/iu, 'qizil'],
  [/\b(?:kok|ko['‘’]?k|blue|sin\p{L}*|син\p{L}*)\b/iu, "ko‘k"],
  [/\b(?:yashil|green|zelen\p{L}*|зелен\p{L}*)\b/iu, 'yashil'],
  [/\b(?:kulrang|grey|gray|ser\p{L}*|сер\p{L}*)\b/iu, 'kulrang'],
];

/**
 * Shadow-normalization for intent understanding only. Never replace a product
 * name shown to the customer with this string. The goal is to understand
 * colloquial Uzbek, typos and mixed Russian/English without forcing customers
 * to type literary Uzbek.
 */
export function normalizeSalesTextForUnderstanding(input: string): string {
  let text = input
    .normalize('NFKC')
    .replace(/[‘’ʻʼ`]/g, "'")
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
    [/\b(?:a+y+fon|ayfon|aifon|aiphon|iphon)\b/giu, ' iphone '],
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
  for (const key of ['product', 'variant', 'color', 'size', 'budget', 'address', 'phone', 'timing', 'updatedAt'] as const) stringField(key, key === 'address' ? 500 : 300);
  if (typeof source.quantity === 'number' && Number.isFinite(source.quantity) && source.quantity > 0) state.quantity = Math.min(source.quantity, 1_000_000);
  if (source.fulfillment === 'DELIVERY' || source.fulfillment === 'PICKUP') state.fulfillment = source.fulfillment;
  if (['CASH', 'CARD', 'CLICK', 'PAYME', 'TRANSFER', 'OTHER'].includes(String(source.paymentMethod))) state.paymentMethod = source.paymentMethod as UniversalSalesState['paymentMethod'];
  if (['AVAILABILITY', 'PRICE', 'EXACT_STOCK', 'PRICE_OBJECTION', 'CHEAPER_ALTERNATIVE', 'ADVICE', 'VARIANT', 'QUANTITY', 'DELIVERY', 'PICKUP', 'ADDRESS', 'PHONE', 'PAYMENT', 'ORDER', 'GENERAL'].includes(String(source.lastIntent))) state.lastIntent = source.lastIntent as UniversalSalesIntent;
  if (typeof source.wantsExactStock === 'boolean') state.wantsExactStock = source.wantsExactStock;
  if (typeof source.requestedCheaper === 'boolean') state.requestedCheaper = source.requestedCheaper;
  if (typeof source.requestedAdvice === 'boolean') state.requestedAdvice = source.requestedAdvice;
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
  const availability = /\b(?:bormi|mavjud|available|есть\s+ли|в\s+налич)/iu.test(normalized);
  const price = /\b(?:narx|price|nech\s+pul|qancha\s+tur|qanchadan|цена|сколько\s+стоит)\b/iu.test(normalized);
  const delivery = /\b(?:delivery|yetkaz\p{L}*|kuryer|курьер)\b/iu.test(normalized);
  const pickup = /\b(?:pickup|olib\s+ket\p{L}*|borib\s+ol\p{L}*)\b/iu.test(normalized);
  const order = /\b(?:olaman|bering|buyurtma|zakaz|order|беру|заказ\p{L}*)\b/iu.test(normalized);

  const phone = rawText.match(/(?:\+?998[\s()-]*)?(?:\d[\s()-]*){9}/u)?.[0]?.replace(/[^+\d]/g, '');
  if (phone && phone.replace(/\D/g, '').length >= 9) state.phone = phone.slice(0, 30);

  const payment = detectPayment(normalized);
  if (payment) state.paymentMethod = payment;

  if (delivery) state.fulfillment = 'DELIVERY';
  if (pickup) state.fulfillment = 'PICKUP';

  const quantity = extractQuantity(normalized);
  if (quantity !== undefined) state.quantity = quantity;

  const volume = extractVolume(normalized);
  const color = detectColor(normalized);
  const size = extractSize(normalized);
  const compactModel = extractCompactModel(rawText);
  if (volume) state.variant = volume;
  if (color) state.color = color;
  if (size) state.size = size;
  if (compactModel && !volume && !color && !size && state.product && !rawText.toLocaleLowerCase().includes(state.product.toLocaleLowerCase())) state.variant = compactModel;

  const budget = extractBudget(normalized);
  if (budget) state.budget = budget;

  const timing = extractTiming(rawText, normalized);
  if (timing) state.timing = timing;

  const address = phone ? undefined : detectAddress(rawText, normalized, state.fulfillment === 'DELIVERY');
  if (address) state.address = address;

  const productCandidate = bitoInventorySearchTerm(normalized)?.trim();
  const followUpSignals = Boolean(volume || color || size || compactModel || quantity !== undefined || delivery || pickup || payment || priceObjection || cheaper || advice || phone || address);
  if (productCandidate && isUsefulProductCandidate(productCandidate, normalized)) {
    if (!state.product || availability || price || (!followUpSignals && productCandidate.split(/\s+/u).length > 1)) {
      state.product = cleanProductCandidate(productCandidate);
    } else if (state.product && /\d/.test(productCandidate) && productCandidate.split(/\s+/u).length <= 4) {
      state.variant = cleanProductCandidate(productCandidate);
    }
  }

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

export function salesStatePrompt(state: UniversalSalesState | undefined): string {
  const value = coerceUniversalSalesState(state);
  const known: string[] = [];
  if (value.product) known.push(`mahsulot=${value.product}`);
  if (value.variant) known.push(`variant=${value.variant}`);
  if (value.color) known.push(`rang=${value.color}`);
  if (value.size) known.push(`o'lcham=${value.size}`);
  if (value.quantity) known.push(`miqdor=${value.quantity}`);
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
  return known.length ? known.join('; ') : 'hali strukturali sotuv fakti yo‘q';
}

export function salesLookupQuery(state: UniversalSalesState | undefined, currentText: string): string {
  const value = coerceUniversalSalesState(state);
  return [
    value.product ? `product ${value.product}` : '',
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

export function likelyNeedsProductLookup(state: UniversalSalesState | undefined, currentText: string): boolean {
  const value = coerceUniversalSalesState(state);
  const normalized = normalizeSalesTextForUnderstanding(currentText);
  const explicitProductNeed = /\b(?:bormi|mavjud|narx|price|qoldiq|stock|variant|model|rang|hajm|litr|arzonroq|qimmat|maslahat|recommend|chegirma|qancha|nech\s+pul|olaman|bering|цена|налич|остат|дешев|дорог)\b/iu.test(normalized)
    || /\b\d+(?:[.,]\d+)?\s*(?:ta|dona|kg|g|litr|ml|шт)\b/iu.test(normalized);
  if (explicitProductNeed) return true;
  // A known product alone should not make address/phone/payment follow-ups load
  // inventory tools on every turn.
  if (!value.product) return false;
  return /\b(?:qora|oq|qizil|ko['‘’]?k|yashil|xl|xxl|xs|delivery|yetkaz)\b/iu.test(normalized);
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
  const match = text.match(/\b(\d+(?:[.,]\d+)?)\s*(ml|millilitr|l|ltr|litr|litrlik)\b/iu);
  if (!match) return undefined;
  const amount = match[1].replace(',', '.');
  return /ml/i.test(match[2]) ? `${amount} ml` : `${amount}L`;
}

function extractSize(text: string): string | undefined {
  const match = text.match(/\b(3xl|2xl|xxl|xl|xs|s|m|l)\b/iu);
  return match?.[1]?.toUpperCase();
}

function extractCompactModel(text: string): string | undefined {
  const cleaned = text.trim()
    .replace(/[?!.,]+$/u, '')
    .replace(/\b(?:kerak|kere|bormi|bor\s+mi|mavjudmi|mavjud|please|iltimos)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 2 || cleaned.length > 60) return undefined;
  if (!/\d/u.test(cleaned) || !/\p{L}/u.test(cleaned)) return undefined;
  const tokens = cleaned.match(/[\p{L}\p{N}+.-]+/gu) ?? [];
  if (tokens.length > 4) return undefined;
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
  const value = candidate.toLocaleLowerCase();
  if (/^(?:qora|oq|qizil|kok|ko'k|yashil|kulrang|arzonroq|delivery|pickup|click|payme|naqd|karta|manzil|telefon|qimmat)$/iu.test(value)) return false;
  if (/^(?:litrlik|litr|dona|variant|model|rang|hajm)$/iu.test(value)) return false;
  if (normalizeSalesTextForUnderstanding(candidate) === normalizeSalesTextForUnderstanding(normalized) && /^(?:qimmat|arzonroq|maslahat)/iu.test(normalized)) return false;
  return true;
}

function cleanProductCandidate(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

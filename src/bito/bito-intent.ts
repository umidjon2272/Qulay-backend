// Bito routing is intentionally multilingual and tolerant of Uzbek suffixes.
// We tokenize instead of relying on ASCII-style word boundaries so forms such
// as "omborda", "xodimlarni" and Cyrillic inflections are routed correctly.
const normalize = (text: string) => text.toLocaleLowerCase().replace(/[‘’ʻʼ`]/g, "'");
const tokens = (text: string) => normalize(text).match(/[\p{L}\p{N}']+/gu) ?? [];
const hasStem = (text: string, stems: string[]) => tokens(text).some(token => stems.some(stem => token === stem || token.startsWith(stem)));
const hasPhrase = (text: string, phrases: string[]) => phrases.some(phrase => normalize(text).includes(phrase));

export const explicitBitoIntent = (text: string) => hasStem(text, ['bito']);

export const documentIntent = (text: string) => hasStem(text, [
  'fayl', 'file', 'hujjat', 'document', 'pdf', 'docx', 'xlsx', 'excel', 'csv', 'papka', 'folder', 'drive',
  'файл', 'документ', 'папк',
]);

export const bitoWriteIntent = (text: string) => {
  const value = normalize(text);
  return hasPhrase(value, ['buyurtma qil', 'transfer qil', 'hisobdan chiqar', 'write off', 'sotuv qil', 'savdo qil', 'sotib yubor', 'qabul qil', 'bekor qil', "to'lov qil", 'tolov qil']) || hasStem(value, [
    'yarat', "qo'sh", 'qush', "o'zgart", 'ozgart', 'yangila', "o'chir", 'uchir', "ko'chir", 'kochirish',
    'yubor', "jo'nat", 'jonat', 'tasdiq', 'bekor', 'qabul', 'tola', "to'la",
    'create', 'update', 'delete', 'remove', 'reserve', 'send', 'refund', 'approve', 'reject', 'receive', 'confirm', 'cancel', 'pay',
    'созд', 'измен', 'удал', 'перемест', 'списать', 'отмен', 'отправ', 'подтверд', 'принять', 'оплат',
  ]);
};

const BUSINESS_STEMS = [
  'ombor', 'qoldiq', 'qoldi', 'qolmagan', 'qolgan', 'zaxira', 'stock', 'inventory', 'warehouse', 'sklad', 'остат', 'склад',
  'mahsulot', 'tovar', 'product', 'goods', 'katalog', 'catalog', 'kategoriya', 'category', 'narx', 'price', 'товар', 'цена',
  'savdo', 'sotuv', 'sotilgan', 'sale', 'sales', 'trade', 'pos', 'revenue', 'daromad', 'tushum', 'foyda', 'profit', 'margin', 'выруч', 'доход', 'прибыл',
  'mijoz', 'customer', 'client', 'lead', 'crm', 'клиент', 'лид', 'buyurtma', 'order', 'заказ',
  'supplier', 'xarid', 'purchase', 'закуп', 'постав', 'xodim', 'hodim', 'ishchi', 'employee', 'staff', 'worker', 'hr', 'smena', 'shift', 'attendance', 'davomat', 'tabel', 'maosh', 'oylik', 'salary', 'payroll', 'wage', 'сотруд', 'персонал', 'зарплат',
  'qarz', 'qarzdor', 'debitor', 'kreditor', 'debt', 'credit', 'kassa', 'cashbox', 'cashflow', 'tolov', "to'lov", 'payment', 'chiqim', 'nasiya', 'installment', 'долг', 'касс', 'платеж', 'рассроч',
  'hisobot', 'report', 'analytics', 'analitika', 'kpi', 'отчет', 'аналит', 'production', 'manufacturing', 'производ',
  'distrib', 'distribution', 'transfer', 'reviziya', 'revision', 'spisanie', 'перемещ', 'ревизи', 'списан',
  'marketing', 'source', 'manba', 'tag', 'ticket', 'qurilma', 'device', 'terminal', 'filial', 'branch', 'organization', 'tashkilot',
  'brend', 'brand', 'birlik', 'unit', 'measure', 'valyuta', 'currency', 'hisob', 'invoice', 'account', 'agent', 'marshrut', 'route',
  'soliq', 'tax', 'aksiya', 'promo', 'promotion', 'chegirma', 'discount',
];

/**
 * Business domains that should prefer a connected Bito account over Qulay's
 * personal files/finance. Explicit Bito always wins. Otherwise the vocabulary
 * is deliberately business-specific so normal personal assistant requests are
 * not hijacked.
 */
export function bitoBusinessIntent(text: string): boolean {
  const value = normalize(text);
  if (explicitBitoIntent(value)) return true;
  if (documentIntent(value)) return false;
  if (hasPhrase(value, ['yetkazib beruvchi', 'ishlab chiqarish', 'write off', 'hisobdan chiqarish'])) return true;
  return hasStem(value, BUSINESS_STEMS);
}

export function bitoInventoryIntent(text: string): boolean {
  const value = normalize(text);
  if (bitoWriteIntent(value) || (documentIntent(value) && !explicitBitoIntent(value))) return false;
  // Sales/profit questions that happen to mention a product belong to report
  // tools, not current-stock inventory.
  if (hasStem(value, ['savdo', 'sotuv', 'sotilgan', 'sale', 'sales', 'foyda', 'profit', 'revenue', 'trade', 'продаж', 'прибыл', 'выруч'])) return false;
  if (hasStem(value, ['ombor', 'qoldiq', 'qoldi', 'zaxira', 'stock', 'inventory', 'warehouse', 'sklad', 'остат', 'склад'])) return true;
  const product = hasStem(value, ['mahsulot', 'tovar', 'product', 'catalog', 'katalog', 'товар']);
  const availability = hasStem(value, ['bor', 'mavjud', 'qancha', 'nechta', 'necha', 'available', 'сколько', 'есть']);
  return product && availability;
}

/** Pure connection/status questions should use the static status tool rather
 * than forcing an arbitrary business report. */
export function bitoConnectionIntent(text: string): boolean {
  if (!explicitBitoIntent(text)) return false;
  return hasStem(text, ['ulan', 'connection', 'connected', 'status', 'holat', 'подключ', 'статус'])
    && !hasStem(text, BUSINESS_STEMS);
}

export const bitoFollowUpIntent = (text: string) => {
  const value = normalize(text).trim();
  if (!value) return false;
  const valueTokens = tokens(value);
  // Follow-ups are intentionally short/deictic. A long new request containing
  // words such as `qancha` must not inherit an unrelated previous Bito intent.
  if (valueTokens.length > 10) return false;
  if (/^\d+\s*(?:ta|tasini)?(?:\s+.*)?$/iu.test(value)) return true;
  return hasStem(value, ['hamma', 'barcha', "to'liq", 'toliq', 'qolgan', 'ularni', 'shuni', 'jami', 'all', 'rest', 'yana', 'davom', 'continue', 'qancha', 'nechta', "ko'rsat", 'korsat', 'chiqar', 'ayt']);
};

/**
 * Zero-stock rows are useful for explicit "all", "out of stock" and aggregate
 * inventory questions, but they make a normal "what is in stock?" response
 * noisy. Keep this decision deterministic before the model sees the data.
 */
export function bitoInventoryIncludeZero(text: string): boolean {
  const value = normalize(text);
  return hasStem(value, [
    'hamma', 'barcha', "to'liq", 'toliq', 'jami', 'pozitsiya', 'qolmagan', 'tugagan', 'nol', 'zero', 'outofstock',
    'all', 'total', 'все', 'всего', 'законч', 'нул',
  ]) || /^\s*0\b/u.test(value) || /\b0\s*(?:ta|dona|kg|шт)?\b/u.test(value);
}

/**
 * Extract a likely product-name fragment from a current-stock question so Bito
 * can use its native `search` filter. If the result is empty or ambiguous the
 * inventory service simply fetches the full verified list and filters locally.
 */
export function bitoInventorySearchTerm(text: string): string | undefined {
  const valueTokens = tokens(text).map(token => token.replace(/'/g, ''));
  if (!valueTokens.length) return undefined;

  const noiseStems = [
    'bito', 'ombor', 'qoldiq', 'qoldi', 'zaxira', 'stock', 'inventory', 'warehouse', 'sklad', 'ostat',
    'mahsulot', 'tovar', 'product', 'goods', 'katalog', 'catalog', 'qaysi', 'nima', 'nimalar',
    'qancha', 'nechta', 'necha', 'bor', 'mavjud', 'qolgan', 'qolmagan', 'tugagan', 'korsat',
    'chiqar', 'ayt', 'top', 'qidir', 'izla', 'menga', 'hamma', 'barcha', 'toliq', 'jami', 'dona',
    'kg', 'litr', 'litre', 'ta', 'available', 'show', 'list', 'find', 'how', 'many', 'есть', 'сколько',
    'покаж', 'найд', 'товар', 'остат', 'склад',
  ];
  const residual = valueTokens.filter(token => token.length > 1 && !/^\d+(?:[.,]\d+)?$/u.test(token) && token !== 'tasini' && !noiseStems.some(stem => token === stem || token.startsWith(stem)));
  if (!residual.length || residual.length > 6) return undefined;
  const term = residual.join(' ').trim();
  return term.length >= 2 ? term : undefined;
}

/** Whether an inventory request benefits from Bito's aggregate stock summary. */
export function bitoInventorySummaryIntent(text: string): boolean {
  const value = normalize(text);
  if (bitoInventorySearchTerm(text)) return false;
  return hasPhrase(value, [
    'nechta mahsulot', 'necha mahsulot', 'jami mahsulot', 'mahsulotlar soni', 'jami pozitsiya',
    'product count', 'total products', 'сколько товаров', 'всего товаров',
  ]) || (hasStem(value, ['pozitsiya']) && hasStem(value, ['nechta', 'necha', 'jami', 'qancha', 'total', 'count']));
}

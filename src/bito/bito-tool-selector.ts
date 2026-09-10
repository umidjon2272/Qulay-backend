import type { BitoMcpTool } from './bito-mcp.client';
import { bitoWriteIntent } from './bito-intent';
import { bitoToolSideEffect } from './bito-tool-policy';

const STOP_WORDS = new Set([
  'bito', 'bitoda', 'bitodan', 'bitoga', 'bitodagi', 'menga', 'qani', 'haqida', 'bilan', 'uchun', 'shu', 'shuni', 'ham',
  'nima', 'nimalar', 'qanday', 'qancha', 'nechta', 'necha', 'bor', 'yoq', 'yoqmi', 'ayt', 'korsat', 'chiqar', 'top',
  'the', 'a', 'an', 'in', 'on', 'of', 'for', 'show', 'tell', 'give', 'get', 'find', 'list', 'please',
  'yarat', "qosh", 'qush', 'yangila', 'ozgartir', 'ochir', 'uchir', 'create', 'add', 'update', 'delete', 'remove', 'change', 'edit',
  'в', 'на', 'по', 'из', 'для', 'мне', 'покажи', 'скажи', 'найди', 'сколько', 'есть',
]);

const DOMAIN_STEM_EXPANSIONS: Array<{ stems: string[]; terms: string[] }> = [
  { stems: ['xodim', 'hodim', 'ishchi', 'employee', 'staff', 'worker', 'сотруд', 'персонал'], terms: ['employee', 'staff', 'worker', 'hr'] },
  { stems: ['smena', 'shift', 'смен'], terms: ['shift', 'employee', 'hr'] },
  { stems: ['davomat', 'attendance', 'tabel', 'посещ', 'табел'], terms: ['attendance', 'employee', 'hr'] },
  { stems: ['maosh', 'oylik', 'salary', 'payroll', 'wage', 'зарплат', 'оклад'], terms: ['salary', 'payroll', 'wage', 'employee', 'hr'] },
  { stems: ['mijoz', 'customer', 'client', 'клиент'], terms: ['customer', 'client', 'crm'] },
  { stems: ['lead', 'lid', 'лид'], terms: ['lead', 'crm'] },
  { stems: ['supplier', 'постав'], terms: ['supplier', 'purchase', 'supply'] },
  { stems: ['xarid', 'purchase', 'закуп'], terms: ['purchase', 'supplier', 'supply'] },
  { stems: ['buyurtma', 'order', 'заказ'], terms: ['order'] },
  { stems: ['savdo', 'sotuv', 'sotilgan', 'sale', 'sales', 'trade', 'продаж'], terms: ['sale', 'sales', 'trade', 'revenue'] },
  { stems: ['foyda', 'profit', 'marja', 'margin', 'прибыл', 'маржа'], terms: ['profit', 'margin'] },
  { stems: ['daromad', 'tushum', 'revenue', 'income', 'выруч', 'доход'], terms: ['revenue', 'income', 'sale'] },
  { stems: ['xarajat', 'chiqim', 'expense', 'расход'], terms: ['expense', 'cashflow', 'cashbox', 'finance'] },
  { stems: ['qarz', 'qarzdor', 'debitor', 'kreditor', 'debt', 'долг'], terms: ['debt', 'customer'] },
  { stems: ['kassa', 'cashbox', 'cash', 'касс'], terms: ['cashbox', 'cashflow', 'payment'] },
  { stems: ['tolov', 'payment', 'оплат', 'платеж'], terms: ['payment', 'cashbox', 'sale'] },
  { stems: ['nasiya', 'installment', 'рассроч'], terms: ['installment', 'credit'] },
  { stems: ['ombor', 'sklad', 'warehouse', 'stock', 'qoldiq', 'qoldi', 'zaxira', 'остат', 'склад'], terms: ['warehouse', 'stock', 'inventory', 'balance', 'product'] },
  { stems: ['mahsulot', 'tovar', 'product', 'goods', 'товар'], terms: ['product', 'goods', 'catalog'] },
  { stems: ['narx', 'price', 'цен'], terms: ['price', 'product', 'goods'] },
  { stems: ['kategoriya', 'category', 'категор'], terms: ['category', 'product'] },
  { stems: ['production', 'manufacturing', 'производ'], terms: ['production'] },
  { stems: ['transfer', 'kochirish', 'перемещ'], terms: ['transfer', 'warehouse'] },
  { stems: ['spisanie', 'списан'], terms: ['write', 'off', 'warehouse'] },
  { stems: ['reviziya', 'revision', 'инвентариз', 'ревизи'], terms: ['revision', 'warehouse'] },
  { stems: ['hisobot', 'report', 'analytics', 'analitika', 'отчет', 'аналит'], terms: ['report', 'analytics'] },
  { stems: ['distrib', 'distribution', 'дистриб'], terms: ['distribution'] },
  { stems: ['marketing', 'маркетинг'], terms: ['marketing'] },
  { stems: ['topshiriq', 'task', 'задач'], terms: ['task'] },
  { stems: ['kpi', 'korsatkich', 'показател'], terms: ['kpi'] },
  { stems: ['filial', 'branch', 'organization', 'company', 'tashkilot', 'организац', 'филиал'], terms: ['organization', 'branch'] },
  { stems: ['qurilma', 'device', 'terminal', 'устройств', 'терминал'], terms: ['device', 'terminal'] },
  { stems: ['source', 'manba', 'источник'], terms: ['source'] },
  { stems: ['tag', 'teg', 'тег'], terms: ['tag'] },
  { stems: ['ticket', 'murojaat', 'тикет', 'обращен'], terms: ['ticket'] },
  { stems: ['holat', 'status', 'state', 'статус', 'состояни'], terms: ['state', 'status'] },
  { stems: ['sabab', 'reason', 'причин'], terms: ['reason'] },
  { stems: ['pipeline', 'voronka', 'воронк'], terms: ['pipeline', 'action'] },
  { stems: ['eksport', 'export', 'выгруз'], terms: ['export', 'records'] },
  { stems: ['sms', 'смс'], terms: ['sms', 'template'] },
  { stems: ['shablon', 'template', 'шаблон'], terms: ['template'] },
  { stems: ['sozlama', 'setting', 'settings', 'настрой'], terms: ['settings'] },
  { stems: ['forma', 'form', 'форма'], terms: ['form', 'lead'] },
  { stems: ['xabar', 'message', 'сообщен'], terms: ['message', 'settings'] },
  { stems: ['eslatma', 'reminder', 'напомин'], terms: ['reminder', 'settings'] },
  { stems: ['fayl', 'file', 'файл'], terms: ['file'] },
  { stems: ['brend', 'brand', 'бренд'], terms: ['brand'] },
  { stems: ['birlik', 'unit', 'measure', 'единиц'], terms: ['unit', 'measure'] },
  { stems: ['valyuta', 'currency', 'валют'], terms: ['currency'] },
  { stems: ['hisob', 'invoice', 'account', 'счет'], terms: ['invoice', 'account'] },
  { stems: ['agent', 'агент'], terms: ['agent', 'employee', 'distribution'] },
  { stems: ['marshrut', 'route', 'маршрут'], terms: ['route'] },
  { stems: ['soliq', 'tax', 'налог'], terms: ['tax'] },
  { stems: ['aksiya', 'promo', 'promotion', 'акци'], terms: ['promo', 'promotion'] },
  { stems: ['chegirma', 'discount', 'скидк'], terms: ['discount', 'price'] },
];

const DOMAIN_PHRASE_EXPANSIONS: Array<{ phrases: string[]; terms: string[] }> = [
  { phrases: ['yetkazib beruvchi', 'yetkazib beruv'], terms: ['supplier', 'purchase', 'supply'] },
  { phrases: ['ishlab chiqarish', 'ishlab chiqar'], terms: ['production'] },
  { phrases: ['hisobdan chiqar', 'write off'], terms: ['write', 'off', 'warehouse'] },
  { phrases: ['savdo nuqta', 'savdo nuqtasi'], terms: ['pos', 'sale'] },
];

const DOMAIN_EXPANSIONS: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /\b(?:xodim|hodim|xodimlar|hodimlar|employee|employees|staff|worker|workers|сотрудник|сотрудники|персонал)\b/iu, terms: ['employee', 'staff', 'worker', 'hr'] },
  { pattern: /\b(?:mijoz|mijozlar|customer|customers|client|clients|клиент|клиенты)\b/iu, terms: ['customer', 'client', 'crm'] },
  { pattern: /\b(?:lead|lid|lidlar|лид|лиды)\b/iu, terms: ['lead', 'crm'] },
  { pattern: /\b(?:yetkazib\s*beruvchi|yetkazib\s*beruvchilar|supplier|suppliers|поставщик|поставщики)\b/iu, terms: ['supplier', 'purchase', 'supply'] },
  { pattern: /\b(?:xarid|xaridlar|purchase|purchases|закупка|закупки)\b/iu, terms: ['purchase', 'supplier', 'supply'] },
  { pattern: /\b(?:buyurtma|buyurtmalar|order|orders|заказ|заказы)\b/iu, terms: ['order'] },
  { pattern: /\b(?:savdo|sotuv|sotilgan|sale|sales|trade|продажа|продажи)\b/iu, terms: ['sale', 'sales', 'trade', 'revenue'] },
  { pattern: /\b(?:foyda|profit|marja|margin|прибыль|маржа)\b/iu, terms: ['profit', 'margin'] },
  { pattern: /\b(?:daromad|revenue|income|выручка|доход)\b/iu, terms: ['revenue', 'income', 'sale'] },
  { pattern: /\b(?:xarajat|expense|expenses|расход|расходы)\b/iu, terms: ['expense', 'cashflow', 'cashbox', 'finance'] },
  { pattern: /\b(?:qarz|qarzdor|debt|debts|долг|долги)\b/iu, terms: ['debt', 'customer'] },
  { pattern: /\b(?:kassa|cashbox|cash|касса)\b/iu, terms: ['cashbox', 'cashflow', 'payment'] },
  { pattern: /\b(?:tolov|to'lov|payment|payments|оплата|платеж)\b/iu, terms: ['payment', 'cashbox', 'sale'] },
  { pattern: /\b(?:nasiya|installment|рассрочка)\b/iu, terms: ['installment', 'credit'] },
  { pattern: /\b(?:ombor|sklad|warehouse|stock|qoldiq|остаток|склад)\b/iu, terms: ['warehouse', 'stock', 'inventory', 'balance', 'product'] },
  { pattern: /\b(?:mahsulot|mahsulotlar|tovar|product|products|goods|товар|товары)\b/iu, terms: ['product', 'goods', 'catalog'] },
  { pattern: /\b(?:narx|price|prices|цена|цены)\b/iu, terms: ['price', 'product', 'goods'] },
  { pattern: /\b(?:kategoriya|category|categories|категория|категории)\b/iu, terms: ['category', 'product'] },
  { pattern: /\b(?:ishlab\s*chiqarish|production|manufacturing|производство)\b/iu, terms: ['production'] },
  { pattern: /\b(?:transfer|kochirish|ko'chirish|перемещение|transferlar)\b/iu, terms: ['transfer', 'warehouse'] },
  { pattern: /\b(?:spisanie|write\s*off|hisobdan\s*chiqar|списание)\b/iu, terms: ['write', 'off', 'warehouse'] },
  { pattern: /\b(?:reviziya|revision|inventory\s*count|инвентаризация|ревизия)\b/iu, terms: ['revision', 'warehouse'] },
  { pattern: /\b(?:hisobot|hisobotlar|report|reports|analytics|analitika|отчет|отчеты|аналитика)\b/iu, terms: ['report', 'analytics'] },
  { pattern: /\b(?:distrib|distribution|дистриб)\w*/iu, terms: ['distribution'] },
  { pattern: /\b(?:marketing|marketingi|маркетинг)\b/iu, terms: ['marketing'] },
  { pattern: /\b(?:topshiriq|task|tasks|задача|задачи)\b/iu, terms: ['task'] },
  { pattern: /\b(?:kpi|ko'rsatkich|korsatkich|показатель)\b/iu, terms: ['kpi'] },
  { pattern: /\b(?:filial|branch|organization|company|tashkilot|организация|филиал)\b/iu, terms: ['organization', 'branch'] },
  { pattern: /\b(?:qurilma|device|terminal|устройство|терминал)\b/iu, terms: ['device', 'terminal'] },
  { pattern: /\b(?:source|manba|источник)\b/iu, terms: ['source'] },
  { pattern: /\b(?:tag|teg|тег)\b/iu, terms: ['tag'] },
  { pattern: /\b(?:ticket|murojaat|тикет|обращение)\b/iu, terms: ['ticket'] },
  { pattern: /\b(?:holat|status|state|статус|состояние)\b/iu, terms: ['state', 'status'] },
  { pattern: /\b(?:sabab|reason|причина)\b/iu, terms: ['reason'] },
  { pattern: /\b(?:pipeline|voronka|воронка)\b/iu, terms: ['pipeline', 'action'] },
  { pattern: /\b(?:eksport|export|выгрузка)\b/iu, terms: ['export', 'records'] },
  { pattern: /\b(?:sms|смс)\b/iu, terms: ['sms', 'template'] },
  { pattern: /\b(?:shablon|template|шаблон)\b/iu, terms: ['template'] },
  { pattern: /\b(?:sozlama|sozlamalar|setting|settings|настройка|настройки)\b/iu, terms: ['settings'] },
  { pattern: /\b(?:forma|form|форма)\b/iu, terms: ['form', 'lead'] },
  { pattern: /\b(?:xabar|message|сообщение)\b/iu, terms: ['message', 'settings'] },
  { pattern: /\b(?:eslatma|reminder|напоминание)\b/iu, terms: ['reminder', 'settings'] },
  { pattern: /\b(?:fayl|file|файл)\b/iu, terms: ['file'] },
];

const READ_OPERATION = /(?:get|list|paging|search|find|read|query|fetch|report|summary|chart|top|analytics|statistics|health|count)/iu;
const WRITE_CREATE = /(?:yarat|qo'?sh|create|add|созд)/iu;
const WRITE_UPDATE = /(?:yangila|o'?zgartir|update|change|edit|set|измен)/iu;
const WRITE_DELETE = /(?:o'?chir|delete|remove|cancel|bekor|удал|отмен)/iu;
const WANT_TOP = /(?:eng\s+ko['’]?p|top|best|lider|leader|сам(?:ый|ые)|топ)/iu;
const WANT_SUMMARY = /(?:jami|umumiy|nechta|necha|qancha|summary|total|count|итого|сколько)/iu;
const WANT_LIST = /(?:ro['’]?yxat|hammasi|barchasi|to['’]?liq|ko['’]?rsat|korsat|chiqar|ayt|list|all|show|display|список|все|покаж)/iu;

export type BitoToolSelection = {
  tools: BitoMcpTool[];
  queryTerms: string[];
};

/**
 * Shortlists the live MCP registry for one user query. The goal is to keep all
 * Bito domains reachable without sending hundreds of unrelated tools to the
 * model. Selection uses only schema metadata; business values are never cached
 * or inspected here.
 */
export function selectRelevantBitoTools(tools: BitoMcpTool[], query: string, limit = 16): BitoToolSelection {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(normalizedQuery);
  const terms = new Set<string>();
  for (const token of queryTokens) if (!STOP_WORDS.has(token) && token.length > 1) terms.add(token);
  for (const expansion of DOMAIN_STEM_EXPANSIONS) {
    if (queryTokens.some(token => expansion.stems.some(stem => token === stem || token.startsWith(stem)))) expansion.terms.forEach(term => terms.add(term));
  }
  for (const expansion of DOMAIN_PHRASE_EXPANSIONS) {
    if (expansion.phrases.some(phrase => normalizedQuery.includes(phrase))) expansion.terms.forEach(term => terms.add(term));
  }
  for (const expansion of DOMAIN_EXPANSIONS) if (expansion.pattern.test(normalizedQuery)) expansion.terms.forEach(term => terms.add(term));

  // Keep selection and execution policy aligned. This also recognizes action
  // verbs such as transfer/send/refund/approve that are not plain CRUD words.
  const writeIntent = bitoWriteIntent(query);
  const wantsTop = WANT_TOP.test(normalizedQuery);
  const wantsSummary = WANT_SUMMARY.test(normalizedQuery);
  const wantsList = WANT_LIST.test(normalizedQuery);
  const hasExplicitId = queryTokens.some(token => /^(?:[a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9-]{27,})$/iu.test(token));

  const scored = tools.flatMap((tool) => {
    const sideEffect = bitoToolSideEffect(tool);
    // A read-only user question must never expose a write tool to the model.
    if (!writeIntent && sideEffect === 'WRITE') return [];

    const name = normalize(tool.name);
    const title = normalize(tool.title ?? '');
    const description = normalize(tool.description ?? '');
    if (!passesSpecificDomainGuard(normalizedQuery, [name, title, description].filter(Boolean).join(' '))) return [];
    let score = preferredToolScore(tool.name, normalizedQuery, { wantsTop, wantsSummary, wantsList });

    for (const term of terms) {
      if (textTokenMatch(name, term)) score += 18;
      if (textTokenMatch(title, term)) score += 7;
      if (textTokenMatch(description, term)) score += 3;
    }
    const semanticScore = score;
    // Do not pad a specific request with unrelated Bito tools. If nothing
    // matches at all we use the small safe fallback below; otherwise only
    // semantically related operations are exposed to the model.
    if (!writeIntent && terms.size > 0 && semanticScore < 6) return [];
    // Never surface arbitrary create/update/delete operations for an ambiguous
    // write like "Bito'da yarat". A write needs an entity/domain match.
    if (writeIntent && sideEffect === 'WRITE' && semanticScore <= 0) return [];
    if (writeIntent && sideEffect === 'READ' && terms.size > 0 && semanticScore <= 0) return [];

    // Native operation words help choose the right view inside one domain.
    if (wantsTop && /(?:^|\s)top(?:\s|$)/.test(name)) score += 26;
    if (wantsSummary && /summary|total|count|dashboard/.test(name)) score += 18;
    if (wantsList && /paging|list|get\s+all|search/.test(name)) score += 18;
    if (!wantsTop && /(?:^|\s)top(?:\s|$)/.test(name)) score -= 14;
    if (wantsList && !/paging|list|get\s+all|search/.test(name) && /summary|chart|dashboard/.test(name)) score -= 10;
    if (/get\s+by\s+id/.test(name)) {
      if (wantsList && !hasExplicitId) return [];
      score += hasExplicitId ? 12 : -14;
    }
    if (terms.size === 0 && !wantsList && !wantsSummary && /summary|dashboard/.test(name)) score += 3;

    if (writeIntent) {
      if (sideEffect === 'WRITE') score += 6;
      if (WRITE_CREATE.test(normalizedQuery) && /create|add|insert/.test(name)) score += 28;
      if (WRITE_UPDATE.test(normalizedQuery) && /update|set|change|edit/.test(name)) score += 28;
      if (WRITE_DELETE.test(normalizedQuery) && /delete|remove|cancel/.test(name)) score += 28;
      // Related reads are useful to resolve IDs before a write.
      if (sideEffect === 'READ' && READ_OPERATION.test(name)) score += 2;
    } else if (sideEffect === 'READ') {
      score += 4;
    }

    const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema!.required!.filter((x): x is string => typeof x === 'string') : [];
    if (required.length === 0) score += 4;
    else if (!writeIntent && required.length > 2) score -= Math.min(12, required.length * 2);

    // Generic dashboard/report tools are useful for broad explicit Bito asks.
    if (terms.size === 0 && /report\s+dashboard\s+summary|dashboard\s+summary/.test(name)) score += 8;

    const minimumScore = terms.size > 0 ? 6 : 1;
    return score >= minimumScore ? [{ tool, score, sideEffect }] : [];
  });

  scored.sort((a, b) => b.score - a.score || operationTieBreak(a.tool, b.tool, { wantsTop, wantsSummary, wantsList }) || a.tool.name.localeCompare(b.tool.name));

  const selected: BitoMcpTool[] = [];
  const seen = new Set<string>();
  for (const item of scored) {
    if (seen.has(item.tool.name)) continue;
    seen.add(item.tool.name);
    selected.push(item.tool);
    if (selected.length >= Math.max(1, limit)) break;
  }

  // When the query explicitly targets Bito but contains vocabulary not present
  // in our lexicon, still expose a small safe READ overview rather than the
  // entire MCP registry or unrelated write operations.
  if (!selected.length && terms.size === 0) {
    const fallback = tools
      .filter(tool => bitoToolSideEffect(tool) === 'READ')
      .sort((a, b) => fallbackScore(b) - fallbackScore(a) || a.name.localeCompare(b.name))
      .slice(0, Math.min(limit, 8));
    selected.push(...fallback);
  }

  return { tools: selected, queryTerms: [...terms] };
}

function passesSpecificDomainGuard(query: string, toolText: string): boolean {
  // For strongly-scoped ERP nouns, keep the shortlist inside that domain.
  // This prevents generic words such as `settings`, `product` or `customer`
  // from pulling in adjacent reports. Multi-domain analytical asks still work
  // because the more specific noun (employee/customer/product) wins first.
  const guarded: Array<[RegExp, RegExp]> = [
    [/(?:qarz|qarzdor|debitor|kreditor|debt|долг)/iu, /\b(?:debt|credit|receivable|payable)\b/iu],
    [/(?:nasiya|installment|рассроч)/iu, /\b(?:installment|credit)\b/iu],
    [/(?:xodim|hodim|ishchi|employee|staff|worker|smena|shift|davomat|attendance|tabel|maosh|oylik|salary|payroll|wage|сотруд|персонал|смен|посещ|табел|зарплат|оклад)/iu, /\b(?:employee|staff|worker|personnel|hr|shift|attendance|salary|payroll|wage)\b/iu],
    [/(?:yetkazib\s*beruv|supplier|постав)/iu, /\b(?:supplier|supply)\b/iu],
    [/(?:xarid|purchase|закуп)/iu, /\b(?:purchase|procurement|supply)\b/iu],
    [/(?:mijoz|customer|client|клиент)/iu, /\b(?:customer|client|crm|lead)\b/iu],
    [/(?:ishlab\s*chiqar|production|manufacturing|производ)/iu, /\b(?:production|manufacturing)\b/iu],
    [/(?:transfer|ko['’]?chir|перемещ)/iu, /\btransfer\b/iu],
    [/(?:reviziya|revision|инвентариз|ревизи)/iu, /\brevision\b/iu],
    [/(?:qurilma|device|устройств)/iu, /\bdevice\b/iu],
    [/(?:kpi|ko['’]?rsatkich|korsatkich|показател)/iu, /\bkpi\b/iu],
    [/(?:sms|смс)/iu, /\bsms\b/iu],
    [/(?:eksport|export|выгруз)/iu, /\bexport\b/iu],
    [/(?:pipeline|voronka|воронк)/iu, /\bpipeline\b/iu],
    [/(?:sabab|reason|причин)/iu, /\breason\b/iu],
    [/(?:tag|teg|тег)/iu, /\btag\b/iu],
    [/(?:source|manba|источник)/iu, /\bsource\b/iu],
    [/(?:marketing|маркетинг)/iu, /\bmarketing\b/iu],
  ];
  for (const [queryPattern, toolPattern] of guarded) {
    if (queryPattern.test(query)) return toolPattern.test(toolText);
  }

  if (/(?:mahsulot|tovar|product|goods|товар)/iu.test(query)) {
    if (/\bproduction\b/iu.test(toolText) && !/(?:ishlab\s*chiqar|production|manufacturing|производ)/iu.test(query)) return false;
    if (!/\b(?:product|goods|item|catalog)\b/iu.test(toolText)) return false;
    // A product-sales question must not receive current-stock/ABC/production
    // tools merely because they also mention `product`.
    if (/(?:savdo|sotuv|sotilgan|sale|sales|trade|eng\s+ko['’]?p|top|продаж)/iu.test(query)) {
      return /\b(?:sale|sales|trade|selling|sold|top)\b/iu.test(toolText);
    }
    return true;
  }
  if (/(?:savdo|sotuv|sotilgan|sale|sales|trade|продаж)/iu.test(query)) {
    return /\b(?:sale|sales|trade|revenue|selling|sold)\b/iu.test(toolText);
  }
  if (/(?:foyda|profit|marja|margin|прибыл|маржа)/iu.test(query)) {
    return /\b(?:profit|margin)\b/iu.test(toolText) || /report dashboard summary$/iu.test(toolText);
  }
  return true;
}

function operationTieBreak(a: BitoMcpTool, b: BitoMcpTool, flags: { wantsTop: boolean; wantsSummary: boolean; wantsList: boolean }): number {
  const score = (tool: BitoMcpTool) => {
    const name = normalize(tool.name);
    let value = 0;
    if (flags.wantsTop && /\btop\b/.test(name)) value += 3;
    if (flags.wantsSummary && /summary|total|count/.test(name)) value += 3;
    if (flags.wantsList && /paging|list|search/.test(name)) value += 3;
    if (/get\s+by\s+id/.test(name)) value -= 2;
    return value;
  };
  return score(b) - score(a);
}

function fallbackScore(tool: BitoMcpTool): number {
  const name = normalize(tool.name);
  let score = 0;
  if (/report\s+dashboard\s+summary/.test(name)) score += 20;
  if (/summary/.test(name)) score += 8;
  if (/get\s+paging|list|get\s+all/.test(name)) score += 5;
  if (/settings|tag|file|device/.test(name)) score -= 5;
  return score;
}

function textTokenMatch(text: string, term: string): boolean {
  if (!term) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.includes(term)) return true;
  // Allow normal word-family matching for meaningful domain words, but never
  // substring-match short tokens such as `hr` inside unrelated words like
  // `threshold`. This was a real source of cross-domain tool pollution.
  return term.length >= 5 && words.some(word => word.length >= 5 && word.startsWith(term));
}

function preferredToolScore(name: string, query: string, flags: { wantsTop: boolean; wantsSummary: boolean; wantsList: boolean }): number {
  const normalizedName = name.toLocaleLowerCase();
  let score = 0;

  const listPreferred = (pattern: RegExp, amount = 42) => {
    if (flags.wantsList && pattern.test(normalizedName)) score += amount;
  };
  const summaryPreferred = (pattern: RegExp, amount = 44) => {
    if (flags.wantsSummary && pattern.test(normalizedName)) score += amount;
  };
  const topPreferred = (pattern: RegExp, amount = 48) => {
    if (flags.wantsTop && pattern.test(normalizedName)) score += amount;
  };

  if (/(?:xodim|hodim|employee|staff|сотруд|персонал)/iu.test(query)) {
    listPreferred(/(?:employee|staff).*?(?:paging|list|get_all)/, 52);
    topPreferred(/employee.*top|pos_employee_top/, 55);
  }
  if (/(?:mijoz|customer|client|клиент)/iu.test(query)) {
    listPreferred(/customer.*?(?:paging|list|get_all)/, 48);
    summaryPreferred(/customer.*summary|customers_health_score_summary/, 38);
  }
  if (/(?:yetkazib\s*beruv|supplier|постав)/iu.test(query)) listPreferred(/supplier.*?(?:paging|list|get_all)/, 50);
  if (/(?:xarid|purchase|закуп)/iu.test(query)) listPreferred(/purchase.*?(?:paging|list|get_all)/, 48);
  if (/(?:buyurtma|order|заказ)/iu.test(query)) {
    listPreferred(/order.*?(?:paging|list|get_all)/, 48);
    summaryPreferred(/report_order_dashboard_summary/, 48);
    topPreferred(/report_order_dashboard_top/, 52);
  }
  if (/(?:savdo|sotuv|sale|sales|продаж)/iu.test(query)) {
    summaryPreferred(/report_pos_sale_summary$/, 58);
    topPreferred(/report_pos_product_top|report_dashboard_top/, 42);
  }
  if (/(?:foyda|profit|marja|margin|прибыл|маржа)/iu.test(query)) {
    if (/report_dashboard_summary$/.test(normalizedName)) score += 42;
    if (/profit|margin/.test(normalizedName)) score += 30;
  }
  if (/(?:daromad|tushum|revenue|income|выруч|доход)/iu.test(query) && /report_pos_summary_income_chart/.test(normalizedName)) score += 48;
  if (/(?:xarajat|chiqim|expense|расход)/iu.test(query) && /report_pos_summary_expense_chart|report_pos_cashbox_income_expense/.test(normalizedName)) score += 48;
  if (/(?:qarz|debt|долг)/iu.test(query)) {
    listPreferred(/(?:debt).*paging/, 56);
    summaryPreferred(/(?:debt).*summary/, 58);
  }
  if (/(?:nasiya|installment|рассроч)/iu.test(query)) {
    listPreferred(/installment.*paging/, 46);
    summaryPreferred(/installment.*summary/, 48);
  }
  if (/(?:transfer|ko['’]?chir|перемещ)/iu.test(query)) listPreferred(/transfer.*paging/, 46);
  if (/(?:reviziya|revision|ревизи|инвентариз)/iu.test(query)) listPreferred(/revision.*paging/, 46);
  if (/(?:qurilma|device|terminal|устройств|терминал)/iu.test(query)) listPreferred(/device.*paging/, 46);
  if (/(?:kpi|ko['’]?rsatkich|показател)/iu.test(query)) listPreferred(/kpi.*paging/, 46);

  return score;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase()
    .replace(/[‘’ʻʼ`]/g, "'")
    .replace(/[_./:\\-]+/g, ' ')
    .replace(/[^\p{L}\p{N}'\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return value.replace(/'/g, '').split(/\s+/).filter(Boolean);
}

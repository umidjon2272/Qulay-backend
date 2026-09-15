export type BusinessSalesProfilePatch = {
  storeAddress?: string;
  businessHours?: string;
  publicPhone?: string;
  deliveryEnabled?: boolean;
  deliveryAreas?: string[];
  deliveryPolicy?: string;
  pickupEnabled?: boolean;
  paymentMethods?: string[];
  minimumOrderNote?: string;
  wholesalePolicy?: string;
  discountPolicy?: string;
};

const MAX_TEXT = 500;
const clean = (value: string | undefined, max = MAX_TEXT) => value?.replace(/\s+/g, ' ').trim().slice(0, max) || undefined;

export function extractBusinessSalesProfilePatch(rawText: string): BusinessSalesProfilePatch {
  const text = rawText.normalize('NFKC').replace(/[‘’ʻʼ`]/g, "'").trim();
  const lower = text.toLocaleLowerCase();
  const patch: BusinessSalesProfilePatch = {};
  // Learning is intentionally statement-only. A customer/owner question such
  // as “Do‘kon manzilimiz qayerda edi?” must never overwrite a saved fact.
  if (/\?\s*$/u.test(text) || /\b(?:qayerda|qanaqa|qanday|nima|qancha|nechchi)\b.{0,40}\?*\s*$/iu.test(lower)) return patch;

  const address = text.match(/(?:do['’]?kon(?:imiz|ning)?\s+manzil(?:imiz|i)?|manzilimiz)\s*(?:[:=-]|bu)?\s*(.+)$/iu)?.[1];
  if (address && address.length >= 5) patch.storeAddress = clean(address, 700);

  const hours = text.match(/(?:ish\s+vaqt(?:imiz|i)?|ishlaymiz)\s*(?:[:=-]|bu)?\s*(.+)$/iu)?.[1];
  if (hours && /\d/u.test(hours)) patch.businessHours = clean(hours, 300);

  const phone = text.match(/(?:telefon(?:imiz)?|raqam(?:imiz)?)\s*(?:[:=-]|bu)?\s*((?:\+?998[\s()-]*)?(?:\d[\s()-]*){9})/iu)?.[1];
  if (phone) patch.publicPhone = phone.replace(/[^+\d]/g, '').slice(0, 30);

  if (/(?:yetkazmaymiz|dostavka\s+yo['’]?q|delivery\s+yo['’]?q)/iu.test(lower)) {
    patch.deliveryEnabled = false;
  } else if (/(?:yetkaz(?:ib)?\s+beramiz|yetkazamiz|dostavka|delivery)/iu.test(lower)) {
    patch.deliveryEnabled = true;
    patch.deliveryPolicy = clean(text, 700);
    const area = text.match(/(.{2,120}?)\s+(?:bo['’]?ylab|ichida)\s+(?:yetkaz(?:ib)?\s+beramiz|yetkazamiz|dostavka|delivery)/iu)?.[1];
    if (area) patch.deliveryAreas = [clean(area, 120)!];
  }

  if (/(?:olib\s+ket(?:ish)?|pickup|samovyvoz|самовывоз)\s+(?:bor|mumkin|qilsa\s+bo['’]?ladi)/iu.test(lower)) patch.pickupEnabled = true;
  if (/(?:olib\s+ket(?:ish)?|pickup|samovyvoz|самовывоз)\s+(?:yo['’]?q|mumkin\s+emas)/iu.test(lower)) patch.pickupEnabled = false;

  const paymentSignal = /(?:qabul\s+qilamiz|to['’]?lov|oplata|оплат)/iu.test(lower);
  if (paymentSignal) {
    const methods: string[] = [];
    if (/\bnaqd\b|\bcash\b|налич/iu.test(lower)) methods.push('CASH');
    if (/\bkarta\b|\bcard\b|\bterminal\b|карта/iu.test(lower)) methods.push('CARD');
    if (/\bclick\b/iu.test(lower)) methods.push('CLICK');
    if (/\bpayme\b/iu.test(lower)) methods.push('PAYME');
    if (/\b(?:o['’]?tkazma|perevod|transfer)\b|перевод/iu.test(lower)) methods.push('TRANSFER');
    if (methods.length) patch.paymentMethods = [...new Set(methods)];
  }

  if (/(?:minimum|minimal|eng\s+kam)\s+(?:buyurtma|zakaz|order)/iu.test(lower)) patch.minimumOrderNote = clean(text, 500);
  if (/(?:ulgurji|optom|оптом|wholesale)/iu.test(lower) && /(?:narx|ta|dona|dan|threshold|chegara)/iu.test(lower)) patch.wholesalePolicy = clean(text, 700);
  if (/(?:chegirma|discount|скидк)/iu.test(lower) && /(?:ber|qil|mumkin|foiz|%|dan|policy|qoida)/iu.test(lower)) patch.discountPolicy = clean(text, 700);

  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as BusinessSalesProfilePatch;
}

export function businessSalesProfilePrompt(profile: unknown): string {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return 'Hali biznesning customer-facing profili saqlanmagan.';
  const value = profile as Record<string, unknown>;
  const facts: string[] = [];
  const push = (label: string, item: unknown) => {
    if (typeof item === 'string' && item.trim()) facts.push(`${label}=${item.trim().slice(0, 700)}`);
  };
  push('do‘kon_manzili', value.storeAddress);
  push('ish_vaqti', value.businessHours);
  push('telefon', value.publicPhone);
  if (typeof value.deliveryEnabled === 'boolean') facts.push(`delivery=${value.deliveryEnabled ? 'bor' : 'yo‘q'}`);
  if (Array.isArray(value.deliveryAreas) && value.deliveryAreas.length) facts.push(`delivery_hududlari=${value.deliveryAreas.filter(item => typeof item === 'string').slice(0, 20).join(', ')}`);
  push('delivery_qoidasi', value.deliveryPolicy);
  if (typeof value.pickupEnabled === 'boolean') facts.push(`pickup=${value.pickupEnabled ? 'bor' : 'yo‘q'}`);
  if (Array.isArray(value.paymentMethods) && value.paymentMethods.length) facts.push(`to‘lov_usullari=${value.paymentMethods.filter(item => typeof item === 'string').slice(0, 20).join(', ')}`);
  push('minimum_buyurtma', value.minimumOrderNote);
  push('ulgurji_qoida', value.wholesalePolicy);
  push('chegirma_qoida', value.discountPolicy);
  return facts.length ? facts.join('; ') : 'Hali biznesning customer-facing profili saqlanmagan.';
}

export type BusinessSalesProfilePatch = {
  storeAddress?: string;
  businessHours?: string;
  publicPhone?: string;
  deliveryEnabled?: boolean;
  deliveryAreas?: string[];
  deliveryPolicy?: string;
  pickupEnabled?: boolean;
  paymentMethods?: string[];
  cashPaymentNote?: string;
  cardPaymentNote?: string;
  clickPaymentNote?: string;
  paymePaymentNote?: string;
  transferPaymentNote?: string;
  minimumOrderNote?: string;
  wholesalePolicy?: string;
  discountPolicy?: string;
};

const MAX_TEXT = 700;
const clean = (value: string | undefined, max = MAX_TEXT) => value?.replace(/\s+/g, ' ').trim().slice(0, max) || undefined;
const QUESTION_LIKE = /\?\s*$|\b(?:qayerda|qanaqa|qanday|nima|qancha|nechchi|bormi|qaysi)\b.{0,50}\?*\s*$/iu;
const SECRET_PAYMENT_DATA = /\b(?:cvv|cvc|pin(?:\s*kod)?|otp|sms\s*kod|tasdiqlash\s*kod|parol|password|secret|token)\b/iu;

/**
 * Extract owner-stated customer-facing sales facts from the normal QULAY AI
 * chat. This is intentionally conservative: questions never overwrite saved
 * facts, and secret payment authentication data is never persisted. A public
 * business card/account number can be stored only when the owner explicitly
 * presents it as a customer-facing payment instruction.
 */
export function extractBusinessSalesProfilePatch(rawText: string): BusinessSalesProfilePatch {
  const text = rawText.normalize('NFKC').replace(/[‘’ʻʼ`]/g, "'").trim();
  const lower = text.toLocaleLowerCase();
  const patch: BusinessSalesProfilePatch = {};
  if (!text || QUESTION_LIKE.test(text)) return patch;

  const address = text.match(/^(?:bizning\s+)?(?:do['’]?kon(?:imiz|ning)?\s+)?manzil(?:imiz|i)?\b\s*(?:[:=-]|bu)?\s+(.+)$/iu)?.[1];
  if (address && address.length >= 5 && !/^(?:ayt|ayting|ber|yubor|ko['’]?rsat|eslab)\b/iu.test(address.trim())) {
    patch.storeAddress = clean(address, 900);
  }

  const hours = text.match(/(?:ish\s+vaqt(?:imiz|i)?|ishlaymiz)\s*(?:[:=-]|bu)?\s*(.+)$/iu)?.[1];
  if (hours && /\d/u.test(hours)) patch.businessHours = clean(hours, 300);

  // A card/account number must never be mistaken for the shop phone. Require
  // explicit phone context, or a clearly phone-shaped +998 number after an
  // owner/business “our number” statement.
  const explicitPhone = text.match(/(?:telefon(?:\s+raqam)?(?:imiz|i)?|tel(?:efon)?\s*[:=-])\s*(?:[:=-]|bu)?\s*((?:\+?998[\s()-]*)?(?:\d[\s()-]*){9})/iu)?.[1];
  const ownerPhone = !explicitPhone
    ? text.match(/(?:bizning|do['’]?kon(?:imiz|ning)?)\s+raqam(?:imiz|i)?\s*(?:[:=-]|bu)?\s*(\+?998[\s()-]*(?:\d[\s()-]*){9})/iu)?.[1]
    : undefined;
  const phone = explicitPhone || ownerPhone;
  if (phone) patch.publicPhone = phone.replace(/[^+\d]/g, '').slice(0, 30);

  if (/(?:yetkazmaymiz|dostavka\s+yo['’]?q|delivery\s+yo['’]?q)/iu.test(lower)) {
    patch.deliveryEnabled = false;
  } else if (/(?:yetkaz(?:ib)?\s+beramiz|yetkazamiz|dostavka\s+(?:bor|qilamiz|mavjud)|delivery\s+(?:bor|qilamiz|mavjud)|yetkazib\s+berish\s+(?:bor|mavjud))/iu.test(lower)) {
    patch.deliveryEnabled = true;
    patch.deliveryPolicy = clean(text, 900);
    const area = text.match(/(.{2,140}?)\s+(?:bo['’]?ylab|ichida)\s+(?:yetkaz(?:ib)?\s+beramiz|yetkazamiz|dostavka\s+(?:qilamiz|bor)|delivery\s+(?:qilamiz|bor))/iu)?.[1];
    if (area) patch.deliveryAreas = [clean(area, 140)!];
  }

  if (/(?:olib\s+ket(?:ish)?|pickup|samovyvoz|самовывоз)\s+(?:bor|mumkin|qilsa\s+bo['’]?ladi)/iu.test(lower)) patch.pickupEnabled = true;
  if (/(?:olib\s+ket(?:ish)?|pickup|samovyvoz|самовывоз)\s+(?:yo['’]?q|mumkin\s+emas)/iu.test(lower)) patch.pickupEnabled = false;

  // Payment methods are business facts only when the owner states acceptance
  // or provides a customer-public payment instruction; merely mentioning Click
  // in a hypothetical/playbook question must not rewrite the business profile.
  const declaredPaymentAcceptance = /(?:qabul\s+qilamiz|to['’]?lov(?:lar|ni)?\s+(?:qabul|mumkin)|(?:bizda|bizda ham)\s+.*(?:click|payme|karta|naqd)|(?:click|payme|karta|naqd|transfer)\s+(?:bor|qabul\s+qilinadi))/iu.test(lower);

  // Payment instructions are meant to be shared with customers. Never persist
  // PIN/CVV/OTP/password/token data even if it appears in the same message.
  const hasShareablePaymentIdentifier = /(?:\d[\s-]*){6,}|\+?998[\s()-]*(?:\d[\s()-]*){9}/u.test(text);
  const explicitPaymentInstruction = /(?:mijoz|klient|customer|to['’]?lov|to['’]?lasa|qilsa|uchun|rekvizit|karta\s+raqam|hisob\s+raqam|yubor|tashla|ber)/iu.test(lower);
  if (declaredPaymentAcceptance || (!SECRET_PAYMENT_DATA.test(lower) && hasShareablePaymentIdentifier && explicitPaymentInstruction)) {
    const methods: string[] = [];
    if (/\bnaqd\b|\bcash\b|налич/iu.test(lower)) methods.push('CASH');
    if (/\bkarta\b|\bcard\b|\bterminal\b|карта/iu.test(lower)) methods.push('CARD');
    if (/\bclick\b/iu.test(lower)) methods.push('CLICK');
    if (/\bpayme\b/iu.test(lower)) methods.push('PAYME');
    if (/\b(?:o['’]?tkazma|perevod|transfer)\b|перевод/iu.test(lower)) methods.push('TRANSFER');
    if (methods.length) patch.paymentMethods = [...new Set(methods)];
  }

  if (!SECRET_PAYMENT_DATA.test(lower) && hasShareablePaymentIdentifier && explicitPaymentInstruction) {
    const note = clean(text, 900)!;
    if (/\bclick\b/iu.test(lower)) patch.clickPaymentNote = note;
    if (/\bpayme\b/iu.test(lower)) patch.paymePaymentNote = note;
    if (/\b(?:karta|card|terminal)\b|карта/iu.test(lower)) patch.cardPaymentNote = note;
    if (/\b(?:o['’]?tkazma|perevod|transfer|bank)\b|перевод/iu.test(lower)) patch.transferPaymentNote = note;
    if (/\bnaqd\b|\bcash\b|налич/iu.test(lower)) patch.cashPaymentNote = note;
  }

  if (/(?:minimum|minimal|eng\s+kam)\s+(?:buyurtma|zakaz|order)/iu.test(lower)) patch.minimumOrderNote = clean(text, 600);
  if (/(?:ulgurji|optom|оптом|wholesale)/iu.test(lower) && /(?:narx|ta|dona|dan|threshold|chegara)/iu.test(lower)) patch.wholesalePolicy = clean(text, 900);
  if (/(?:chegirma|discount|скидк)/iu.test(lower) && /(?:ber|qil|mumkin|foiz|%|dan|policy|qoida)/iu.test(lower)) patch.discountPolicy = clean(text, 900);

  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as BusinessSalesProfilePatch;
}

export function businessSalesProfilePrompt(profile: unknown): string {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return 'Hali biznesning customer-facing profili saqlanmagan.';
  const value = profile as Record<string, unknown>;
  const facts: string[] = [];
  const push = (label: string, item: unknown, max = 900) => {
    if (typeof item === 'string' && item.trim()) facts.push(`${label}=${item.trim().slice(0, max)}`);
  };
  push('do‘kon_manzili', value.storeAddress);
  push('ish_vaqti', value.businessHours, 300);
  push('telefon', value.publicPhone, 50);
  if (typeof value.deliveryEnabled === 'boolean') facts.push(`delivery=${value.deliveryEnabled ? 'bor' : 'yo‘q'}`);
  if (Array.isArray(value.deliveryAreas) && value.deliveryAreas.length) facts.push(`delivery_hududlari=${value.deliveryAreas.filter(item => typeof item === 'string').slice(0, 20).join(', ')}`);
  push('delivery_qoidasi', value.deliveryPolicy);
  if (typeof value.pickupEnabled === 'boolean') facts.push(`pickup=${value.pickupEnabled ? 'bor' : 'yo‘q'}`);
  if (Array.isArray(value.paymentMethods) && value.paymentMethods.length) facts.push(`to‘lov_usullari=${value.paymentMethods.filter(item => typeof item === 'string').slice(0, 20).join(', ')}`);
  push('naqd_to‘lov_yo‘riqnomasi', value.cashPaymentNote);
  push('karta_to‘lov_yo‘riqnomasi', value.cardPaymentNote);
  push('click_to‘lov_yo‘riqnomasi', value.clickPaymentNote);
  push('payme_to‘lov_yo‘riqnomasi', value.paymePaymentNote);
  push('transfer_to‘lov_yo‘riqnomasi', value.transferPaymentNote);
  push('minimum_buyurtma', value.minimumOrderNote, 600);
  push('ulgurji_qoida', value.wholesalePolicy);
  push('chegirma_qoida', value.discountPolicy);
  return facts.length ? facts.join('; ') : 'Hali biznesning customer-facing profili saqlanmagan.';
}

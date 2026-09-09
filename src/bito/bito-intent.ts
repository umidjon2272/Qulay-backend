// Uzbek suffixes and apostrophe variants must survive intent routing.
const normalize = (text: string) => text.toLocaleLowerCase().replace(/[‘’ʻʼ`]/g, "'");
export const explicitBitoIntent = (text: string) => /(?<!\p{L})bito(?:'(?:da|dan|ga|dagi)|da|dan|ga|dagi)?(?!\p{L})/iu.test(normalize(text));
export const documentIntent = (text: string) => /(?<!\p{L})(?:fayl|file|hujjat|document|pdf|docx|xlsx|excel|csv|papka|folder|drive|файл|документ)/iu.test(text);
export const bitoWriteIntent = (text: string) => /(?<!\p{L})(?:yarat|qo'?sh|o'?zgartir|yangila|o'?chir|ko'?chir|buyurtma qil|sotish|transfer|adjust|create|update|delete|remove|reserve|созд|измен|удал|перемест)/iu.test(normalize(text));
export function bitoBusinessIntent(text: string): boolean {
  if (explicitBitoIntent(text)) return true;
  if (documentIntent(text)) return false;
  return /(?<!\p{L})(?:ombor|qoldi[qg]|qoldi|qolmagan|qolgan|mahsulot|tovar|stock|inventory|warehouse|filial|savdo|sotuv|sotilgan|sales|foyda|profit|revenue|mijoz|customer|buyurtma|order|katalog|catalog|narx|price|остат|склад|товар|продаж|прибыл)/iu.test(normalize(text));
}
export function bitoInventoryIntent(text: string): boolean {
  if (bitoWriteIntent(text) || (documentIntent(text) && !explicitBitoIntent(text))) return false;
  // Sales rankings also mention products, but require sales rather than stock.
  if (/(?<!\p{L})(?:savdo|sotuv|sotilgan|sales|foyda|profit|продаж|прибыл)/iu.test(text)) return false;
  return /(?<!\p{L})(?:ombor|qoldi[qg]|qoldi|qolmagan|qolgan|stock|inventory|warehouse|остат|склад)/iu.test(text)
    || /(?<!\p{L})(?:mahsulot|tovar|product|katalog|catalog)/iu.test(text) && /(?:bor|mavjud|qancha|nechta|necha|available|сколько)/iu.test(text);
}
export const bitoFollowUpIntent = (text: string) => /^(?:(?:hamma(?:si|sini)?|barcha(?:si|sini)?|to'?liq|qolganlari|ularni|shuni|jami|all|rest|\d+\s*(?:ta|tasini)?)[\s\S]*|(?:yana|qancha|nechta|ko'?rsat|chiqar|ayt)[?! .]*)$/iu.test(normalize(text).trim());

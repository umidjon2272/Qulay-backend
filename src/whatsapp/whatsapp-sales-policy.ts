const SALES_TRIGGER = /(?:narx|nech\s*pul|qancha|bormi|mavjud|qoldiq|ombor|mahsulot|tovar|dona|kg|litr|model|rang|variant|chegirma|aksiya|promo|buyurtma|zakaz|olaman|olmoqch|kerak|yetkaz|delivery|достав|цена|сколько|есть\s+ли|в\s+налич|товар|продукт|заказ|скидк|price|stock|available|order)/iu;
const CLEARLY_NON_SALES = /(?:futbol|football|kino|film|ob[-\s]?havo|weather|siyosat|politic|yangilik|news|o['‘’]?yin|game|musiqa|music)/iu;
const GREETING = /^(?:salom+|assalomu\s+alaykum|alaykum\s+assalom|hello+|hi+|privet|привет|здравствуйте)[!.?\s]*$/iu;

export function isWhatsAppSalesRelevant(text: string, recentSalesContext: boolean, messageType?: string): boolean {
  if (recentSalesContext) return true;
  if (CLEARLY_NON_SALES.test(text)) return false;
  if (messageType === 'interactive' || messageType === 'button') return true;
  return SALES_TRIGGER.test(text) || GREETING.test(text);
}

export function shouldActivateWhatsAppSalesContext(text: string, recentSalesContext: boolean): boolean {
  return recentSalesContext || SALES_TRIGGER.test(text) || GREETING.test(text);
}

/**
 * WhatsApp voice notes are normally Ogg/Opus. Ogg pages expose the Opus granule
 * position, counted at 48 kHz. Reading it lets us enforce the 60-second product
 * limit without shipping ffmpeg into the API container.
 */
export function oggOpusDurationSeconds(buffer: Buffer): number {
  if (buffer.length < 27 || buffer.subarray(0, 4).toString('ascii') !== 'OggS') return Number.NaN;
  let offset = 0;
  let lastGranule = 0n;
  while (offset + 27 <= buffer.length) {
    if (buffer.subarray(offset, offset + 4).toString('ascii') !== 'OggS') break;
    const segments = buffer[offset + 26];
    const headerLength = 27 + segments;
    if (offset + headerLength > buffer.length) break;
    let payloadLength = 0;
    for (let index = 0; index < segments; index += 1) payloadLength += buffer[offset + 27 + index];
    const granule = buffer.readBigUInt64LE(offset + 6);
    if (granule !== 0xffffffffffffffffn && granule > lastGranule) lastGranule = granule;
    offset += headerLength + payloadLength;
  }
  return lastGranule > 0n ? Number(lastGranule) / 48_000 : Number.NaN;
}

export type ToolContextHistoryRow = { role?: string; content?: string };

const INSTAGRAM_CONTEXT = /(?:\binstagram\b|\binsta\b|\bpost\b|\breel(?:s)?\b|\bdirect\b|\bdm\b|\bcomment\b|\bkament\b|\bizoh\b|\bautomation\b|\bavtomat(?:izatsiya)?\b)/iu;
const CLEAR_OTHER_DOMAIN = /(?:\btelegram\b|\bwhatsapp\b|\bwatsap\b|\bgoogle\b|\bdrive\b|\bvazifa\b|\btask\b|\beslatma\b|\breminder\b|\bkalendar\b|\bcalendar\b)/iu;
const FOLLOW_UP_ACTION = /(?:almashtir|o['‘’]?zgartir|yangila|o['‘’]?chir|uchir|yoq(?:ib)?|o['‘’]?ch(?:ir|irib)|to['‘’]?xtat|davom\s+ettir|pauza|resume|shuni|ushani|hammasini|barchasini|yangi\s+qoida|qoida\s+yarat|qil(?:ib)?|bajar|xa|ha|to['‘’]?g['‘’]?ri|tugri)/iu;
const EXPLICIT_MUTATION = /(?:yoq(?:ib)?|o['‘’]?chir|uchir|almashtir|o['‘’]?zgartir|yangila|to['‘’]?xtat|davom\s+ettir|yarat|qo['‘’]?sh|qush|sozla|boshqar|hammasini|barchasini)/iu;
const CAPABILITY_QUESTION = /(?:nima(?:lar)?\s+qila\s+ol|nimalar\s+qil|qanday\s+buyruq|buyruqlar|imkoniyat|capabilit|what\s+can)/iu;

function normalize(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

export function instagramConversationContext(currentMessage: string, recentHistory: ToolContextHistoryRow[]): boolean {
  const current = normalize(currentMessage);
  if (!current) return false;
  if (INSTAGRAM_CONTEXT.test(current)) return true;
  if (CLEAR_OTHER_DOMAIN.test(current)) return false;
  if (current.length > 240 || !FOLLOW_UP_ACTION.test(current)) return false;

  return recentHistory
    .slice(0, 10)
    .some(row => typeof row.content === 'string' && INSTAGRAM_CONTEXT.test(normalize(row.content)));
}

export function instagramActionIntent(currentMessage: string, recentHistory: ToolContextHistoryRow[]): boolean {
  const current = normalize(currentMessage);
  if (!instagramConversationContext(current, recentHistory)) return false;
  if (CAPABILITY_QUESTION.test(current) && !EXPLICIT_MUTATION.test(current)) return false;

  // Explicit Instagram setting/automation mutations, or concise follow-ups to
  // an Instagram management thread, should never be answered with a fictional
  // “tool unavailable” sentence. Force the model to use a real Instagram tool.
  if (INSTAGRAM_CONTEXT.test(current) && EXPLICIT_MUTATION.test(current)) return true;
  return current.length <= 240 && FOLLOW_UP_ACTION.test(current);
}

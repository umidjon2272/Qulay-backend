export type InstagramConversationMessage = {
  id: string;
  createdTime: string | null;
  fromId: string;
  fromUsername: string | null;
  text: string;
  imageUrls: string[];
};

export function parseInstagramConversationMessages(rows: unknown[]): InstagramConversationMessage[] {
  const parsed: InstagramConversationMessage[] = [];
  for (const raw of rows) {
    const item = objectOf(raw);
    const from = objectOf(item.from);
    const sender = objectOf(item.sender);
    const id = textOf(item.id) ?? textOf(item.message_id);
    const fromId = textOf(from.id) ?? textOf(sender.id) ?? textOf(item.from_id) ?? textOf(item.sender_id);
    if (!id || !fromId) continue;
    const text = textOf(item.message) ?? textOf(item.text) ?? '';
    parsed.push({
      id,
      createdTime: textOf(item.created_time) ?? textOf(item.timestamp),
      fromId,
      fromUsername: textOf(from.username) ?? textOf(sender.username) ?? textOf(item.username),
      text,
      imageUrls: attachmentUrls(item.attachments),
    });
  }
  return parsed;
}

function attachmentUrls(value: unknown): string[] {
  const container = objectOf(value);
  const rows = Array.isArray(value) ? value : Array.isArray(container.data) ? container.data : [];
  const urls: string[] = [];
  for (const raw of rows) {
    const item = objectOf(raw);
    const payload = objectOf(item.payload);
    const imageData = objectOf(item.image_data);
    const candidates = [
      textOf(imageData.url),
      textOf(payload.url),
      textOf(item.file_url),
      textOf(item.url),
    ];
    for (const url of candidates) {
      if (!url || !/^https:\/\//iu.test(url) || urls.includes(url)) continue;
      urls.push(url);
    }
  }
  return urls.slice(0, 4);
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export type InstagramMediaComment = {
  id: string;
  mediaId: string;
  text: string;
  commenterId: string;
  username: string | null;
  timestamp: string | null;
};

export function parseInstagramMediaComments(mediaId: string, rows: Array<Record<string, unknown>>): InstagramMediaComment[] {
  return rows.map(item => {
    const from = objectOf(item.from);
    const user = objectOf(item.user);
    const actor = Object.keys(from).length ? from : user;
    const id = stringOf(item.id);
    const username = firstString(item.username, actor.username, item.user_name, item.from_username);
    const commenterId = firstString(actor.id, item.from_id, item.user_id, item.ig_id, username);
    return {
      id,
      mediaId,
      text: typeof item.text === 'string' ? item.text : typeof item.message === 'string' ? item.message : '',
      commenterId,
      username: username || null,
      timestamp: firstString(item.timestamp, item.created_time) || null,
    };
  }).filter(item => Boolean(item.id && item.commenterId));
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOf(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const clean = stringOf(value);
    if (clean) return clean;
  }
  return '';
}

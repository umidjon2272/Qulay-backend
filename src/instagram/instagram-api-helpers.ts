export type InstagramAuthModeValue = 'FACEBOOK_LOGIN' | 'INSTAGRAM_LOGIN';

/**
 * Instagram IDs can exceed JavaScript's safe-integer range. Preserve the
 * canonical `user_id` digits before JSON.parse can round them.
 */
export function parseInstagramJson<T>(raw: string): T {
  const exactIds = raw.replace(/("user_id"\s*:\s*)(\d{16,})(?=\s*[,}])/gu, '$1"$2"');
  return JSON.parse(exactIds) as T;
}

export function buildPrivateReplyRequest(
  authMode: InstagramAuthModeValue,
  instagramUserId: string,
  commentId: string,
  message: string,
): { path: string; body: Record<string, unknown> } {
  if (authMode === 'INSTAGRAM_LOGIN') {
    return {
      path: `/${encodeURIComponent(instagramUserId)}/messages`,
      body: {
        recipient: { comment_id: commentId },
        message: { text: message },
      },
    };
  }

  return {
    path: `/${encodeURIComponent(commentId)}/private_replies`,
    body: { message },
  };
}

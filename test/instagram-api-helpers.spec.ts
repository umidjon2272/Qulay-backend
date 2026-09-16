import { buildPrivateReplyRequest, parseInstagramJson } from '../src/instagram/instagram-api-helpers';

describe('Instagram API helpers', () => {
  it('preserves large Instagram user IDs as exact strings', () => {
    const parsed = parseInstagramJson<{ user_id: string }>(
      '{"access_token":"token","user_id":17841400000000001}',
    );

    expect(parsed.user_id).toBe('17841400000000001');
  });

  it('uses the Instagram Login messages endpoint for private comment replies', () => {
    expect(buildPrivateReplyRequest(
      'INSTAGRAM_LOGIN',
      '17841400000000001',
      '17900000000000001',
      'Salom',
    )).toEqual({
      path: '/17841400000000001/messages',
      body: {
        recipient: { comment_id: '17900000000000001' },
        message: { text: 'Salom' },
      },
    });
  });

  it('keeps the existing legacy private-reply route for Facebook Login connections', () => {
    expect(buildPrivateReplyRequest(
      'FACEBOOK_LOGIN',
      '17841400000000001',
      '17900000000000001',
      'Salom',
    )).toEqual({
      path: '/17900000000000001/private_replies',
      body: { message: 'Salom' },
    });
  });
});

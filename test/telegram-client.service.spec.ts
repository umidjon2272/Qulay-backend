import { ConfigService } from '@nestjs/config';
import { Api, TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { StringSession } from 'telegram/sessions';
import { GramJsTelegramClientService } from '../src/telegram/telegram-client.service';

describe('GramJsTelegramClientService', () => {
  let service: GramJsTelegramClientService;
  let invokeSpy: jest.SpyInstance;
  let connectSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new GramJsTelegramClientService(new ConfigService({ telegram: { apiId: 12345, apiHash: 'test-hash' } }));
    connectSpy = jest.spyOn(TelegramClient.prototype, 'connect').mockResolvedValue(true as never);
    jest.spyOn(TelegramClient.prototype, 'disconnect').mockResolvedValue(true as never);
    jest.spyOn(TelegramClient.prototype, 'checkAuthorization').mockResolvedValue(false);
    invokeSpy = jest.spyOn(TelegramClient.prototype, 'invoke');
  });

  afterEach(() => jest.restoreAllMocks());

  it('normalizes sentCodeTypeApp with a next_type and timeout, without exposing phoneCodeHash in logs', async () => {
    invokeSpy.mockResolvedValueOnce(new Api.auth.SentCode({
      type: new Api.auth.SentCodeTypeApp({ length: 5 }),
      phoneCodeHash: 'app-hash',
      nextType: new Api.auth.CodeTypeSms(),
      timeout: 60,
    }));
    const result = await service.beginLogin('+998901234567');
    expect(result).toMatchObject({
      phoneCodeHash: 'app-hash',
      delivery: 'telegram_app',
      nextDelivery: 'sms',
      timeoutSeconds: 60,
      rawType: 'auth.SentCodeTypeApp',
      rawNextType: 'auth.CodeTypeSms',
    });
  });

  it('connects an isolated empty session before sending with minimal CodeSettings', async () => {
    invokeSpy.mockResolvedValueOnce(new Api.auth.SentCode({
      type: new Api.auth.SentCodeTypeApp({ length: 5 }), phoneCodeHash: 'hash',
    }));
    await service.beginLogin(' +998901234567 ', 'user-a');
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy.mock.invocationCallOrder[0]).toBeLessThan(invokeSpy.mock.invocationCallOrder[0]);
    const request = invokeSpy.mock.calls[0][0] as Api.auth.SendCode;
    expect(request).toBeInstanceOf(Api.auth.SendCode);
    expect(request.phoneNumber).toBe('+998901234567');
    expect(request.settings).toBeInstanceOf(Api.CodeSettings);
    expect((request.settings as unknown as { originalArgs: Record<string, unknown> }).originalArgs).toEqual({});
    expect(request.settings).toMatchObject({
      allowFlashcall: undefined, currentNumber: undefined, allowAppHash: undefined,
      allowMissedCall: undefined, allowFirebase: undefined, unknownNumber: undefined,
      logoutTokens: undefined, token: undefined, appSandbox: undefined,
    });
  });

  it('uses distinct clients and sessions for simultaneous users', async () => {
    const connectedClients: TelegramClient[] = [];
    connectSpy.mockImplementation(function (this: TelegramClient) { connectedClients.push(this); return Promise.resolve(true as never); });
    invokeSpy
      .mockResolvedValueOnce(new Api.auth.SentCode({ type: new Api.auth.SentCodeTypeApp({ length: 5 }), phoneCodeHash: 'hash-a' }))
      .mockResolvedValueOnce(new Api.auth.SentCode({ type: new Api.auth.SentCodeTypeApp({ length: 5 }), phoneCodeHash: 'hash-b' }));
    await Promise.all([service.beginLogin('+998901234567', 'user-a'), service.beginLogin('+998911234567', 'user-b')]);
    expect(connectedClients).toHaveLength(2);
    expect(connectedClients[0]).not.toBe(connectedClients[1]);
    expect(connectedClients[0].session).not.toBe(connectedClients[1].session);
  });

  it('does not send a code if the fresh client unexpectedly reports authorization', async () => {
    jest.spyOn(TelegramClient.prototype, 'checkAuthorization').mockResolvedValueOnce(true);
    await expect(service.beginLogin('+998901234567', 'user-a')).rejects.toMatchObject({ code: 'ALREADY_AUTHORIZED' });
    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it('does not leak phone, hash, API hash, or session data in sendCode diagnostics', async () => {
    const logger = (service as unknown as { logger: { log: (...args: unknown[]) => void } }).logger;
    const logSpy = jest.spyOn(logger, 'log');
    invokeSpy.mockResolvedValueOnce(new Api.auth.SentCode({ type: new Api.auth.SentCodeTypeApp({ length: 5 }), phoneCodeHash: 'private-hash' }));
    await service.beginLogin('+998901234567', 'user-a');
    const output = JSON.stringify(logSpy.mock.calls);
    expect(output).not.toContain('+998901234567');
    expect(output).not.toContain('private-hash');
    expect(output).not.toContain('test-hash');
  });

  it('starts QR login with an isolated session and returns a base64url token without padding', async () => {
    invokeSpy.mockResolvedValueOnce(new Api.auth.LoginToken({ expires: 2_000_000_000, token: Buffer.from([251, 255, 0]) }));
    const result = await service.beginQrLogin();
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(invokeSpy.mock.calls[0][0]).toBeInstanceOf(Api.auth.ExportLoginToken);
    expect(invokeSpy.mock.calls[0][0]).toMatchObject({ apiId: 12345, apiHash: 'test-hash', exceptIds: [] });
    expect(result).toMatchObject({ status: 'pending', qrUrl: 'tg://login?token=-_8A', expiresAt: '2033-05-18T03:33:20.000Z' });
    expect(JSON.stringify(result)).not.toContain('test-hash');
  });

  it('switches DC and imports LoginTokenMigrateTo before returning the refreshed QR', async () => {
    jest.spyOn(service as any, 'client').mockReturnValue(new TelegramClient(new StringSession(''), 12345, 'test-hash', { connectionRetries: 1 }));
    const switchDc = jest.spyOn(TelegramClient.prototype, '_switchDC').mockResolvedValue(true);
    invokeSpy
      .mockResolvedValueOnce(new Api.auth.LoginTokenMigrateTo({ dcId: 4, token: Buffer.from('migration-token') }))
      .mockResolvedValueOnce(new Api.auth.LoginToken({ expires: 2_000_000_000, token: Buffer.from('fresh-token') }));
    await expect(service.pollQrLogin('persisted-session')).resolves.toMatchObject({ status: 'pending' });
    expect(switchDc).toHaveBeenCalledWith(4);
    expect(invokeSpy.mock.calls[1][0]).toBeInstanceOf(Api.auth.ImportLoginToken);
  });

  it('turns LoginTokenSuccess into a reusable authorized session and account', async () => {
    jest.spyOn(service as any, 'client').mockReturnValue(new TelegramClient(new StringSession(''), 12345, 'test-hash', { connectionRetries: 1 }));
    invokeSpy.mockResolvedValueOnce(new Api.auth.LoginTokenSuccess({
      authorization: new Api.auth.Authorization({ user: new Api.User({ id: returnBigInt(42), firstName: 'Aziz', username: 'aziz' }) }),
    }));
    jest.spyOn(TelegramClient.prototype, 'getMe').mockResolvedValue(new Api.User({ id: returnBigInt(42), firstName: 'Aziz', username: 'aziz' }) as never);
    await expect(service.pollQrLogin('persisted-session')).resolves.toMatchObject({
      status: 'connected', account: { telegramUserId: '42', username: 'aziz', displayName: 'Aziz' },
    });
  });

  it('preserves the existing 2FA completion flow when QR authorization requests a password', async () => {
    invokeSpy.mockRejectedValueOnce(Object.assign(new Error('SESSION_PASSWORD_NEEDED'), { errorMessage: 'SESSION_PASSWORD_NEEDED' }));
    await expect(service.beginQrLogin()).resolves.toMatchObject({ status: 'password_required' });
  });

  it('normalizes sentCodeTypeSms', async () => {
    invokeSpy.mockResolvedValueOnce(new Api.auth.SentCode({
      type: new Api.auth.SentCodeTypeSms({ length: 5 }),
      phoneCodeHash: 'sms-hash',
    }));
    const result = await service.beginLogin('+998901234567');
    expect(result).toMatchObject({ delivery: 'sms', nextDelivery: null, timeoutSeconds: null, rawType: 'auth.SentCodeTypeSms' });
  });

  it('normalizes sentCodeTypeEmailCode', async () => {
    invokeSpy.mockResolvedValueOnce(new Api.auth.SentCode({
      type: new Api.auth.SentCodeTypeEmailCode({ emailPattern: 'a***@gmail.com', length: 6 }),
      phoneCodeHash: 'email-hash',
    }));
    const result = await service.beginLogin('+998901234567');
    expect(result).toMatchObject({ delivery: 'email', rawType: 'auth.SentCodeTypeEmailCode' });
  });

  it('normalizes fragment and firebase_sms delivery types', async () => {
    invokeSpy.mockResolvedValueOnce(new Api.auth.SentCode({
      type: new Api.auth.SentCodeTypeFragmentSms({ url: 'https://fragment.com', length: 5 }),
      phoneCodeHash: 'fragment-hash',
    }));
    await expect(service.beginLogin('+998901234567')).resolves.toMatchObject({ delivery: 'fragment' });

    invokeSpy.mockResolvedValueOnce(new Api.auth.SentCode({
      type: new Api.auth.SentCodeTypeFirebaseSms({ length: 5 }),
      phoneCodeHash: 'firebase-hash',
    }));
    await expect(service.beginLogin('+998901234567')).resolves.toMatchObject({ delivery: 'firebase_sms' });
  });

  it('resends the code and reuses the existing session/phoneCodeHash', async () => {
    invokeSpy.mockResolvedValueOnce(new Api.auth.SentCode({
      type: new Api.auth.SentCodeTypeSms({ length: 5 }),
      phoneCodeHash: 'resent-hash',
      nextType: new Api.auth.CodeTypeCall(),
      timeout: 120,
    }));
    const result = await service.resendCode({ session: '', phoneNumber: '+998901234567', phoneCodeHash: 'sms-hash' });
    expect(invokeSpy.mock.calls[0][0]).toBeInstanceOf(Api.auth.ResendCode);
    expect(result).toMatchObject({ phoneCodeHash: 'resent-hash', delivery: 'sms', nextDelivery: 'call', timeoutSeconds: 120 });
  });

  it('classifies Telegram flood wait errors with the retry-after duration', async () => {
    invokeSpy.mockRejectedValueOnce(Object.assign(new Error('FLOOD_WAIT_30'), { errorMessage: 'FLOOD_WAIT_30' }));
    await expect(service.beginLogin('+998901234567')).rejects.toMatchObject({ code: 'FLOOD_WAIT', retryAfterSeconds: 30 });
  });

  it.each([
    ['SEND_CODE_UNAVAILABLE', 'RESEND_UNAVAILABLE'],
    ['PHONE_CODE_HASH_INVALID', 'CODE_HASH_INVALID'],
    ['PHONE_CODE_HASH_EMPTY', 'CODE_HASH_INVALID'],
  ])('classifies %s during resend as %s', async (rpcError, code) => {
    invokeSpy.mockRejectedValueOnce(Object.assign(new Error(rpcError), { errorMessage: rpcError }));
    await expect(service.resendCode({ session: '', phoneNumber: '+998901234567', phoneCodeHash: 'hash' })).rejects.toMatchObject({ code });
  });

  describe('verifyCode', () => {
    it('signs in and returns the connected account on a correct code', async () => {
      invokeSpy.mockResolvedValueOnce(undefined);
      jest.spyOn(TelegramClient.prototype, 'getMe').mockResolvedValue({
        id: { toString: () => '42' }, username: 'aziz', firstName: 'Aziz', lastName: 'Aliyev', phone: '998901234567',
      } as never);
      const result = await service.verifyCode({ session: '', phoneNumber: '+998901234567', phoneCodeHash: 'hash-1', code: '11111' });
      expect(result.status).toBe('connected');
      expect(result.account).toMatchObject({ telegramUserId: '42', username: 'aziz', displayName: 'Aziz Aliyev' });
    });

    it('returns password_required on SESSION_PASSWORD_NEEDED (2FA enabled)', async () => {
      invokeSpy.mockRejectedValueOnce(Object.assign(new Error('SESSION_PASSWORD_NEEDED'), { errorMessage: 'SESSION_PASSWORD_NEEDED' }));
      const result = await service.verifyCode({ session: '', phoneNumber: '+998901234567', phoneCodeHash: 'hash-1', code: '11111' });
      expect(result).toMatchObject({ status: 'password_required' });
    });

    it('classifies a wrong code as PHONE_CODE_INVALID -> INVALID_CODE', async () => {
      invokeSpy.mockRejectedValueOnce(Object.assign(new Error('PHONE_CODE_INVALID'), { errorMessage: 'PHONE_CODE_INVALID' }));
      await expect(service.verifyCode({ session: '', phoneNumber: '+998901234567', phoneCodeHash: 'hash-1', code: '00000' })).rejects.toMatchObject({ code: 'INVALID_CODE' });
    });

    it('classifies an expired code as PHONE_CODE_EXPIRED -> EXPIRED_CODE', async () => {
      invokeSpy.mockRejectedValueOnce(Object.assign(new Error('PHONE_CODE_EXPIRED'), { errorMessage: 'PHONE_CODE_EXPIRED' }));
      await expect(service.verifyCode({ session: '', phoneNumber: '+998901234567', phoneCodeHash: 'hash-1', code: '11111' })).rejects.toMatchObject({ code: 'EXPIRED_CODE' });
    });
  });

  it('completes the official GramJS 2FA password flow and saves the resulting account session', async () => {
    const passwordSpy = jest.spyOn(TelegramClient.prototype, 'signInWithPassword').mockResolvedValue({} as never);
    jest.spyOn(TelegramClient.prototype, 'getMe').mockResolvedValue({
      id: { toString: () => '42' }, username: 'aziz', firstName: 'Aziz', lastName: 'Aliyev', phone: '998901234567',
    } as never);
    await expect(service.verifyPassword({ session: '', password: 'secret-pass' })).resolves.toMatchObject({
      account: { telegramUserId: '42', username: 'aziz', displayName: 'Aziz Aliyev' },
    });
    expect(passwordSpy).toHaveBeenCalledWith(expect.objectContaining({ apiId: 12345, apiHash: 'test-hash' }), expect.objectContaining({ password: expect.any(Function) }));
  });

  it('logs out through the official auth.LogOut request', async () => {
    invokeSpy.mockResolvedValueOnce(undefined);
    await expect(service.logout('')).resolves.toBeUndefined();
    expect(invokeSpy.mock.calls[0][0]).toBeInstanceOf(Api.auth.LogOut);
  });

  describe('peer resolution for sending', () => {
    const user = (id: number, firstName: string, username?: string) => new Api.User({
      id: returnBigInt(id), firstName, username,
    });

    it('resolves a saved contact even when it is not in recent dialogs', async () => {
      const contact = user(77, 'Aziz Contact', 'aziz_contact');
      jest.spyOn(TelegramClient.prototype, 'getDialogs').mockResolvedValue([] as never);
      invokeSpy.mockImplementation(async (request: unknown) => {
        if (request instanceof Api.contacts.GetContacts) return { users: [contact] };
        throw new Error('Unexpected request');
      });
      jest.spyOn(TelegramClient.prototype, 'sendMessage').mockResolvedValue({ id: 991 } as never);

      await expect(service.resolvePeer('', '77')).resolves.toEqual(expect.objectContaining({ peerId: '77', displayName: 'Aziz Contact' }));
      await expect(service.sendMessage('', '77', 'Salom')).resolves.toEqual(expect.objectContaining({ messageId: '991', recipient: expect.objectContaining({ peerId: '77' }) }));
    });

    it('keeps a short-lived entity reference from username/global search so the selected result can be sent', async () => {
      const remote = user(88, 'Remote Aziz', 'remoteaziz');
      jest.spyOn(TelegramClient.prototype, 'getMe').mockResolvedValue(user(999, 'Owner') as never);
      jest.spyOn(TelegramClient.prototype, 'getDialogs').mockResolvedValue([] as never);
      invokeSpy.mockImplementation(async (request: unknown) => {
        if (request instanceof Api.contacts.GetContacts) return { users: [] };
        if (request instanceof Api.contacts.ResolveUsername) return { users: [remote], chats: [] };
        if (request instanceof Api.contacts.Search) return { users: [], chats: [] };
        throw new Error('Unexpected request');
      });
      jest.spyOn(TelegramClient.prototype, 'sendMessage').mockResolvedValue({ id: 992 } as never);

      const matches = await service.search('', '@remoteaziz', 10);
      expect(matches).toEqual([expect.objectContaining({ peerId: '88', username: '@remoteaziz' })]);
      await expect(service.sendMessage('', '88', 'Salom')).resolves.toEqual(expect.objectContaining({ messageId: '992', recipient: expect.objectContaining({ peerId: '88' }) }));
    });
  });

  describe('search', () => {
    const user = (id: number, firstName: string, username?: string) => new Api.User({
      id: returnBigInt(id), firstName, username,
    });
    const dialog = (entity: Api.User) => ({ entity, isUser: true, isChannel: false, name: entity.firstName });

    beforeEach(() => {
      jest.spyOn(TelegramClient.prototype, 'getMe').mockResolvedValue(user(999, 'Owner') as never);
      jest.spyOn(TelegramClient.prototype, 'getDialogs').mockResolvedValue([] as never);
      invokeSpy.mockImplementation(async (request: unknown) => {
        if (request instanceof Api.contacts.GetContacts) return { users: [] };
        if (request instanceof Api.contacts.ResolveUsername) throw Object.assign(new Error('USERNAME_NOT_OCCUPIED'), { errorMessage: 'USERNAME_NOT_OCCUPIED' });
        if (request instanceof Api.contacts.Search) return { users: [], chats: [] };
        throw new Error('Unexpected request');
      });
    });

    it.each(['Aziz', 'aziz'])('finds a Telegram contact by case-insensitive display name: %s', async (query) => {
      invokeSpy.mockImplementation(async (request: unknown) => {
        if (request instanceof Api.contacts.GetContacts) return { users: [user(1, 'Aziz')] };
        throw new Error('Unexpected request');
      });
      await expect(service.search('', query, 10)).resolves.toEqual([
        expect.objectContaining({ peerId: '1', displayName: 'Aziz', username: null, type: 'USER' }),
      ]);
    });

    it('supports partial names and returns multiple candidates', async () => {
      jest.spyOn(TelegramClient.prototype, 'getDialogs').mockResolvedValue([
        dialog(user(1, 'Azizbek')), dialog(user(2, 'Aziz Aka')),
      ] as never);
      const result = await service.search('', 'Aziz', 10);
      expect(result.map((peer) => peer.displayName)).toEqual(['Aziz Aka', 'Azizbek']);
    });

    it('falls back from dialogs to contacts', async () => {
      invokeSpy.mockImplementation(async (request: unknown) => {
        if (request instanceof Api.contacts.GetContacts) return { users: [user(3, 'Aziz Contact')] };
        throw new Error('Unexpected request');
      });
      await expect(service.search('', 'Aziz', 10)).resolves.toEqual([
        expect.objectContaining({ peerId: '3', displayName: 'Aziz Contact' }),
      ]);
    });

    it.each(['@umidwwu', 'umidwwu'])('resolves an exact username with or without @: %s', async (query) => {
      invokeSpy.mockImplementation(async (request: unknown) => {
        if (request instanceof Api.contacts.GetContacts) return { users: [] };
        if (request instanceof Api.contacts.ResolveUsername) return { users: [user(4, 'Aziz', 'UmidWwu')], chats: [] };
        if (request instanceof Api.contacts.Search) return { users: [], chats: [] };
        throw new Error('Unexpected request');
      });
      await expect(service.search('', query, 10)).resolves.toEqual([
        expect.objectContaining({ peerId: '4', username: '@UmidWwu' }),
      ]);
    });

    it('falls back from contacts and resolve to Telegram global search', async () => {
      invokeSpy.mockImplementation(async (request: unknown) => {
        if (request instanceof Api.contacts.GetContacts) return { users: [] };
        if (request instanceof Api.contacts.ResolveUsername) throw Object.assign(new Error('USERNAME_NOT_OCCUPIED'), { errorMessage: 'USERNAME_NOT_OCCUPIED' });
        if (request instanceof Api.contacts.Search) return { users: [user(5, 'Umid', 'umidwwu')], chats: [] };
        throw new Error('Unexpected request');
      });
      await expect(service.search('', 'umidwwu', 10)).resolves.toEqual([
        expect.objectContaining({ peerId: '5', username: '@umidwwu' }),
      ]);
    });

    it('deduplicates the same peerId across dialogs and contacts', async () => {
      const aziz = user(6, 'Aziz', 'aziz_user');
      jest.spyOn(TelegramClient.prototype, 'getDialogs').mockResolvedValue([dialog(aziz)] as never);
      invokeSpy.mockImplementation(async (request: unknown) => {
        if (request instanceof Api.contacts.GetContacts) return { users: [aziz] };
        throw new Error('Unexpected request');
      });
      await expect(service.search('', 'Aziz', 10)).resolves.toHaveLength(1);
    });

    it('keeps searching contacts when dialogs have a transient RPC failure', async () => {
      jest.spyOn(TelegramClient.prototype, 'getDialogs').mockRejectedValue(Object.assign(new Error('TIMEOUT'), { errorMessage: 'TIMEOUT' }));
      invokeSpy.mockImplementation(async (request: unknown) => {
        if (request instanceof Api.contacts.GetContacts) return { users: [user(9, 'Aziz Contact')] };
        throw new Error('Unexpected request');
      });
      await expect(service.search('', 'Aziz', 10)).resolves.toEqual([
        expect.objectContaining({ peerId: '9', displayName: 'Aziz Contact' }),
      ]);
    });

    it('does not falsely report not-found when a search source had a transient RPC failure', async () => {
      jest.spyOn(TelegramClient.prototype, 'getDialogs').mockRejectedValue(Object.assign(new Error('TIMEOUT'), { errorMessage: 'TIMEOUT' }));
      await expect(service.search('', 'Aziz', 10)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });

    it('classifies AUTH_KEY_UNREGISTERED from the real search operation as an expired session', async () => {
      jest.spyOn(TelegramClient.prototype, 'getDialogs').mockRejectedValue(Object.assign(new Error('AUTH_KEY_UNREGISTERED'), { errorMessage: 'AUTH_KEY_UNREGISTERED' }));
      await expect(service.search('', 'Aziz', 10)).rejects.toMatchObject({ code: 'CONNECTION_EXPIRED' });
    });

    it('understands conversational honorifics when matching a display name', async () => {
      jest.spyOn(TelegramClient.prototype, 'getDialogs').mockResolvedValue([dialog(user(11, 'Shamshod'))] as never);
      await expect(service.search('', 'Shamshod aka', 10)).resolves.toEqual([
        expect.objectContaining({ peerId: '11', displayName: 'Shamshod' }),
      ]);
    });
  });
});

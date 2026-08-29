import { ConfigService } from '@nestjs/config';
import { Api, TelegramClient } from 'teleproto';
import { returnBigInt } from 'teleproto/Helpers';
import { TeleprotoTelegramClientService } from '../src/telegram/telegram-client.service';

describe('TeleprotoTelegramClientService', () => {
  let service: TeleprotoTelegramClientService;
  let invokeSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new TeleprotoTelegramClientService(new ConfigService({ telegram: { apiId: 12345, apiHash: 'test-hash' } }));
    jest.spyOn(TelegramClient.prototype, 'connect').mockResolvedValue(true as never);
    jest.spyOn(TelegramClient.prototype, 'disconnect').mockResolvedValue(true as never);
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
      expect(result.map((peer) => peer.displayName)).toEqual(['Azizbek', 'Aziz Aka']);
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

    it('does not classify a transient RPC failure as an expired session', async () => {
      jest.spyOn(TelegramClient.prototype, 'getDialogs').mockRejectedValue(Object.assign(new Error('TIMEOUT'), { errorMessage: 'TIMEOUT' }));
      await expect(service.search('', 'Aziz', 10)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });

    it('classifies AUTH_KEY_UNREGISTERED as an expired session', async () => {
      jest.spyOn(TelegramClient.prototype, 'getMe').mockRejectedValue(Object.assign(new Error('AUTH_KEY_UNREGISTERED'), { errorMessage: 'AUTH_KEY_UNREGISTERED' }));
      await expect(service.search('', 'Aziz', 10)).rejects.toMatchObject({ code: 'CONNECTION_EXPIRED' });
    });
  });
});

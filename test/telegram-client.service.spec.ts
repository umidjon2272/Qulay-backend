import { ConfigService } from '@nestjs/config';
import { Api, TelegramClient } from 'teleproto';
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

  describe('production diagnostics', () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest.spyOn((service as unknown as { logger: { log: (...args: unknown[]) => void } }).logger, 'log');
    });

    it('logs safe diagnostic fields for a normal SentCode response, without any PII', async () => {
      invokeSpy.mockResolvedValueOnce(new Api.auth.SentCode({
        type: new Api.auth.SentCodeTypeApp({ length: 5 }),
        phoneCodeHash: 'app-hash',
        nextType: new Api.auth.CodeTypeSms(),
        timeout: 60,
      }));
      await service.beginLogin('+998901234567');
      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
        event: 'telegram_sent_code_diagnostic',
        source: 'send_code',
        responseKind: 'auth.SentCode',
        rawType: 'auth.SentCodeTypeApp',
        delivery: 'telegram_app',
        codeLength: 5,
        rawNextType: 'auth.CodeTypeSms',
        nextDelivery: 'sms',
        timeoutSeconds: 60,
      }));
      const loggedText = JSON.stringify(logSpy.mock.calls);
      expect(loggedText).not.toContain('app-hash');
      expect(loggedText).not.toContain('+998901234567');
      expect(loggedText).not.toContain('test-hash');
    });

    it('logs SentCodeSuccess and SentCodePaymentRequired as their real response kind instead of silently swallowing them', async () => {
      invokeSpy.mockResolvedValueOnce(new Api.auth.SentCodeSuccess({
        authorization: new Api.auth.Authorization({ user: {} as never }),
      }));
      await expect(service.beginLogin('+998901234567')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ responseKind: 'auth.SentCodeSuccess', rawType: null, delivery: null }));

      invokeSpy.mockResolvedValueOnce(new Api.auth.SentCodePaymentRequired({
        storeProduct: 'x', phoneCodeHash: 'hash', supportEmailAddress: 'a@b.com', supportEmailSubject: 's', premiumDays: 1, currency: 'USD', amount: 100n as never,
      }));
      await expect(service.beginLogin('+998901234567')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ responseKind: 'auth.SentCodePaymentRequired', rawType: null }));
    });
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
});

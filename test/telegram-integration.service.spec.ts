import { TelegramConnectionStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { TelegramIntegrationService } from '../src/telegram/telegram-integration.service';
import { TelegramAdapterError } from '../src/telegram/telegram.errors';

describe('TelegramIntegrationService', () => {
  const prisma = {
    telegramConnection: {
      findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
    },
  } as any;
  const crypto = {
    encrypt: jest.fn((value: string) => `encrypted:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^encrypted:/, '')),
    maskPhone: jest.fn(() => '+99****67'),
  } as any;
  const client = {
    beginLogin: jest.fn(), resendCode: jest.fn(), verifyCode: jest.fn(), verifyPassword: jest.fn(), logout: jest.fn(),
    search: jest.fn(), chats: jest.fn(), resolvePeer: jest.fn(), sendMessage: jest.fn(),
  } as any;
  const contacts = { listForUser: jest.fn().mockResolvedValue({ items: [] }) } as any;
  const activityLog = { record: jest.fn().mockResolvedValue(undefined) } as any;
  let service: TelegramIntegrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramIntegrationService(prisma, crypto, client, contacts, activityLog, new ConfigService({ telegram: { configured: true } }));
  });

  it('returns disconnected without exposing secure fields', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue(null);
    await expect(service.status('user-a')).resolves.toEqual(expect.objectContaining({ connected: false, status: TelegramConnectionStatus.DISCONNECTED }));
  });

  it('persists encrypted temporary login state and never stores code/password', async () => {
    client.beginLogin.mockResolvedValue({
      session: 'session-string', phoneCodeHash: 'hash',
      delivery: 'telegram_app', nextDelivery: 'sms', timeoutSeconds: 60,
      rawType: 'auth.SentCodeTypeApp', rawNextType: 'auth.CodeTypeSms',
    });
    prisma.telegramConnection.upsert.mockResolvedValue(undefined);
    await expect(service.connect('user-a', '+998901234567')).resolves.toEqual({
      status: 'code_required', delivery: 'telegram_app', nextDelivery: 'sms', timeoutSeconds: 60,
    });
    expect(prisma.telegramConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        status: TelegramConnectionStatus.AWAITING_CODE, encryptedSession: 'encrypted:session-string', encryptedPhoneCodeHash: 'encrypted:hash', phoneNumber: 'encrypted:+998901234567', codeResendAfterSeconds: 60,
      }),
    }));
    expect(JSON.stringify(prisma.telegramConnection.upsert.mock.calls[0])).not.toContain('CODE-SECRET');
  });

  it('resends the code, respecting the stored timeout, and normalizes the response', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({
      userId: 'user-a', status: TelegramConnectionStatus.AWAITING_CODE,
      encryptedSession: 'encrypted:session-string', phoneNumber: 'encrypted:+998901234567', encryptedPhoneCodeHash: 'encrypted:hash',
      codeSentAt: new Date(Date.now() - 120_000), codeResendAfterSeconds: 60,
    });
    client.resendCode.mockResolvedValue({
      session: 'session-string-2', phoneCodeHash: 'hash-2',
      delivery: 'sms', nextDelivery: 'call', timeoutSeconds: 90,
      rawType: 'auth.SentCodeTypeSms', rawNextType: 'auth.CodeTypeCall',
    });
    prisma.telegramConnection.update.mockResolvedValue(undefined);
    await expect(service.resendCode('user-a')).resolves.toEqual({
      status: 'code_required', delivery: 'sms', nextDelivery: 'call', timeoutSeconds: 90,
    });
    expect(client.resendCode).toHaveBeenCalledWith({ session: 'session-string', phoneNumber: '+998901234567', phoneCodeHash: 'hash' });
  });

  it('rejects resend before the Telegram timeout has elapsed, without contacting Telegram again', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({
      userId: 'user-a', status: TelegramConnectionStatus.AWAITING_CODE,
      encryptedSession: 'encrypted:session-string', phoneNumber: 'encrypted:+998901234567', encryptedPhoneCodeHash: 'encrypted:hash',
      codeSentAt: new Date(), codeResendAfterSeconds: 60,
    });
    await expect(service.resendCode('user-a')).rejects.toMatchObject({ status: 429 });
    expect(client.resendCode).not.toHaveBeenCalled();
  });

  it('scopes connected operations to the authenticated user connection', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({ userId: 'user-a', status: TelegramConnectionStatus.CONNECTED, encryptedSession: 'encrypted:session-string' });
    client.search.mockResolvedValue([]);
    await expect(service.search('user-a', { q: 'aziz', limit: 10 } as any)).resolves.toEqual([]);
    expect(client.search).toHaveBeenCalledWith('session-string', 'aziz', 10);
    prisma.telegramConnection.findUnique.mockResolvedValue(null);
    await expect(service.search('user-b', { q: 'aziz', limit: 10 } as any)).rejects.toThrow('Telegram account is not connected');
  });

  it('reports not_configured and rejects connect when Telegram credentials are absent', async () => {
    service = new TelegramIntegrationService(prisma, crypto, client, contacts, activityLog, new ConfigService({ telegram: { configured: false } }));
    await expect(service.status('user-a')).resolves.toEqual(expect.objectContaining({ connected: false, status: 'not_configured' }));
    await expect(service.connect('user-a', '+998901234567')).rejects.toMatchObject({ status: 503, response: expect.objectContaining({ message: 'Telegram integratsiyasi hozir sozlanmagan' }) });
    expect(client.beginLogin).not.toHaveBeenCalled();
  });

  describe('pending session decryption', () => {
    const pendingConnection = {
      userId: 'user-a', status: TelegramConnectionStatus.AWAITING_CODE,
      encryptedSession: 'encrypted:raw-session-secret', phoneNumber: 'encrypted:+998901234567', encryptedPhoneCodeHash: 'encrypted:hash-1',
    };

    it('verifyCode decrypts the stored session before handing it to the Telegram client', async () => {
      prisma.telegramConnection.findUnique.mockResolvedValue(pendingConnection);
      client.verifyCode.mockResolvedValue({ status: 'connected', session: 'new-session-secret', account: { telegramUserId: '1', username: 'aziz', displayName: 'Aziz', phoneNumber: '+998901234567' } });
      prisma.telegramConnection.update.mockResolvedValue(undefined);
      await service.verifyCode('user-a', '12345');
      expect(client.verifyCode).toHaveBeenCalledWith(expect.objectContaining({ session: 'raw-session-secret', phoneNumber: '+998901234567', phoneCodeHash: 'hash-1', code: '12345' }));
    });

    it('verifyPassword decrypts the stored session before handing it to the Telegram client', async () => {
      prisma.telegramConnection.findUnique.mockResolvedValue({ ...pendingConnection, status: TelegramConnectionStatus.AWAITING_PASSWORD });
      client.verifyPassword.mockResolvedValue({ session: 'new-session-secret', account: { telegramUserId: '1', username: 'aziz', displayName: 'Aziz', phoneNumber: '+998901234567' } });
      prisma.telegramConnection.update.mockResolvedValue(undefined);
      await service.verifyPassword('user-a', 'secret-pass');
      expect(client.verifyPassword).toHaveBeenCalledWith({ session: 'raw-session-secret', password: 'secret-pass' });
    });

    it('never logs the raw or decrypted session', async () => {
      const logSpy = jest.spyOn((service as unknown as { logger: { log: (...args: unknown[]) => void } }).logger, 'log');
      client.beginLogin.mockResolvedValue({
        session: 'session-during-connect', phoneCodeHash: 'hash',
        delivery: 'sms', nextDelivery: null, timeoutSeconds: 30,
        rawType: 'auth.SentCodeTypeSms', rawNextType: null,
      });
      prisma.telegramConnection.upsert.mockResolvedValue(undefined);
      await service.connect('user-a', '+998901234567');

      prisma.telegramConnection.findUnique.mockResolvedValue(pendingConnection);
      client.verifyCode.mockResolvedValue({ status: 'connected', session: 'new-session-secret', account: { telegramUserId: '1', username: 'aziz', displayName: 'Aziz', phoneNumber: '+998901234567' } });
      prisma.telegramConnection.update.mockResolvedValue(undefined);
      await service.verifyCode('user-a', '12345');

      const loggedText = JSON.stringify(logSpy.mock.calls);
      expect(loggedText).not.toContain('session-during-connect');
      expect(loggedText).not.toContain('raw-session-secret');
      expect(loggedText).not.toContain('new-session-secret');
    });

    it('surfaces a wrong code and an expired code as user-safe 400 errors', async () => {
      prisma.telegramConnection.findUnique.mockResolvedValue(pendingConnection);
      client.verifyCode.mockRejectedValueOnce(new TelegramAdapterError('INVALID_CODE'));
      await expect(service.verifyCode('user-a', '00000')).rejects.toMatchObject({ status: 400, response: expect.objectContaining({ message: 'Invalid Telegram code' }) });

      client.verifyCode.mockRejectedValueOnce(new TelegramAdapterError('EXPIRED_CODE'));
      await expect(service.verifyCode('user-a', '00000')).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('full auth flow', () => {
    it('walks connect -> code_required -> verify-code -> verify-password -> connected end-to-end', async () => {
      let row: Record<string, unknown> | null = null;
      prisma.telegramConnection.upsert.mockImplementation(({ create, update }: any) => {
        row = row ? { ...row, ...update } : { userId: 'user-a', ...create };
        return Promise.resolve(row);
      });
      prisma.telegramConnection.update.mockImplementation(({ data }: any) => {
        row = { ...row, ...data };
        return Promise.resolve(row);
      });
      prisma.telegramConnection.findUnique.mockImplementation(() => Promise.resolve(row));

      client.beginLogin.mockResolvedValue({
        session: 'session-1', phoneCodeHash: 'hash-1',
        delivery: 'telegram_app', nextDelivery: null, timeoutSeconds: 60,
        rawType: 'auth.SentCodeTypeApp', rawNextType: null,
      });
      await expect(service.connect('user-a', '+998901234567')).resolves.toMatchObject({ status: 'code_required', delivery: 'telegram_app' });
      expect(row).toMatchObject({ status: TelegramConnectionStatus.AWAITING_CODE, encryptedSession: 'encrypted:session-1' });

      client.verifyCode.mockResolvedValue({ status: 'password_required', session: 'session-2' });
      await expect(service.verifyCode('user-a', '11111')).resolves.toEqual({ status: 'password_required' });
      expect(client.verifyCode).toHaveBeenCalledWith(expect.objectContaining({ session: 'session-1', phoneNumber: '+998901234567', phoneCodeHash: 'hash-1', code: '11111' }));
      expect(row).toMatchObject({ status: TelegramConnectionStatus.AWAITING_PASSWORD, encryptedSession: 'encrypted:session-2' });

      client.verifyPassword.mockResolvedValue({ session: 'session-3', account: { telegramUserId: '42', username: 'aziz', displayName: 'Aziz Aliyev', phoneNumber: '+998901234567' } });
      await expect(service.verifyPassword('user-a', 'secret-pass')).resolves.toEqual({ status: 'connected' });
      expect(client.verifyPassword).toHaveBeenCalledWith({ session: 'session-2', password: 'secret-pass' });
      expect(row).toMatchObject({
        status: TelegramConnectionStatus.CONNECTED,
        encryptedSession: 'encrypted:session-3',
        encryptedPhoneCodeHash: null,
        codeSentAt: null,
        codeResendAfterSeconds: null,
        telegramUserId: '42',
        username: 'aziz',
      });
    });
  });
});

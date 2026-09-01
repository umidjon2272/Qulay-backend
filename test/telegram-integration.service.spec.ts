import { TelegramConnectionStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { TelegramIntegrationService } from '../src/telegram/telegram-integration.service';
import { TelegramAdapterError } from '../src/telegram/telegram.errors';

describe('TelegramIntegrationService', () => {
  const prisma = {
    telegramConnection: {
      findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
    },
  } as any;
  const crypto = {
    encrypt: jest.fn((value: string) => `encrypted:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^encrypted:/, '')),
    maskPhone: jest.fn(() => '+99****67'),
  } as any;
  const client = {
    beginLogin: jest.fn(), beginQrLogin: jest.fn(), checkQrLogin: jest.fn(), pollQrLogin: jest.fn(), resendCode: jest.fn(), verifyCode: jest.fn(), verifyPassword: jest.fn(), logout: jest.fn(),
    validateSession: jest.fn(), search: jest.fn(), chats: jest.fn(), resolvePeer: jest.fn(), sendMessage: jest.fn(),
  } as any;
  const contacts = { listForUser: jest.fn().mockResolvedValue({ items: [] }) } as any;
  const activityLog = { record: jest.fn().mockResolvedValue(undefined) } as any;
  let service: TelegramIntegrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    client.validateSession.mockResolvedValue({ telegramUserId: '1', username: 'aziz', displayName: 'Aziz', phoneNumber: null });
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
        pendingDelivery: 'telegram_app', pendingNextDelivery: 'sms',
      }),
    }));
    expect(JSON.stringify(prisma.telegramConnection.upsert.mock.calls[0])).not.toContain('CODE-SECRET');
  });

  it('persists a user-scoped encrypted QR session and never stores the raw token URL', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue(null);
    client.beginQrLogin.mockResolvedValue({ status: 'pending', session: 'qr-auth-session', qrUrl: 'tg://login?token=private-token', expiresAt: '2030-01-01T00:00:30.000Z' });
    prisma.telegramConnection.upsert.mockResolvedValue(undefined);
    await expect(service.startQrLogin('user-a')).resolves.toEqual({ status: 'pending', qrUrl: 'tg://login?token=private-token', expiresAt: '2030-01-01T00:00:30.000Z' });
    expect(prisma.telegramConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a' },
      create: expect.objectContaining({ userId: 'user-a', encryptedSession: 'encrypted:qr-auth-session', pendingDelivery: 'qr', status: TelegramConnectionStatus.AWAITING_CODE }),
    }));
    expect(JSON.stringify(prisma.telegramConnection.upsert.mock.calls)).not.toContain('private-token');
  });

  it('isolates simultaneous QR starts by authenticated Qulay user id', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue(null);
    client.beginQrLogin
      .mockResolvedValueOnce({ status: 'pending', session: 'session-a', qrUrl: 'tg://login?token=token-a', expiresAt: '2030-01-01T00:00:30.000Z' })
      .mockResolvedValueOnce({ status: 'pending', session: 'session-b', qrUrl: 'tg://login?token=token-b', expiresAt: '2030-01-01T00:00:30.000Z' });
    await service.startQrLogin('user-a');
    await service.startQrLogin('user-b');
    expect(prisma.telegramConnection.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { userId: 'user-a' }, create: expect.objectContaining({ encryptedSession: 'encrypted:session-a' }) }));
    expect(prisma.telegramConnection.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { userId: 'user-b' }, create: expect.objectContaining({ encryptedSession: 'encrypted:session-b' }) }));
  });

  it('restores the encrypted pending QR session after restart and refreshes an expired token', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({ userId: 'user-a', encryptedSession: 'encrypted:qr-auth-session', pendingDelivery: 'qr', status: TelegramConnectionStatus.AWAITING_CODE, codeSentAt: new Date(0), codeResendAfterSeconds: 1 });
    client.pollQrLogin.mockResolvedValue({ status: 'pending', session: 'qr-auth-session-2', qrUrl: 'tg://login?token=refreshed', expiresAt: '2030-01-01T00:01:00.000Z' });
    await expect(service.qrStatus('user-a')).resolves.toMatchObject({ status: 'pending', qrUrl: 'tg://login?token=refreshed' });
    expect(client.pollQrLogin).toHaveBeenCalledWith('qr-auth-session');
    expect(prisma.telegramConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a' } }));
  });

  it('finalizes QR success into the existing encrypted connected-session architecture', async () => {
    const connection = { userId: 'user-a', encryptedSession: 'encrypted:pending-session', pendingDelivery: 'qr', phoneNumber: null, status: TelegramConnectionStatus.AWAITING_CODE };
    prisma.telegramConnection.findUnique.mockResolvedValue(connection);
    client.pollQrLogin.mockResolvedValue({ status: 'connected', session: 'authorized-session', account: { telegramUserId: '42', username: 'aziz', displayName: 'Aziz', phoneNumber: null } });
    prisma.telegramConnection.update.mockResolvedValue(undefined);
    await expect(service.qrStatus('user-a')).resolves.toEqual({ status: 'success' });
    expect(prisma.telegramConnection.update).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a' }, data: expect.objectContaining({ encryptedSession: 'encrypted:authorized-session', status: TelegramConnectionStatus.CONNECTED, pendingDelivery: null }) }));
  });

  it('resends the code, respecting the stored timeout, and normalizes the response', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({
      userId: 'user-a', status: TelegramConnectionStatus.AWAITING_CODE,
      encryptedSession: 'encrypted:session-string', phoneNumber: 'encrypted:+998901234567', encryptedPhoneCodeHash: 'encrypted:hash',
      codeSentAt: new Date(Date.now() - 120_000), codeResendAfterSeconds: 60,
      pendingDelivery: 'telegram_app', pendingNextDelivery: 'sms',
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
      pendingDelivery: 'telegram_app', pendingNextDelivery: 'sms',
    });
    await expect(service.resendCode('user-a')).rejects.toMatchObject({ status: 429 });
    expect(client.resendCode).not.toHaveBeenCalled();
  });

  it('returns a clear conflict and does not call Telegram when nextDelivery is null', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({
      userId: 'user-a', status: TelegramConnectionStatus.AWAITING_CODE,
      encryptedSession: 'encrypted:session-string', phoneNumber: 'encrypted:+998901234567', encryptedPhoneCodeHash: 'encrypted:hash',
      codeSentAt: new Date(Date.now() - 120_000), codeResendAfterSeconds: null,
      pendingDelivery: 'telegram_app', pendingNextDelivery: null,
    });
    await expect(service.resendCode('user-a')).rejects.toMatchObject({ status: 409 });
    expect(client.resendCode).not.toHaveBeenCalled();
  });

  it.each(['CODE_HASH_INVALID', 'EXPIRED_CODE'] as const)('invalidates pending state on %s', async (code) => {
    prisma.telegramConnection.findUnique.mockResolvedValue({
      userId: 'user-a', status: TelegramConnectionStatus.AWAITING_CODE,
      encryptedSession: 'encrypted:session-string', phoneNumber: 'encrypted:+998901234567', encryptedPhoneCodeHash: 'encrypted:hash',
      codeSentAt: null, codeResendAfterSeconds: null, pendingDelivery: 'sms', pendingNextDelivery: 'call',
    });
    client.resendCode.mockRejectedValue(new TelegramAdapterError(code));
    await expect(service.resendCode('user-a')).rejects.toMatchObject({ status: 400 });
    expect(prisma.telegramConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a', status: TelegramConnectionStatus.AWAITING_CODE },
      data: expect.objectContaining({ encryptedSession: null, encryptedPhoneCodeHash: null, status: TelegramConnectionStatus.DISCONNECTED }),
    }));
  });

  it('restarts the login safely when Telegram returns AUTH_RESTART', async () => {
    const connection = {
      userId: 'user-a', status: TelegramConnectionStatus.AWAITING_CODE,
      encryptedSession: 'encrypted:session-string', phoneNumber: 'encrypted:+998901234567', encryptedPhoneCodeHash: 'encrypted:hash',
      codeSentAt: null, codeResendAfterSeconds: null, pendingDelivery: 'sms', pendingNextDelivery: 'call',
    };
    prisma.telegramConnection.findUnique.mockResolvedValue(connection);
    client.resendCode.mockRejectedValue(new TelegramAdapterError('AUTH_RESTART'));
    client.beginLogin.mockResolvedValue({ session: 'fresh-session', phoneCodeHash: 'fresh-hash', delivery: 'telegram_app', nextDelivery: null, timeoutSeconds: null, rawType: 'auth.SentCodeTypeApp', rawNextType: null });
    prisma.telegramConnection.update.mockResolvedValue(undefined);
    await expect(service.resendCode('user-a')).resolves.toMatchObject({ status: 'code_required', delivery: 'telegram_app', nextDelivery: null });
    expect(client.beginLogin).toHaveBeenCalledWith('+998901234567', 'user-a');
    expect(prisma.telegramConnection.update).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a' }, data: expect.objectContaining({ encryptedSession: 'encrypted:fresh-session', encryptedPhoneCodeHash: 'encrypted:fresh-hash' }) }));
  });

  it('scopes connected operations to the authenticated user connection', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({ userId: 'user-a', status: TelegramConnectionStatus.CONNECTED, encryptedSession: 'encrypted:session-string' });
    client.search.mockResolvedValue([]);
    await expect(service.search('user-a', { q: 'aziz', limit: 10 } as any)).resolves.toEqual([]);
    expect(client.search).toHaveBeenCalledWith('session-string', 'aziz', 10);
    prisma.telegramConnection.findUnique.mockResolvedValue(null);
    await expect(service.search('user-b', { q: 'aziz', limit: 10 } as any)).rejects.toThrow('Telegram account is not connected');
  });

  it.each([
    ['timeout', new TelegramAdapterError('UNAVAILABLE')],
    ['peer not found', new TelegramAdapterError('PEER_NOT_FOUND')],
    ['flood wait', new TelegramAdapterError('FLOOD_WAIT', 30)],
  ])('keeps CONNECTED on temporary %s errors', async (_label, error) => {
    prisma.telegramConnection.findUnique.mockResolvedValue({ userId: 'user-a', status: TelegramConnectionStatus.CONNECTED, encryptedSession: 'encrypted:session-string' });
    client.search.mockRejectedValue(error);
    await expect(service.search('user-a', { q: 'aziz', limit: 10 } as any)).rejects.toBeDefined();
    expect(prisma.telegramConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-a', status: TelegramConnectionStatus.CONNECTED },
      data: expect.not.objectContaining({ status: TelegramConnectionStatus.DISCONNECTED }),
    }));
  });

  it('clears the stored session only when Telegram rejects the auth key', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({ userId: 'user-a', status: TelegramConnectionStatus.CONNECTED, encryptedSession: 'encrypted:session-string' });
    client.validateSession.mockRejectedValue(new TelegramAdapterError('CONNECTION_EXPIRED'));
    await expect(service.search('user-a', { q: 'aziz', limit: 10 } as any)).rejects.toBeDefined();
    expect(prisma.telegramConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: TelegramConnectionStatus.DISCONNECTED, encryptedSession: null }),
    }));
  });

  it('restores CONNECTED from the encrypted DB session during status validation', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({ userId: 'user-a', status: TelegramConnectionStatus.CONNECTED, encryptedSession: 'encrypted:persistent-session', username: 'old', displayName: 'Old' });
    await expect(service.status('user-a')).resolves.toMatchObject({ connected: true, status: TelegramConnectionStatus.CONNECTED, temporaryError: false });
    expect(client.validateSession).toHaveBeenCalledWith('persistent-session');
  });

  it('reports a temporary status error without changing CONNECTED', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({ userId: 'user-a', status: TelegramConnectionStatus.CONNECTED, encryptedSession: 'encrypted:persistent-session' });
    client.validateSession.mockRejectedValue(new TelegramAdapterError('UNAVAILABLE'));
    await expect(service.status('user-a')).resolves.toMatchObject({ connected: true, status: TelegramConnectionStatus.CONNECTED, temporaryError: true });
    expect(prisma.telegramConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a', status: TelegramConnectionStatus.CONNECTED } }));
  });

  it('manual disconnect revokes best effort and clears all auth state', async () => {
    prisma.telegramConnection.findUnique.mockResolvedValue({ userId: 'user-a', encryptedSession: 'encrypted:persistent-session' });
    client.logout.mockRejectedValue(new TelegramAdapterError('UNAVAILABLE'));
    await expect(service.disconnect('user-a')).resolves.toEqual({ status: 'disconnected' });
    expect(prisma.telegramConnection.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ encryptedSession: null, encryptedPhoneCodeHash: null, status: TelegramConnectionStatus.DISCONNECTED }) }));
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

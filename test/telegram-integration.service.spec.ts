import { TelegramConnectionStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { TelegramIntegrationService } from '../src/telegram/telegram-integration.service';

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
    beginLogin: jest.fn(), verifyCode: jest.fn(), verifyPassword: jest.fn(), logout: jest.fn(),
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
    client.beginLogin.mockResolvedValue({ session: 'session-string', phoneCodeHash: 'hash' });
    prisma.telegramConnection.upsert.mockResolvedValue(undefined);
    await expect(service.connect('user-a', '+998901234567')).resolves.toEqual({ status: 'code_required' });
    expect(prisma.telegramConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: TelegramConnectionStatus.AWAITING_CODE, encryptedSession: 'encrypted:session-string', encryptedPhoneCodeHash: 'encrypted:hash', phoneNumber: 'encrypted:+998901234567' }),
    }));
    expect(JSON.stringify(prisma.telegramConnection.upsert.mock.calls[0])).not.toContain('CODE-SECRET');
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
});

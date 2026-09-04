import { TelegramController } from '../src/telegram/telegram.controller';

describe('TelegramController', () => {
  const telegram = {
    prepareTelegramMessage: jest.fn(),
    sendMessage: jest.fn(),
    resendCode: jest.fn(),
    restartCode: jest.fn(),
  } as any;
  const controller = new TelegramController(telegram, { isAllowed: () => true } as any);

  beforeEach(() => jest.clearAllMocks());

  it('returns a preview and never sends without confirmation', async () => {
    telegram.prepareTelegramMessage.mockResolvedValue({ recipient: { displayName: 'Aziz' }, text: 'Hello', confirmationRequired: true });
    await expect(controller.send({ sub: 'user-a', role: 'USER' }, { peerId: 'user:1', text: 'Hello', confirmed: false })).resolves.toEqual({
      status: 'confirmation_required', preview: expect.objectContaining({ confirmationRequired: true }),
    });
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('sends only after explicit confirmation', async () => {
    telegram.prepareTelegramMessage.mockResolvedValue({ recipient: { displayName: 'Aziz' }, text: 'Hello', confirmationRequired: true });
    telegram.sendMessage.mockResolvedValue({ messageId: 'message-1' });
    await expect(controller.send({ sub: 'user-a', role: 'USER' }, { peerId: 'user:1', text: 'Hello', confirmed: true })).resolves.toEqual({ status: 'sent', messageId: 'message-1' });
    expect(telegram.sendMessage).toHaveBeenCalledWith('user-a', 'user:1', 'Hello');
  });

  it('delegates resend-code to the integration service for the authenticated user', async () => {
    telegram.resendCode.mockResolvedValue({ status: 'code_required', delivery: 'sms', nextDelivery: 'call', timeoutSeconds: 90 });
    await expect(controller.resendCode({ sub: 'user-a', role: 'USER' })).resolves.toEqual({
      status: 'code_required', delivery: 'sms', nextDelivery: 'call', timeoutSeconds: 90,
    });
    expect(telegram.resendCode).toHaveBeenCalledWith('user-a');
  });

  it('delegates fresh-code restart to the integration service for the authenticated user', async () => {
    telegram.restartCode.mockResolvedValue({ status: 'code_required', delivery: 'telegram_app', nextDelivery: null, timeoutSeconds: null });
    await expect(controller.restartCode({ sub: 'user-a', role: 'USER' })).resolves.toEqual({
      status: 'code_required', delivery: 'telegram_app', nextDelivery: null, timeoutSeconds: null,
    });
    expect(telegram.restartCode).toHaveBeenCalledWith('user-a');
  });

  it('delegates QR start and status using only the authenticated user scope', async () => {
    telegram.startQrLogin = jest.fn().mockResolvedValue({ status: 'pending', qrUrl: 'tg://login?token=safe', expiresAt: '2030-01-01T00:00:00.000Z' });
    telegram.qrStatus = jest.fn().mockResolvedValue({ status: 'success' });
    await expect(controller.startQrLogin({ sub: 'user-a', role: 'USER' })).resolves.toMatchObject({ status: 'pending' });
    await expect(controller.qrStatus({ sub: 'user-a', role: 'USER' })).resolves.toEqual({ status: 'success' });
    expect(telegram.startQrLogin).toHaveBeenCalledWith('user-a');
    expect(telegram.qrStatus).toHaveBeenCalledWith('user-a');
  });
});

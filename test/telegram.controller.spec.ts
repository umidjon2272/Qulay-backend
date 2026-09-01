import { TelegramController } from '../src/telegram/telegram.controller';

describe('TelegramController', () => {
  const telegram = {
    prepareTelegramMessage: jest.fn(),
    sendMessage: jest.fn(),
    resendCode: jest.fn(),
  } as any;
  const diagnostic = { sendCode: jest.fn() } as any;
  const controller = new TelegramController(telegram, { isAllowed: () => true } as any, diagnostic);

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

  it('runs the temporary send-code diagnostic for an authenticated user without passing user data onward', async () => {
    diagnostic.sendCode.mockResolvedValue({ connected: true, authorized: false, returnedType: 'auth.SentCode', nextType: null, timeout: null, selectedDc: 2 });
    await expect(controller.diagnosticSendCode({ sub: 'user-a', role: 'USER' }, { phoneNumber: '+998901234567' })).resolves.toEqual({
      connected: true, authorized: false, returnedType: 'auth.SentCode', nextType: null, timeout: null, selectedDc: 2,
    });
    expect(diagnostic.sendCode).toHaveBeenCalledWith('+998901234567');
  });
});

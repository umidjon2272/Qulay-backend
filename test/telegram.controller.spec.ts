import { TelegramController } from '../src/telegram/telegram.controller';

describe('TelegramController', () => {
  const telegram = {
    prepareTelegramMessage: jest.fn(),
    sendMessage: jest.fn(),
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
});

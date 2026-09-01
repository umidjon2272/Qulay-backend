import { Api, TelegramClient } from 'telegram';
import { TelegramDiagnosticService } from '../src/telegram/telegram-diagnostic.service';

describe('TelegramDiagnosticService', () => {
  const config = {
    get: jest.fn((key: string) => key === 'telegram.apiId' ? 12345 : key === 'telegram.apiHash' ? 'test-api-hash' : undefined),
  } as any;

  afterEach(() => jest.restoreAllMocks());

  it('uses a fresh official GramJS client, minimal CodeSettings, and disconnects', async () => {
    const connect = jest.spyOn(TelegramClient.prototype, 'connect').mockResolvedValue(true);
    jest.spyOn(TelegramClient.prototype, 'checkAuthorization').mockResolvedValue(false);
    const invoke = jest.spyOn(TelegramClient.prototype, 'invoke').mockResolvedValue(new Api.auth.SentCode({
      type: new Api.auth.SentCodeTypeApp({ length: 5 }),
      phoneCodeHash: 'must-not-be-returned',
    }) as never);
    const disconnect = jest.spyOn(TelegramClient.prototype, 'disconnect').mockResolvedValue(undefined);

    const service = new TelegramDiagnosticService(config);
    await expect(service.sendCode('+998901234567')).resolves.toEqual({
      connected: true,
      authorized: false,
      returnedType: 'auth.SentCode',
      nextType: null,
      timeout: null,
      selectedDc: null,
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      phoneNumber: '+998901234567',
      apiId: 12345,
      apiHash: 'test-api-hash',
      settings: expect.any(Api.CodeSettings),
    }));
    expect((invoke.mock.calls[0][0] as Api.auth.SendCode).settings).toEqual(new Api.CodeSettings({}));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('returns a redacted error and still disconnects when Telegram rejects sendCode', async () => {
    jest.spyOn(TelegramClient.prototype, 'connect').mockResolvedValue(true);
    jest.spyOn(TelegramClient.prototype, 'checkAuthorization').mockResolvedValue(false);
    jest.spyOn(TelegramClient.prototype, 'invoke').mockRejectedValue(new Error('PHONE +998901234567 HASH secret-value'));
    const disconnect = jest.spyOn(TelegramClient.prototype, 'disconnect').mockResolvedValue(undefined);

    const service = new TelegramDiagnosticService(config);
    await expect(service.sendCode('+998901234567')).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'Telegram diagnostic request failed' }),
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

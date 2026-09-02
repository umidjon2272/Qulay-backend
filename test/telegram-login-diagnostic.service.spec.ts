import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConnectTelegramDto } from '../src/telegram/dto/telegram.dto';
import { TelegramLoginDiagnosticService } from '../src/telegram/telegram-login-diagnostic.service';

describe('TelegramLoginDiagnosticService', () => {
  const result = {
    session: 'private-session', phoneCodeHash: 'private-code-hash', delivery: 'telegram_app' as const,
    nextDelivery: null, timeoutSeconds: null, rawType: 'auth.SentCodeTypeApp', rawNextType: null, selectedDcId: 2,
  };

  it('is off by default and never calls Telegram', async () => {
    const client = { beginLogin: jest.fn() };
    const service = new TelegramLoginDiagnosticService(new ConfigService({ telegram: {} }), client as never);
    await expect(service.run('admin-a')).rejects.toBeInstanceOf(NotFoundException);
    expect(client.beginLogin).not.toHaveBeenCalled();
  });

  it('uses only TEST_TELEGRAM_PHONE, returns no auth material, and blocks repetition', async () => {
    const client = { beginLogin: jest.fn().mockResolvedValue(result) };
    const service = new TelegramLoginDiagnosticService(new ConfigService({ telegram: { loginDiagnosticEnabled: true, testPhone: '+998901234567' }, deploymentVersion: 'commit123' }), client as never);
    const logger = (service as unknown as { logger: { log: (...args: unknown[]) => void } }).logger;
    const log = jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    const response = await service.run('admin-a');
    expect(client.beginLogin).toHaveBeenCalledWith('+998901234567', 'diagnostic:admin-a');
    expect(response).toEqual(expect.objectContaining({ accepted: true, deploymentVersion: 'commit123' }));
    expect(JSON.stringify(response)).not.toContain('private-session');
    expect(JSON.stringify(response)).not.toContain('private-code-hash');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ delivery: 'telegram_app', rawType: 'auth.SentCodeTypeApp', dc: 2, timeout: null }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('+998901234567');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-code-hash');
    await expect(service.run('admin-a')).rejects.toBeInstanceOf(ConflictException);
    expect(client.beginLogin).toHaveBeenCalledTimes(1);
  });

  it('rejects parallel clicks before a second code request', async () => {
    let release!: (value: typeof result) => void;
    const client = { beginLogin: jest.fn(() => new Promise<typeof result>((resolve) => { release = resolve; })) };
    const service = new TelegramLoginDiagnosticService(new ConfigService({ telegram: { loginDiagnosticEnabled: true, testPhone: '+998901234567' } }), client as never);
    const first = service.run('admin-a');
    await expect(service.run('admin-a')).rejects.toBeInstanceOf(ConflictException);
    release(result);
    await first;
    expect(client.beginLogin).toHaveBeenCalledTimes(1);
  });

  it('normalizes the website phone input to the same E.164 form before beginLogin', async () => {
    const dto = plainToInstance(ConnectTelegramDto, { phoneNumber: ' 00 998 (90) 123-45-67 ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.phoneNumber).toBe('+998901234567');
  });
});

import { classifyTelegramError, mapTelegramError, TelegramAdapterError } from '../src/telegram/telegram.errors';

describe('Telegram error mapping', () => {
  it('maps flood wait without exposing raw library errors', () => {
    const error = mapTelegramError(new TelegramAdapterError('FLOOD_WAIT', 42));
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({ retryAfterSeconds: 42 });
  });

  it('maps invalid code to a user-safe 400 response', () => {
    const error = mapTelegramError(new TelegramAdapterError('INVALID_CODE'));
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ message: 'Invalid Telegram code', statusCode: 400 });
  });

  it('maps Telegram phone-number flood and app-update errors to Uzbek, user-friendly messages', () => {
    expect(mapTelegramError(new TelegramAdapterError('PHONE_NUMBER_FLOOD')).getStatus()).toBe(429);
    const updateApp = mapTelegramError(new TelegramAdapterError('UPDATE_APP_TO_LOGIN'));
    expect(updateApp.getStatus()).toBe(400);
    expect((updateApp.getResponse() as { message: string }).message).toContain('Telegram ilovasini yangilash');
  });

  it('classifies raw Telegram RPC error strings into adapter error codes', () => {
    expect(classifyTelegramError({ errorMessage: 'PHONE_NUMBER_FLOOD' }).code).toBe('PHONE_NUMBER_FLOOD');
    expect(classifyTelegramError({ errorMessage: 'SMS_CODE_CREATE_FAILED' }).code).toBe('SMS_CODE_CREATE_FAILED');
    expect(classifyTelegramError({ errorMessage: 'UPDATE_APP_TO_LOGIN' }).code).toBe('UPDATE_APP_TO_LOGIN');
    expect(classifyTelegramError({ errorMessage: 'FLOOD_WAIT_30' })).toMatchObject({ code: 'FLOOD_WAIT', retryAfterSeconds: 30 });
    expect(classifyTelegramError({ errorMessage: 'PHONE_CODE_EXPIRED' }).code).toBe('EXPIRED_CODE');
  });
});

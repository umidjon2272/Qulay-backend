import { mapTelegramError, TelegramAdapterError } from '../src/telegram/telegram.errors';

describe('Telegram error mapping', () => {
  it('maps flood wait without exposing raw library errors', () => {
    const error = mapTelegramError(new TelegramAdapterError('FLOOD_WAIT', 42));
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toEqual({ message: 'Telegram rate limit reached', retryAfterSeconds: 42 });
  });

  it('maps invalid code to a user-safe 400 response', () => {
    const error = mapTelegramError(new TelegramAdapterError('INVALID_CODE'));
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ message: 'Invalid Telegram code', statusCode: 400 });
  });
});

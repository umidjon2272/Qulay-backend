import { Api, TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';

const requireEnvironment = (name: 'TELEGRAM_API_ID' | 'TELEGRAM_API_HASH' | 'TEST_TELEGRAM_PHONE'): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const run = async (): Promise<void> => {
  const apiIdText = requireEnvironment('TELEGRAM_API_ID');
  const apiHash = requireEnvironment('TELEGRAM_API_HASH');
  const phoneNumber = requireEnvironment('TEST_TELEGRAM_PHONE').trim();
  const apiId = Number(apiIdText);

  if (!/^\d+$/.test(apiIdText) || !Number.isSafeInteger(apiId) || apiId <= 0) {
    throw new Error('TELEGRAM_API_ID must be a positive integer');
  }
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new Error('TEST_TELEGRAM_PHONE must use international E.164 format');
  }

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
  });
  client.setLogLevel(LogLevel.NONE);

  let connected = false;
  try {
    await client.connect();
    connected = true;
    const authorized = await client.checkAuthorization();

    console.log({
      connected,
      authorized,
      selectedDc: client.session.dcId || null,
    });

    if (authorized) {
      throw new Error('Fresh empty session unexpectedly reported authorization; sendCode was not called');
    }

    const result = await client.invoke(new Api.auth.SendCode({
      phoneNumber,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({}),
    }));

    console.log({
      connected,
      authorized,
      returnedConstructorType: result.className,
      nextType: result instanceof Api.auth.SentCode ? result.nextType?.className ?? null : null,
      timeout: result instanceof Api.auth.SentCode ? result.timeout ?? null : null,
      selectedDc: client.session.dcId || null,
    });
  } finally {
    if (connected) await client.disconnect();
  }
};

void run().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'UnknownError';
  console.error({ diagnosticFailed: true, errorType: name });
  process.exitCode = 1;
});

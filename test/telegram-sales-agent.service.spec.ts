import { TelegramConnectionStatus } from '@prisma/client';
import { TelegramSalesAgentService } from '../src/telegram/telegram-sales-agent.service';

describe('TelegramSalesAgentService', () => {
  const listenerStop = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    telegramConnection: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    telegramSalesSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    conversation: { create: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn({
      telegramSalesSession: prisma.telegramSalesSession,
      conversation: prisma.conversation,
    })),
  } as any;
  const crypto = { decrypt: jest.fn((value: string) => value) } as any;
  const listenerHealth = jest.fn().mockResolvedValue(true);
  const telegramClient = { listenIncomingMessages: jest.fn().mockResolvedValue({ stop: listenerStop, health: listenerHealth }) } as any;
  const telegram = { sendMessage: jest.fn().mockResolvedValue({}) } as any;
  const ai = { chat: jest.fn().mockResolvedValue({ message: 'Ha, mavjud.', pendingConfirmation: null }) } as any;
  const voice = { transcribeSalesVoice: jest.fn().mockResolvedValue({ text: 'Coladan 20 ta bormi?' }) } as any;
  const subscriptions = { assertFeatureAllowed: jest.fn().mockResolvedValue(undefined), assertAiAllowed: jest.fn().mockResolvedValue(undefined) } as any;
  const bitoTools = { getFullInventorySnapshot: jest.fn().mockResolvedValue({ matchedCount: 1, items: [] }) } as any;
  let service: TelegramSalesAgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.telegramConnection.findMany.mockResolvedValue([]);
    prisma.telegramConnection.findUnique.mockResolvedValue({
      status: TelegramConnectionStatus.CONNECTED,
      encryptedSession: 'session',
      salesAgentEnabled: true,
      salesPrivateChats: true,
      salesGroups: true,
      salesAllowedGroupIds: ['-100777'],
      salesVoiceEnabled: true,
      salesVoiceMaxSeconds: 60,
    });
    service = new TelegramSalesAgentService(prisma, crypto, telegramClient, telegram, ai, voice, subscriptions, bitoTools);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('isolates group sales conversations by sender identity', () => {
    const base = {
      peer: { peerId: '-100777', type: 'GROUP', displayName: 'Sales group', username: null, lastActivity: null },
      messageId: 1,
      senderUsername: null,
      senderDisplayName: 'Customer',
      senderIsBot: false,
      senderIsContact: false,
      hadPriorConversation: false,
      recentOutgoingCount: 0,
      recentIncomingCount: 0,
      text: 'Cola bormi?',
      mentioned: true,
      replyToOwnMessage: false,
      voice: null,
      receivedAt: new Date().toISOString(),
    } as any;
    const first = (service as any).salesSessionPeerId({ ...base, senderId: '101' });
    const second = (service as any).salesSessionPeerId({ ...base, senderId: '202' });
    expect(first).toBe('-100777:101');
    expect(second).toBe('-100777:202');
    expect(first).not.toBe(second);
  });

  it('does not process anonymous group messages because customer isolation cannot be guaranteed', async () => {
    const ensure = jest.spyOn(service as any, 'ensureSalesSession');
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '-100777', type: 'GROUP', displayName: 'Sales group', username: null, lastActivity: null },
      messageId: 2,
      senderId: null,
      senderUsername: null,
      senderDisplayName: null,
      senderIsBot: false,
      senderIsContact: false,
      hadPriorConversation: false,
      recentOutgoingCount: 0,
      recentIncomingCount: 0,
      text: 'Cola bormi?',
      mentioned: true,
      replyToOwnMessage: false,
      voice: null,
      receivedAt: new Date().toISOString(),
    });
    expect(ensure).not.toHaveBeenCalled();
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('rejects Telegram voice notes longer than 60 seconds without transcribing them', async () => {
    jest.spyOn(service as any, 'ensureSalesSession').mockResolvedValue({ id: 'sales-session', conversationId: 'conversation', lastInboundMessageId: null });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '55', type: 'USER', displayName: 'Customer', username: '@customer', lastActivity: null },
      messageId: 3,
      senderId: '55',
      senderUsername: '@customer',
      senderDisplayName: 'Customer',
      senderIsBot: false,
      senderIsContact: false,
      hadPriorConversation: false,
      recentOutgoingCount: 0,
      recentIncomingCount: 0,
      text: '',
      mentioned: false,
      replyToOwnMessage: false,
      voice: { durationSeconds: 61, mimeType: 'audio/ogg', download: jest.fn() },
      receivedAt: new Date().toISOString(),
    });
    expect(voice.transcribeSalesVoice).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith('owner-a', '55', expect.stringContaining('60 soniyadan uzun'));
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('transcribes an allowed voice note and sends a text AI reply', async () => {
    jest.spyOn(service as any, 'ensureSalesSession').mockResolvedValue({ id: 'sales-session', conversationId: 'conversation', lastInboundMessageId: null });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    const download = jest.fn().mockResolvedValue(Buffer.from('voice'));
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '55', type: 'USER', displayName: 'Customer', username: '@customer', lastActivity: null },
      messageId: 4,
      senderId: '55',
      senderUsername: '@customer',
      senderDisplayName: 'Customer',
      senderIsBot: false,
      senderIsContact: false,
      hadPriorConversation: false,
      recentOutgoingCount: 0,
      recentIncomingCount: 0,
      text: '',
      mentioned: false,
      replyToOwnMessage: false,
      voice: { durationSeconds: 12, mimeType: 'audio/ogg', download },
      receivedAt: new Date().toISOString(),
    });
    expect(voice.transcribeSalesVoice).toHaveBeenCalledWith('owner-a', expect.objectContaining({ mimetype: 'audio/ogg' }), 12);
    expect(ai.chat).toHaveBeenCalledWith(
      'owner-a',
      expect.objectContaining({ message: 'Coladan 20 ta bormi?', conversationId: 'conversation', voice: true }),
      undefined,
      undefined,
      expect.objectContaining({ externalSales: true, channel: 'TELEGRAM' }),
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith('owner-a', '55', 'Ha, mavjud.');
  });

  it('ignores greetings and personal chat from an existing contact', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue(null);
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '77', type: 'USER', displayName: 'Friend', username: '@friend', lastActivity: null },
      messageId: 7,
      senderId: '77',
      senderUsername: '@friend',
      senderDisplayName: 'Friend',
      senderIsBot: false,
      senderIsContact: true,
      hadPriorConversation: true,
      recentOutgoingCount: 5,
      recentIncomingCount: 5,
      text: 'Salom brat, qalesan?',
      mentioned: false,
      replyToOwnMessage: false,
      voice: null,
      receivedAt: new Date().toISOString(),
    });
    expect(ai.chat).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('does not hijack an established personal contact on a vague availability phrase', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue(null);
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '88', type: 'USER', displayName: 'Friend', username: '@friend', lastActivity: null },
      messageId: 8,
      senderId: '88',
      senderUsername: '@friend',
      senderDisplayName: 'Friend',
      senderIsBot: false,
      senderIsContact: true,
      hadPriorConversation: true,
      recentOutgoingCount: 2,
      recentIncomingCount: 3,
      text: 'Coca Cola bormi?',
      mentioned: false,
      replyToOwnMessage: false,
      voice: null,
      receivedAt: new Date().toISOString(),
    });
    expect(ai.chat).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('activates for strong commercial intent even when the customer is saved as a contact', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue(null);
    jest.spyOn(service as any, 'ensureSalesSession').mockResolvedValue({
      id: 'sales-session-2', conversationId: 'conversation-2', lastInboundMessageId: null, salesContextUntil: null, ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockImplementation(async ({ data }: any) => ({
      id: 'sales-session-2', conversationId: 'conversation-2', lastInboundMessageId: null, ownerPausedUntil: null, ...data,
    }));
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '89', type: 'USER', displayName: 'Saved customer', username: '@customer', lastActivity: null },
      messageId: 9,
      senderId: '89',
      senderUsername: '@customer',
      senderDisplayName: 'Saved customer',
      senderIsBot: false,
      senderIsContact: true,
      hadPriorConversation: true,
      recentOutgoingCount: 2,
      recentIncomingCount: 3,
      text: 'Coca Cola narxi qancha? 20 ta kerak',
      mentioned: false,
      replyToOwnMessage: false,
      voice: null,
      receivedAt: new Date().toISOString(),
    });
    expect(ai.chat).toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith('owner-a', '89', 'Ha, mavjud.');
  });

  it('ignores messages from groups that are not explicitly allowed', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue(null);
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '-100999', type: 'GROUP', displayName: 'Private group', username: null, lastActivity: null },
      messageId: 10, senderId: '101', senderUsername: '@customer', senderDisplayName: 'Customer', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: false, recentOutgoingCount: 0, recentIncomingCount: 0,
      text: 'Coca Cola narxi qancha?', mentioned: true, replyToOwnMessage: false, voice: null, receivedAt: new Date().toISOString(),
    });
    expect(ai.chat).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('does not trigger on a casual bormi phrase in an allowed group when Bito has no matching product', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue(null);
    bitoTools.getFullInventorySnapshot.mockResolvedValueOnce({ matchedCount: 0, items: [] });
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '-100777', type: 'GROUP', displayName: 'Sales group', username: null, lastActivity: null },
      messageId: 11, senderId: '101', senderUsername: '@customer', senderDisplayName: 'Customer', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: false, recentOutgoingCount: 0, recentIncomingCount: 0,
      text: 'Ali bormi?', mentioned: false, replyToOwnMessage: false, voice: null, receivedAt: new Date().toISOString(),
    });
    expect(ai.chat).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

});

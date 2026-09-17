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
    salesInboundReceipt: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (fn: any) => fn({
      telegramSalesSession: prisma.telegramSalesSession,
      conversation: prisma.conversation,
    })),
  } as any;
  const crypto = { decrypt: jest.fn((value: string) => value) } as any;
  const listenerHealth = jest.fn().mockResolvedValue(true);
  const telegramClient = { listenIncomingMessages: jest.fn().mockResolvedValue({ stop: listenerStop, health: listenerHealth }) } as any;
  const telegram = { sendMessage: jest.fn().mockResolvedValue({}) } as any;
  const ai = {
    chat: jest.fn().mockResolvedValue({ message: 'Ha, mavjud.', pendingConfirmation: null }),
    classifyNewExternalSalesTurn: jest.fn().mockResolvedValue({ sales: true, intent: 'GREETING' }),
  } as any;
  const voice = { transcribeSalesVoice: jest.fn().mockResolvedValue({ text: 'Coladan 20 ta bormi?' }) } as any;
  const vision = { understandProductImage: jest.fn().mockResolvedValue({ summary: 'Qora iPhone rasmi', searchQuery: 'iphone', brand: 'Apple', color: 'qora', confidence: 0.8 }) } as any;
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
    service = new TelegramSalesAgentService(prisma, crypto, telegramClient, telegram, ai, voice, vision, subscriptions, bitoTools);
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
      expect.anything(),
      expect.objectContaining({ externalSales: true, channel: 'TELEGRAM' }),
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith('owner-a', '55', 'Ha, mavjud.');
  });

  it('ignores a saved Telegram contact when no persistent customer sales mode exists', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue(null);
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '77', type: 'USER', displayName: 'Friend', username: '@friend', lastActivity: null },
      messageId: 7, senderId: '77', senderUsername: '@friend', senderDisplayName: 'Friend', senderIsBot: false,
      senderIsContact: true, hadPriorConversation: true, recentOutgoingCount: 5, recentIncomingCount: 5,
      text: 'salom brat qalesan', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(ai.classifyNewExternalSalesTurn).not.toHaveBeenCalled();
    expect(ai.chat).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('semantically opens a new non-contact DM even when the first message is only salom', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue(null);
    jest.spyOn(service as any, 'ensureSalesSession').mockResolvedValue({
      id: 'sales-session-new', conversationId: 'conversation-new', salesState: null, salesContextUntil: null, ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    ai.classifyNewExternalSalesTurn.mockResolvedValueOnce({ sales: true, intent: 'GREETING' });
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '78', type: 'USER', displayName: 'New lead', username: '@lead', lastActivity: null },
      messageId: 71, senderId: '78', senderUsername: '@lead', senderDisplayName: 'New lead', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: false, recentOutgoingCount: 0, recentIncomingCount: 0,
      text: 'Salom', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(ai.classifyNewExternalSalesTurn).toHaveBeenCalledWith('owner-a', 'Salom', expect.anything());
    expect(ai.chat).toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalled();
  });

  it('ignores a new non-contact DM when semantic classification says it is not a customer sales turn', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue(null);
    ai.classifyNewExternalSalesTurn.mockResolvedValueOnce({ sales: false, intent: 'NON_SALES' });
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '79', type: 'USER', displayName: 'Unknown', username: '@unknown', lastActivity: null },
      messageId: 72, senderId: '79', senderUsername: '@unknown', senderDisplayName: 'Unknown', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: false, recentOutgoingCount: 0, recentIncomingCount: 0,
      text: 'kanalga reklama tashlab ber', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(ai.chat).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('persists CUSTOMER/SALES mode before calling AI so a provider failure cannot lose a newly classified lead', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue({
      id: 'legacy-empty-session', conversationId: 'legacy-conversation', salesState: null,
      salesContextUntil: new Date(Date.now() - 86_400_000), ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    ai.classifyNewExternalSalesTurn.mockResolvedValueOnce({ sales: true, intent: 'GREETING' });
    ai.chat.mockRejectedValueOnce(new Error('provider unavailable'));
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '791', type: 'USER', displayName: 'New lead', username: '@lead2', lastActivity: null },
      messageId: 721, senderId: '791', senderUsername: '@lead2', senderDisplayName: 'New lead', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: false, recentOutgoingCount: 0, recentIncomingCount: 1,
      text: 'Salom', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(prisma.telegramSalesSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'legacy-empty-session' },
      data: expect.objectContaining({ salesState: expect.objectContaining({ customer: true, conversationMode: 'SALES', handoffState: 'AI_ACTIVE' }) }),
    }));
    expect(telegram.sendMessage).toHaveBeenCalledWith('owner-a', '791', expect.stringMatching(/uzilish|qayta/i));
  });

  it('keeps a persistent private customer thread even after the old time window expires', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue({
      id: 'sales-session-old', conversationId: 'conversation-old', salesState: { version: 1, product: 'iphone', model: '13 pro' },
      salesContextUntil: new Date(Date.now() - 86_400_000), ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '88', type: 'USER', displayName: 'Customer', username: '@customer', lastActivity: null },
      messageId: 8, senderId: '88', senderUsername: '@customer', senderDisplayName: 'Customer', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: true, recentOutgoingCount: 0, recentIncomingCount: 3,
      text: '2 ta', mentioned: false, replyToOwnMessage: false, voice: null, receivedAt: new Date().toISOString(),
    });
    expect(ai.chat).toHaveBeenCalledWith('owner-a', expect.objectContaining({ message: '2 ta' }), undefined, expect.anything(), expect.objectContaining({
      newSalesEpoch: false, professionalInbox: true, salesState: expect.objectContaining({ product: 'iphone', model: '13 pro' }),
    }));
  });

  it('continues a saved contact only when that thread is already persistent SALES mode', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue({
      id: 'sales-session-contact', conversationId: 'conversation-contact',
      salesState: { version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', model: '13 pro' },
      salesContextUntil: new Date(Date.now() - 86_400_000), ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '89', type: 'USER', displayName: 'Saved customer', username: '@customer', lastActivity: null },
      messageId: 9, senderId: '89', senderUsername: '@customer', senderDisplayName: 'Saved customer', senderIsBot: false,
      senderIsContact: true, hadPriorConversation: true, recentOutgoingCount: 2, recentIncomingCount: 3,
      text: 'qora', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(ai.classifyNewExternalSalesTurn).not.toHaveBeenCalled();
    expect(ai.chat).toHaveBeenCalledWith('owner-a', expect.objectContaining({ message: 'qora' }), undefined, expect.anything(), expect.objectContaining({
      newSalesEpoch: false, professionalInbox: true, salesState: expect.objectContaining({ customer: true, conversationMode: 'SALES' }),
    }));
  });

  it('keeps short follow-ups flowing inside an active selected-group sales conversation', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue({
      id: 'group-sales-session', conversationId: 'group-conversation',
      salesState: { version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', model: '13 pro' },
      salesContextUntil: new Date(Date.now() + 60_000), ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '-100777', type: 'GROUP', displayName: 'Sales group', username: null, lastActivity: null },
      messageId: 731, senderId: '101', senderUsername: '@buyer', senderDisplayName: 'Buyer', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: true, recentOutgoingCount: 0, recentIncomingCount: 3,
      text: 'ha', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(ai.chat).toHaveBeenCalledWith('owner-a', expect.objectContaining({ message: 'ha' }), undefined, expect.anything(), expect.objectContaining({
      externalSales: true, channel: 'TELEGRAM', customer: expect.objectContaining({ peerType: 'GROUP' }),
    }));
    expect(telegram.sendMessage).toHaveBeenCalledWith('owner-a', '-100777', expect.any(String));
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

  it.each(['a', '😂', '128'])('never goes silent on a short active customer follow-up: %s', async (text) => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue({
      id: 'sales-session-short', conversationId: 'conversation-short',
      salesState: { version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', model: '13 pro' },
      salesContextUntil: new Date(Date.now() - 86_400_000), ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '90', type: 'USER', displayName: 'Customer', username: '@customer', lastActivity: null },
      messageId: text === 'a' ? 90 : text === '😂' ? 91 : 92,
      senderId: '90', senderUsername: '@customer', senderDisplayName: 'Customer', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: true, recentOutgoingCount: 0, recentIncomingCount: 5,
      text, mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(ai.classifyNewExternalSalesTurn).not.toHaveBeenCalled();
    expect(ai.chat).toHaveBeenCalledWith('owner-a', expect.objectContaining({ message: text }), undefined, expect.anything(), expect.objectContaining({ professionalInbox: true }));
    expect(telegram.sendMessage).toHaveBeenCalled();
  });

  it('classifies a new non-contact image from its real vision summary instead of inventing a sales question', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue(null);
    vision.understandProductImage.mockResolvedValueOnce({ summary: 'Oilaviy surat', searchQuery: '', confidence: 0.9 });
    ai.classifyNewExternalSalesTurn.mockResolvedValueOnce({ sales: false, intent: 'NON_SALES' });
    const download = jest.fn().mockResolvedValue(Buffer.from('image'));
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '901', type: 'USER', displayName: 'Unknown', username: '@unknownimg', lastActivity: null },
      messageId: 930, senderId: '901', senderUsername: '@unknownimg', senderDisplayName: 'Unknown', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: false, recentOutgoingCount: 0, recentIncomingCount: 0,
      text: '', mentioned: false, replyToOwnMessage: false, voice: null,
      image: { mimeType: 'image/jpeg', download }, receivedAt: new Date().toISOString(),
    });
    expect(ai.classifyNewExternalSalesTurn).toHaveBeenCalledWith('owner-a', expect.stringContaining('Oilaviy surat'), expect.anything());
    expect(ai.chat).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('passes product image understanding into the same persistent Telegram sales brain', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue({
      id: 'sales-session-image', conversationId: 'conversation-image',
      salesState: { version: 1, customer: true, conversationMode: 'SALES', product: 'iphone' },
      salesContextUntil: null, ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    const download = jest.fn().mockResolvedValue(Buffer.from('image'));
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '91', type: 'USER', displayName: 'Customer', username: '@customer', lastActivity: null },
      messageId: 93, senderId: '91', senderUsername: '@customer', senderDisplayName: 'Customer', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: true, recentOutgoingCount: 0, recentIncomingCount: 5,
      text: '', mentioned: false, replyToOwnMessage: false, voice: null,
      image: { mimeType: 'image/jpeg', download }, receivedAt: new Date().toISOString(),
    });
    expect(vision.understandProductImage).toHaveBeenCalledWith('owner-a', expect.objectContaining({ mimeType: 'image/jpeg' }));
    expect(ai.chat).toHaveBeenCalledWith('owner-a', expect.objectContaining({ message: 'Shunaqasi bormi?' }), undefined, expect.anything(), expect.objectContaining({
      visualProductHint: expect.objectContaining({ searchQuery: 'iphone' }),
    }));
  });

  it('ignores Telegram channel posts before creating an inbound sales receipt', async () => {
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '-100555', type: 'CHANNEL', displayName: 'Broadcast', username: '@channel', lastActivity: null },
      messageId: 94, senderId: null, senderUsername: null, senderDisplayName: null, senderIsBot: false,
      senderIsContact: false, hadPriorConversation: false, recentOutgoingCount: 0, recentIncomingCount: 0,
      text: 'iPhone 13 Pro narxi', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(prisma.salesInboundReceipt.create).not.toHaveBeenCalled();
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('persists owner takeover and pauses AI replies for the customer thread', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue({
      id: 'sales-session-owner', conversationId: 'conversation-owner', peerId: '95',
      salesState: { version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', model: '13 pro' },
      salesContextUntil: null, ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    await (service as any).handleOutgoing('owner-a', {
      peer: { peerId: '95', type: 'USER', displayName: 'Customer', username: '@customer', lastActivity: null },
      messageId: 500, sentAt: new Date().toISOString(),
    });
    expect(prisma.telegramSalesSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sales-session-owner' },
      data: expect.objectContaining({
        ownerPausedUntil: expect.any(Date),
        salesState: expect.objectContaining({ handoffState: 'OWNER_PAUSED', conversationMode: 'SALES', salesStage: 'HANDOFF' }),
      }),
    }));
    ai.chat.mockClear();
    telegram.sendMessage.mockClear();
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '95', type: 'USER', displayName: 'Customer', username: '@customer', lastActivity: null },
      messageId: 95, senderId: '95', senderUsername: '@customer', senderDisplayName: 'Customer', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: true, recentOutgoingCount: 1, recentIncomingCount: 6,
      text: 'mayli', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(ai.chat).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('sends a natural fallback instead of going silent when AI fails inside an active customer thread', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue({
      id: 'sales-session-error', conversationId: 'conversation-error',
      salesState: { version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', model: '13 pro' },
      salesContextUntil: null, ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    ai.chat.mockRejectedValueOnce(new Error('provider unavailable'));
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '96', type: 'USER', displayName: 'Customer', username: '@customer', lastActivity: null },
      messageId: 96, senderId: '96', senderUsername: '@customer', senderDisplayName: 'Customer', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: true, recentOutgoingCount: 0, recentIncomingCount: 6,
      text: 'dastavka qlasizmi', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(telegram.sendMessage).toHaveBeenCalledWith('owner-a', '96', expect.stringMatching(/uzilish|qayta/i));
  });

  it('tells an already-confirmed customer about a temporary AI limit instead of silently disappearing', async () => {
    subscriptions.assertFeatureAllowed.mockRejectedValueOnce(new (require('@nestjs/common').ForbiddenException)('limit'));
    prisma.telegramSalesSession.findUnique.mockResolvedValue({
      id: 'sales-session-limit', conversationId: 'conversation-limit',
      salesState: { version: 1, customer: true, conversationMode: 'SALES', product: 'iphone' },
      salesContextUntil: null, ownerPausedUntil: null,
    });
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '970', type: 'USER', displayName: 'Customer', username: '@customer', lastActivity: null },
      messageId: 970, senderId: '970', senderUsername: '@customer', senderDisplayName: 'Customer', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: true, recentOutgoingCount: 0, recentIncomingCount: 5,
      text: 'narxi qancha?', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(telegram.sendMessage).toHaveBeenCalledWith('owner-a', '970', expect.stringMatching(/vaqtinchalik|savolingiz/i));
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('does not send an AI-limit/error message into an unconfirmed personal contact chat', async () => {
    subscriptions.assertFeatureAllowed.mockRejectedValueOnce(new (require('@nestjs/common').ForbiddenException)('limit'));
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '97', type: 'USER', displayName: 'Friend', username: '@friend', lastActivity: null },
      messageId: 97, senderId: '97', senderUsername: '@friend', senderDisplayName: 'Friend', senderIsBot: false,
      senderIsContact: true, hadPriorConversation: true, recentOutgoingCount: 5, recentIncomingCount: 5,
      text: 'salom', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it('persists the seller last question for semantic one-word follow-ups', async () => {
    prisma.telegramSalesSession.findUnique.mockResolvedValue({
      id: 'sales-session-question', conversationId: 'conversation-question',
      salesState: { version: 1, customer: true, conversationMode: 'SALES', product: 'iphone', model: '13 pro' },
      salesContextUntil: null, ownerPausedUntil: null,
    });
    prisma.telegramSalesSession.update.mockResolvedValue({});
    ai.chat.mockResolvedValueOnce({ message: 'Qaysi rang kerak?', pendingConfirmation: null });
    await (service as any).handleIncoming('owner-a', {
      peer: { peerId: '98', type: 'USER', displayName: 'Customer', username: '@customer', lastActivity: null },
      messageId: 98, senderId: '98', senderUsername: '@customer', senderDisplayName: 'Customer', senderIsBot: false,
      senderIsContact: false, hadPriorConversation: true, recentOutgoingCount: 0, recentIncomingCount: 6,
      text: '13 pro', mentioned: false, replyToOwnMessage: false, voice: null, image: null, receivedAt: new Date().toISOString(),
    });
    expect(prisma.telegramSalesSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sales-session-question' },
      data: { salesState: expect.objectContaining({ lastSellerQuestion: 'Qaysi rang kerak?' }) },
    }));
  });

});

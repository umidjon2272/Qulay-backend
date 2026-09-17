import { WhatsAppSalesAgentService } from '../src/whatsapp/whatsapp-sales-agent.service';

describe('WhatsApp sales agent connection defaults', () => {
  it('enables the sales agent on a successful connection', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      whatsAppConnection: {
        upsert,
        findUnique: jest.fn().mockResolvedValue({
          status: 'CONNECTED', displayPhoneNumber: '+998900000000', verifiedName: 'Shop',
          phoneNumberId: 'p1', wabaId: 'w1', webhookSubscribed: true, salesAgentEnabled: true,
          salesOnly: true, salesVoiceEnabled: true, connectedAt: new Date(), lastValidatedAt: new Date(), lastErrorCode: null,
        }),
      },
    };
    const cloud = {
      configured: jest.fn(() => true), embeddedSignupConfigured: jest.fn(() => true),
      verifyPhoneNumber: jest.fn().mockResolvedValue({ phoneNumberId: 'p1', displayPhoneNumber: '+998900000000', verifiedName: 'Shop', qualityRating: null }),
      subscribeWaba: jest.fn().mockResolvedValue(true),
    };
    const crypto = { encrypt: jest.fn(() => 'encrypted') };
    const service = new WhatsAppSalesAgentService(prisma as never, cloud as never, crypto as never, {} as never, {} as never, {} as never, {} as never);

    await service.connect('u', { phoneNumberId: 'p1', wabaId: 'w1', accessToken: 'x'.repeat(30) });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ salesAgentEnabled: true }),
      update: expect.objectContaining({ salesAgentEnabled: true }),
    }));
  });

  it('revalidates an enabled connected WhatsApp account when webhook subscription is stale', async () => {
    const prisma = {
      whatsAppConnection: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'u' }]),
      },
    };
    const cloud = { testConnection: jest.fn().mockResolvedValue({}) };
    const service = new WhatsAppSalesAgentService(prisma as never, cloud as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    await (service as any).reconcileWebhookSubscriptions();

    expect(cloud.testConnection).toHaveBeenCalledWith('u');
  });


  it('routes every short inbound business message to the professional sales brain', async () => {
    const prisma = {
      whatsAppConnection: {
        findUnique: jest.fn().mockResolvedValue({ status: 'CONNECTED', salesAgentEnabled: true, salesOnly: true, salesVoiceEnabled: true }),
      },
      whatsAppSalesSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 's1', conversationId: 'c1', customerName: 'Buyer', salesContextUntil: null, lastInboundAt: null, salesState: null }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const cloud = { sendText: jest.fn().mockResolvedValue({}) };
    const ai = { chat: jest.fn().mockResolvedValue({ message: 'Eshitaman 🙂', pendingConfirmation: null }) };
    const subscriptions = { assertFeatureAllowed: jest.fn().mockResolvedValue(undefined), assertAiAllowed: jest.fn().mockResolvedValue(undefined) };
    const service = new WhatsAppSalesAgentService(prisma as never, cloud as never, {} as never, ai as never, {} as never, {} as never, subscriptions as never);

    await (service as any).processIncoming('u', { id: 'm1', from: '99890', type: 'text', text: { body: 'ha' } }, 'Buyer', { signal: undefined }, 'ha');

    expect(ai.chat).toHaveBeenCalledWith('u', expect.objectContaining({ message: 'ha' }), undefined, undefined, expect.objectContaining({
      externalSales: true, professionalInbox: true, channel: 'WHATSAPP',
    }));
    expect(cloud.sendText).toHaveBeenCalledWith('u', '99890', 'Eshitaman 🙂');
  });

});

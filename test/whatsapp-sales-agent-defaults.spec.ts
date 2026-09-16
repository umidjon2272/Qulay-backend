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

});

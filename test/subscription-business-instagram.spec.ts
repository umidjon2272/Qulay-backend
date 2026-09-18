import { SubscriptionRequestStatus, SubscriptionTier } from '@prisma/client';
import { SUBSCRIPTION_PLANS } from '../src/subscriptions/subscription-plans';
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service';

describe('Business Instagram entitlement', () => {
  it('includes Instagram Sales in the Business plan', () => {
    expect(SUBSCRIPTION_PLANS[SubscriptionTier.BUSINESS].features).toEqual(expect.arrayContaining(['TELEGRAM_SALES', 'WHATSAPP_SALES', 'INSTAGRAM_SALES']));
  });

  it('uses current tier features even when an active entitlement snapshot is older', () => {
    const service = new SubscriptionsService({} as never);
    const plan = (service as unknown as { snapshotToPlan: (value: unknown, tier: SubscriptionTier) => { features: string[] } })
      .snapshotToPlan({
        tier: SubscriptionTier.BUSINESS,
        name: 'Business',
        monthlyPrice: 149000,
        currency: 'UZS',
        isActive: true,
        features: ['AI_CHAT', 'TASKS'],
        limits: {
          aiCreditsPerMonth: 5000,
          toolActionsPerMonth: 25000,
          voiceMinutesPerMonth: 180,
          files: 5000,
          storageMb: 100000,
          memories: 25000,
        },
      }, SubscriptionTier.BUSINESS);

    expect(plan.features).toEqual(expect.arrayContaining(['TELEGRAM_SALES', 'WHATSAPP_SALES', 'INSTAGRAM_SALES']));
  });

  it('never reports an expired database period as an active subscription request context', async () => {
    const row = {
      id: 'request-1', tier: SubscriptionTier.PRO, status: SubscriptionRequestStatus.PENDING,
      requestedAt: new Date(), reviewedAt: null, reviewedBy: null, userId: 'user-1',
      user: { id: 'user-1', email: 'u@example.com', firstName: 'U', lastName: 'One', subscription: { tier: SubscriptionTier.STARTER, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() - 1000) } },
      reviewer: null,
    };
    const prisma = { subscriptionRequest: { findMany: jest.fn().mockResolvedValue([row]) } };
    const service = new SubscriptionsService(prisma as never);
    jest.spyOn(service as never, 'getPlan').mockResolvedValue({ tier: SubscriptionTier.PRO } as never);

    const result = await service.listRequests();

    expect(result[0].user.subscription).toMatchObject({ status: 'EXPIRED', active: false });
  });
});

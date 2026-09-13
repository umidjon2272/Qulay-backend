-- QULAY AI paid subscription approval + Sales AI plan.
CREATE TYPE "SubscriptionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

CREATE TABLE "SubscriptionRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "status" "SubscriptionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubscriptionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionRequest_status_requestedAt_idx" ON "SubscriptionRequest"("status", "requestedAt");
CREATE INDEX "SubscriptionRequest_userId_requestedAt_idx" ON "SubscriptionRequest"("userId", "requestedAt");

ALTER TABLE "SubscriptionRequest" ADD CONSTRAINT "SubscriptionRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionRequest" ADD CONSTRAINT "SubscriptionRequest_reviewedBy_fkey"
FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserSubscription" ADD COLUMN "bonusCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserSubscription" ALTER COLUMN "status" SET DEFAULT 'EXPIRED';

-- Disable the old automatic free access. STARTER used to be free, so legacy
-- STARTER/TRIALING access must not survive this migration. Users can request
-- the new paid Start plan and an admin can activate it for one month.
UPDATE "UserSubscription"
SET "status" = 'EXPIRED', "trialEndsAt" = NULL, "currentPeriodEnd" = NULL
WHERE "status" = 'TRIALING' OR ("tier" = 'STARTER' AND "status" = 'ACTIVE');

-- Replace the old free/legacy prices with the agreed paid QULAY AI tariffs.
UPDATE "SubscriptionPlanConfig"
SET "name" = 'Start', "monthlyPrice" = 49000, "aiCreditsPerMonth" = 800, "voiceMinutesPerMonth" = 20
WHERE "tier" = 'STARTER';

UPDATE "SubscriptionPlanConfig"
SET "name" = 'Pro', "monthlyPrice" = 89000, "aiCreditsPerMonth" = 2500, "voiceMinutesPerMonth" = 90
WHERE "tier" = 'PRO';

UPDATE "SubscriptionPlanConfig"
SET "name" = 'Business', "monthlyPrice" = 149000, "aiCreditsPerMonth" = 5000, "voiceMinutesPerMonth" = 180
WHERE "tier" = 'BUSINESS';

INSERT INTO "SubscriptionPlanConfig" (
  "tier", "name", "monthlyPrice", "currency", "aiCreditsPerMonth", "toolActionsPerMonth",
  "voiceMinutesPerMonth", "files", "storageMb", "memories", "isActive", "createdAt", "updatedAt"
) VALUES (
  'SALES_AI', 'Sales AI', 199000, 'UZS', 8000, 25000, 300, 5000, 100000, 25000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("tier") DO NOTHING;

-- Existing explicitly active paid subscriptions keep their current period, but
-- their entitlement snapshot must match the new tariff limits. Otherwise the
-- old Pro/Business snapshot would continue exposing legacy credits/voice limits
-- until renewal even though the public tariff has changed.
UPDATE "UserSubscription" AS s
SET "entitlementSnapshot" = jsonb_build_object(
  'tier', p."tier",
  'name', p."name",
  'monthlyPrice', p."monthlyPrice",
  'currency', p."currency",
  'isActive', p."isActive",
  'limits', jsonb_build_object(
    'aiCreditsPerMonth', p."aiCreditsPerMonth",
    'toolActionsPerMonth', p."toolActionsPerMonth",
    'voiceMinutesPerMonth', p."voiceMinutesPerMonth",
    'files', p."files",
    'storageMb', p."storageMb",
    'memories', p."memories"
  )
)
FROM "SubscriptionPlanConfig" AS p
WHERE s."tier" = p."tier" AND s."status" = 'ACTIVE';

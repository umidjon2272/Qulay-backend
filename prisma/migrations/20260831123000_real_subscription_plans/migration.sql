ALTER TABLE "AiUsage" ADD COLUMN "creditUnits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserSubscription" ADD COLUMN "entitlementSnapshot" JSONB;

CREATE TABLE "SubscriptionPlanConfig" (
  "tier" "SubscriptionTier" NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "monthlyPrice" INTEGER NOT NULL DEFAULT 0,
  "currency" "FinanceCurrency" NOT NULL DEFAULT 'UZS',
  "aiCreditsPerMonth" INTEGER NOT NULL DEFAULT 100,
  "toolActionsPerMonth" INTEGER NOT NULL DEFAULT 250,
  "voiceMinutesPerMonth" INTEGER NOT NULL DEFAULT 30,
  "files" INTEGER NOT NULL DEFAULT 25,
  "storageMb" INTEGER NOT NULL DEFAULT 1000,
  "memories" INTEGER NOT NULL DEFAULT 200,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlanConfig_pkey" PRIMARY KEY ("tier")
);

ALTER TABLE "SubscriptionPlanConfig" ADD CONSTRAINT "SubscriptionPlanConfig_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SubscriptionPlanConfig" ("tier","name","monthlyPrice","currency","aiCreditsPerMonth","toolActionsPerMonth","voiceMinutesPerMonth","files","storageMb","memories","updatedAt") VALUES
('STARTER','Starter',0,'UZS',100,250,30,25,1000,200,CURRENT_TIMESTAMP),
('PRO','Pro',199000,'UZS',2000,5000,300,500,20000,5000,CURRENT_TIMESTAMP),
('BUSINESS','Business',499000,'UZS',10000,25000,1200,5000,100000,25000,CURRENT_TIMESTAMP)
ON CONFLICT ("tier") DO NOTHING;

UPDATE "AiUsage" SET "creditUnits" = 1 WHERE "type" = 'TEXT' AND "creditUnits" = 0;

UPDATE "UserSubscription" s SET "entitlementSnapshot" = jsonb_build_object(
  'tier', p."tier", 'name', p."name", 'monthlyPrice', p."monthlyPrice", 'currency', p."currency",
  'limits', jsonb_build_object('aiCreditsPerMonth', p."aiCreditsPerMonth", 'toolActionsPerMonth', p."toolActionsPerMonth", 'voiceMinutesPerMonth', p."voiceMinutesPerMonth", 'files', p."files", 'storageMb', p."storageMb", 'memories', p."memories")
) FROM "SubscriptionPlanConfig" p WHERE s."tier" = p."tier" AND s."status" = 'ACTIVE' AND s."entitlementSnapshot" IS NULL;

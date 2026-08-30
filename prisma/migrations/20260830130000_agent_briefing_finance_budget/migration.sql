CREATE TYPE "BriefingType" AS ENUM ('MORNING', 'EVENING');
CREATE TYPE "BriefingDeliveryStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "SuggestionSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "SuggestionStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'SNOOZED', 'RESOLVED');

ALTER TABLE "GoogleConnection"
  ADD COLUMN "lastErrorAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCode" VARCHAR(100);

CREATE TABLE "FinanceBudget" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "categoryId" UUID,
  "currency" "FinanceCurrency" NOT NULL,
  "monthKey" VARCHAR(7) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentPreference" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "morningBriefingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "morningBriefingTime" VARCHAR(5) NOT NULL DEFAULT '08:00',
  "eveningSummaryEnabled" BOOLEAN NOT NULL DEFAULT true,
  "eveningSummaryTime" VARCHAR(5) NOT NULL DEFAULT '21:00',
  "telegramDelivery" BOOLEAN NOT NULL DEFAULT false,
  "inAppDelivery" BOOLEAN NOT NULL DEFAULT true,
  "proactiveEnabled" BOOLEAN NOT NULL DEFAULT true,
  "financialAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "quietHoursStart" VARCHAR(5),
  "quietHoursEnd" VARCHAR(5),
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyBriefingLog" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "dateKey" VARCHAR(10) NOT NULL,
  "type" "BriefingType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "status" "BriefingDeliveryStatus" NOT NULL DEFAULT 'SENT',
  "content" JSONB NOT NULL,
  "sentAt" TIMESTAMP(3),
  "errorMessage" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyBriefingLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProactiveSuggestion" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "triggerType" VARCHAR(100) NOT NULL,
  "entityType" VARCHAR(100),
  "entityId" UUID,
  "dedupeKey" VARCHAR(300) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "severity" "SuggestionSeverity" NOT NULL DEFAULT 'INFO',
  "status" "SuggestionStatus" NOT NULL DEFAULT 'ACTIVE',
  "snoozedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProactiveSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceBudget_userId_categoryId_currency_monthKey_key" ON "FinanceBudget"("userId", "categoryId", "currency", "monthKey");
CREATE INDEX "FinanceBudget_userId_monthKey_idx" ON "FinanceBudget"("userId", "monthKey");

CREATE UNIQUE INDEX "AgentPreference_userId_key" ON "AgentPreference"("userId");
CREATE INDEX "AgentPreference_userId_idx" ON "AgentPreference"("userId");

CREATE UNIQUE INDEX "DailyBriefingLog_userId_dateKey_type_key" ON "DailyBriefingLog"("userId", "dateKey", "type");
CREATE INDEX "DailyBriefingLog_userId_createdAt_idx" ON "DailyBriefingLog"("userId", "createdAt");

CREATE UNIQUE INDEX "ProactiveSuggestion_userId_dedupeKey_key" ON "ProactiveSuggestion"("userId", "dedupeKey");
CREATE INDEX "ProactiveSuggestion_userId_status_idx" ON "ProactiveSuggestion"("userId", "status");

ALTER TABLE "FinanceBudget" ADD CONSTRAINT "FinanceBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceBudget" ADD CONSTRAINT "FinanceBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentPreference" ADD CONSTRAINT "AgentPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyBriefingLog" ADD CONSTRAINT "DailyBriefingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProactiveSuggestion" ADD CONSTRAINT "ProactiveSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "MemoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "FinanceAccountType" AS ENUM ('CASH', 'CARD', 'BANK', 'OTHER');
CREATE TYPE "FileExtractionStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'UNSUPPORTED');
CREATE TYPE "SubscriptionTier" AS ENUM ('STARTER', 'PRO', 'BUSINESS');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
CREATE TYPE "AgentActionStatus" AS ENUM ('PENDING', 'EXECUTING', 'EXECUTED', 'CANCELLED', 'EXPIRED', 'FAILED');

ALTER TABLE "UserFile"
  ADD COLUMN "extractionStatus" "FileExtractionStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "extractedText" TEXT,
  ADD COLUMN "extractedAt" TIMESTAMP(3),
  ADD COLUMN "extractionError" VARCHAR(200);

ALTER TABLE "UserMemory"
  ADD COLUMN "confidence" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "status" "MemoryStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "correctedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "Contact"
  ADD COLUMN "relationship" VARCHAR(200),
  ADD COLUMN "birthday" DATE,
  ADD COLUMN "lastContactedAt" TIMESTAMP(3),
  ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);

CREATE TABLE "FinanceAccount" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "type" "FinanceAccountType" NOT NULL,
  "currency" "FinanceCurrency" NOT NULL,
  "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FinanceTransaction" ADD COLUMN "accountId" UUID;

CREATE TABLE "UserSubscription" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tier" "SubscriptionTier" NOT NULL DEFAULT 'STARTER',
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PendingAgentAction" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "conversationId" UUID,
  "toolName" VARCHAR(100) NOT NULL,
  "input" JSONB NOT NULL,
  "preview" JSONB,
  "status" "AgentActionStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" VARCHAR(100) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "executedAt" TIMESTAMP(3),
  "errorCode" VARCHAR(100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PendingAgentAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceAccount_userId_name_currency_key" ON "FinanceAccount"("userId", "name", "currency");
CREATE INDEX "FinanceAccount_userId_currency_isArchived_idx" ON "FinanceAccount"("userId", "currency", "isArchived");
CREATE INDEX "FinanceTransaction_userId_accountId_idx" ON "FinanceTransaction"("userId", "accountId");
CREATE UNIQUE INDEX "UserSubscription_userId_key" ON "UserSubscription"("userId");
CREATE INDEX "UserSubscription_status_currentPeriodEnd_idx" ON "UserSubscription"("status", "currentPeriodEnd");
CREATE INDEX "UserSubscription_tier_status_idx" ON "UserSubscription"("tier", "status");
CREATE UNIQUE INDEX "PendingAgentAction_idempotencyKey_key" ON "PendingAgentAction"("idempotencyKey");
CREATE INDEX "PendingAgentAction_userId_status_expiresAt_idx" ON "PendingAgentAction"("userId", "status", "expiresAt");
CREATE INDEX "PendingAgentAction_conversationId_createdAt_idx" ON "PendingAgentAction"("conversationId", "createdAt");
CREATE INDEX "UserFile_userId_extractionStatus_idx" ON "UserFile"("userId", "extractionStatus");
CREATE INDEX "UserMemory_userId_status_importance_idx" ON "UserMemory"("userId", "status", "importance");
CREATE INDEX "Contact_userId_nextFollowUpAt_idx" ON "Contact"("userId", "nextFollowUpAt");

ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PendingAgentAction" ADD CONSTRAINT "PendingAgentAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PendingAgentAction" ADD CONSTRAINT "PendingAgentAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

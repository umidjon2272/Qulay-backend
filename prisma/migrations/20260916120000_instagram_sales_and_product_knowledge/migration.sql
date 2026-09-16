CREATE TYPE "InstagramConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'DEGRADED', 'ERROR');
CREATE TYPE "SalesKnowledgeAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'UNKNOWN');

CREATE TABLE "SalesProductKnowledge" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "canonicalName" VARCHAR(220) NOT NULL,
  "productFamily" VARCHAR(220),
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "description" TEXT,
  "publicPrice" DECIMAL(18,2),
  "currency" "FinanceCurrency",
  "availability" "SalesKnowledgeAvailability" NOT NULL DEFAULT 'UNKNOWN',
  "stockQuantity" DECIMAL(18,3),
  "unit" VARCHAR(50),
  "attributes" JSONB,
  "note" TEXT,
  "source" VARCHAR(50) NOT NULL DEFAULT 'OWNER_CHAT',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesProductKnowledge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesProductKnowledge_userId_canonicalName_key" ON "SalesProductKnowledge"("userId", "canonicalName");
CREATE INDEX "SalesProductKnowledge_userId_active_updatedAt_idx" ON "SalesProductKnowledge"("userId", "active", "updatedAt");
CREATE INDEX "SalesProductKnowledge_userId_productFamily_idx" ON "SalesProductKnowledge"("userId", "productFamily");
ALTER TABLE "SalesProductKnowledge" ADD CONSTRAINT "SalesProductKnowledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InstagramConnection" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "instagramUserId" VARCHAR(80) NOT NULL,
  "username" VARCHAR(200),
  "displayName" VARCHAR(200),
  "profilePictureUrl" TEXT,
  "encryptedAccessToken" TEXT NOT NULL,
  "status" "InstagramConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "webhookSubscribed" BOOLEAN NOT NULL DEFAULT false,
  "salesAgentEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dmEnabled" BOOLEAN NOT NULL DEFAULT true,
  "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "imageVisionEnabled" BOOLEAN NOT NULL DEFAULT true,
  "connectedAt" TIMESTAMP(3),
  "lastValidatedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstagramConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstagramConnection_userId_key" ON "InstagramConnection"("userId");
CREATE UNIQUE INDEX "InstagramConnection_instagramUserId_key" ON "InstagramConnection"("instagramUserId");
CREATE INDEX "InstagramConnection_status_idx" ON "InstagramConnection"("status");
CREATE INDEX "InstagramConnection_username_idx" ON "InstagramConnection"("username");
ALTER TABLE "InstagramConnection" ADD CONSTRAINT "InstagramConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InstagramSalesSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "peerId" VARCHAR(100) NOT NULL,
  "username" VARCHAR(200),
  "displayName" VARCHAR(200),
  "conversationId" UUID NOT NULL,
  "salesContextUntil" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "salesState" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstagramSalesSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstagramSalesSession_conversationId_key" ON "InstagramSalesSession"("conversationId");
CREATE UNIQUE INDEX "InstagramSalesSession_userId_peerId_key" ON "InstagramSalesSession"("userId", "peerId");
CREATE INDEX "InstagramSalesSession_userId_updatedAt_idx" ON "InstagramSalesSession"("userId", "updatedAt");
ALTER TABLE "InstagramSalesSession" ADD CONSTRAINT "InstagramSalesSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstagramSalesSession" ADD CONSTRAINT "InstagramSalesSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InstagramCommentAutomation" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "mediaId" VARCHAR(120) NOT NULL,
  "mediaCaption" TEXT,
  "mediaPermalink" TEXT,
  "triggerText" TEXT NOT NULL,
  "semanticMatch" BOOLEAN NOT NULL DEFAULT true,
  "dmMessage" TEXT NOT NULL,
  "publicReply" TEXT,
  "sendPrivateReply" BOOLEAN NOT NULL DEFAULT true,
  "replyPublicly" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstagramCommentAutomation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InstagramCommentAutomation_userId_mediaId_active_idx" ON "InstagramCommentAutomation"("userId", "mediaId", "active");
CREATE INDEX "InstagramCommentAutomation_userId_updatedAt_idx" ON "InstagramCommentAutomation"("userId", "updatedAt");
ALTER TABLE "InstagramCommentAutomation" ADD CONSTRAINT "InstagramCommentAutomation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InstagramAutomationReceipt" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "automationId" UUID NOT NULL,
  "commentId" VARCHAR(200) NOT NULL,
  "commenterId" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstagramAutomationReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstagramAutomationReceipt_automationId_commentId_key" ON "InstagramAutomationReceipt"("automationId", "commentId");
CREATE INDEX "InstagramAutomationReceipt_userId_createdAt_idx" ON "InstagramAutomationReceipt"("userId", "createdAt");
ALTER TABLE "InstagramAutomationReceipt" ADD CONSTRAINT "InstagramAutomationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstagramAutomationReceipt" ADD CONSTRAINT "InstagramAutomationReceipt_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "InstagramCommentAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

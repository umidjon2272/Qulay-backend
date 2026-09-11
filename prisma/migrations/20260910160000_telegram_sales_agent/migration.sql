ALTER TABLE "TelegramConnection"
  ADD COLUMN "salesAgentEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "salesPrivateChats" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "salesGroups" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "salesVoiceEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "salesVoiceMaxSeconds" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "Conversation"
  ADD COLUMN "source" VARCHAR(32) NOT NULL DEFAULT 'APP';

CREATE TABLE "TelegramSalesSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "peerId" VARCHAR(100) NOT NULL,
  "peerType" VARCHAR(20) NOT NULL,
  "peerName" VARCHAR(200),
  "conversationId" UUID NOT NULL,
  "lastInboundMessageId" INTEGER,
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramSalesSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramSalesSession_conversationId_key" ON "TelegramSalesSession"("conversationId");
CREATE UNIQUE INDEX "TelegramSalesSession_userId_peerId_key" ON "TelegramSalesSession"("userId", "peerId");
CREATE INDEX "TelegramSalesSession_userId_updatedAt_idx" ON "TelegramSalesSession"("userId", "updatedAt");

ALTER TABLE "TelegramSalesSession"
  ADD CONSTRAINT "TelegramSalesSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramSalesSession"
  ADD CONSTRAINT "TelegramSalesSession_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

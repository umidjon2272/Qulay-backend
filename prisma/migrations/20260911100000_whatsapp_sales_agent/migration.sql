CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'DEGRADED', 'ERROR');

CREATE TABLE "WhatsAppConnection" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "phoneNumberId" VARCHAR(40) NOT NULL,
  "wabaId" VARCHAR(40),
  "displayPhoneNumber" VARCHAR(50),
  "verifiedName" VARCHAR(200),
  "qualityRating" VARCHAR(50),
  "encryptedAccessToken" TEXT NOT NULL,
  "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "webhookSubscribed" BOOLEAN NOT NULL DEFAULT false,
  "salesAgentEnabled" BOOLEAN NOT NULL DEFAULT false,
  "salesOnly" BOOLEAN NOT NULL DEFAULT true,
  "salesVoiceEnabled" BOOLEAN NOT NULL DEFAULT true,
  "salesVoiceMaxSeconds" INTEGER NOT NULL DEFAULT 60,
  "connectedAt" TIMESTAMP(3),
  "lastValidatedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppSalesSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "waId" VARCHAR(40) NOT NULL,
  "customerName" VARCHAR(200),
  "conversationId" UUID NOT NULL,
  "salesContextUntil" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppSalesSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppInboundReceipt" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "messageId" VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppInboundReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppConnection_userId_key" ON "WhatsAppConnection"("userId");
CREATE UNIQUE INDEX "WhatsAppConnection_phoneNumberId_key" ON "WhatsAppConnection"("phoneNumberId");
CREATE INDEX "WhatsAppConnection_status_idx" ON "WhatsAppConnection"("status");
CREATE INDEX "WhatsAppConnection_wabaId_idx" ON "WhatsAppConnection"("wabaId");
CREATE UNIQUE INDEX "WhatsAppSalesSession_conversationId_key" ON "WhatsAppSalesSession"("conversationId");
CREATE UNIQUE INDEX "WhatsAppSalesSession_userId_waId_key" ON "WhatsAppSalesSession"("userId", "waId");
CREATE INDEX "WhatsAppSalesSession_userId_updatedAt_idx" ON "WhatsAppSalesSession"("userId", "updatedAt");
CREATE UNIQUE INDEX "WhatsAppInboundReceipt_messageId_key" ON "WhatsAppInboundReceipt"("messageId");
CREATE INDEX "WhatsAppInboundReceipt_userId_createdAt_idx" ON "WhatsAppInboundReceipt"("userId", "createdAt");

ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppSalesSession" ADD CONSTRAINT "WhatsAppSalesSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppSalesSession" ADD CONSTRAINT "WhatsAppSalesSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppInboundReceipt" ADD CONSTRAINT "WhatsAppInboundReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

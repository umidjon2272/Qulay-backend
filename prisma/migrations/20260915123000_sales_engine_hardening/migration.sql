CREATE TABLE "BusinessSalesProfile" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "storeAddress" TEXT,
  "businessHours" VARCHAR(300),
  "publicPhone" VARCHAR(50),
  "deliveryEnabled" BOOLEAN,
  "deliveryAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "deliveryPolicy" TEXT,
  "pickupEnabled" BOOLEAN,
  "paymentMethods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "minimumOrderNote" TEXT,
  "wholesalePolicy" TEXT,
  "discountPolicy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessSalesProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessSalesProfile_userId_key" ON "BusinessSalesProfile"("userId");
ALTER TABLE "BusinessSalesProfile" ADD CONSTRAINT "BusinessSalesProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SalesInboundReceipt" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "channel" VARCHAR(20) NOT NULL,
  "peerId" VARCHAR(200) NOT NULL,
  "messageId" VARCHAR(200) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesInboundReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesInboundReceipt_channel_userId_peerId_messageId_key" ON "SalesInboundReceipt"("channel", "userId", "peerId", "messageId");
CREATE INDEX "SalesInboundReceipt_userId_createdAt_idx" ON "SalesInboundReceipt"("userId", "createdAt");
ALTER TABLE "SalesInboundReceipt" ADD CONSTRAINT "SalesInboundReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "TelegramConnectionStatus" AS ENUM ('DISCONNECTED', 'AWAITING_CODE', 'AWAITING_PASSWORD', 'CONNECTED', 'ERROR');

CREATE TABLE "TelegramConnection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "telegramUserId" TEXT,
    "phoneNumber" TEXT,
    "username" VARCHAR(100),
    "displayName" VARCHAR(200),
    "encryptedSession" TEXT,
    "encryptedPhoneCodeHash" TEXT,
    "status" "TelegramConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connectedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramConnection_userId_key" ON "TelegramConnection"("userId");
CREATE INDEX "TelegramConnection_status_idx" ON "TelegramConnection"("status");
ALTER TABLE "TelegramConnection" ADD CONSTRAINT "TelegramConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

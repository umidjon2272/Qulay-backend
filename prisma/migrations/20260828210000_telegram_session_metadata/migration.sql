ALTER TABLE "TelegramConnection"
ADD COLUMN "lastValidatedAt" TIMESTAMP(3),
ADD COLUMN "lastErrorAt" TIMESTAMP(3),
ADD COLUMN "lastErrorCode" VARCHAR(100);

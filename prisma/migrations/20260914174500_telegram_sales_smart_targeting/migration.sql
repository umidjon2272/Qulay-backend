-- Telegram Sales Agent smart DM detection + explicit group allowlist.
ALTER TABLE "TelegramConnection"
ADD COLUMN "salesAllowedGroupIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "TelegramSalesSession"
ADD COLUMN "salesContextUntil" TIMESTAMP(3),
ADD COLUMN "ownerPausedUntil" TIMESTAMP(3);

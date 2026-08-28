ALTER TABLE "TelegramConnection" ADD COLUMN "codeSentAt" TIMESTAMP(3);
ALTER TABLE "TelegramConnection" ADD COLUMN "codeResendAfterSeconds" INTEGER;

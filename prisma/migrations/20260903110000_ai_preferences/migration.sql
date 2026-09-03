ALTER TABLE "AgentPreference"
  ADD COLUMN "replyStyle" TEXT NOT NULL DEFAULT 'Professional',
  ADD COLUMN "replyLength" TEXT NOT NULL DEFAULT 'O''rta',
  ADD COLUMN "saveHistory" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "confirmExternalActions" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "voiceReply" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Conversation" ADD COLUMN "isTemporary" BOOLEAN NOT NULL DEFAULT false;

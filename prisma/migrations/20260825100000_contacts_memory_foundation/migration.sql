-- Qulay AI contacts and structured memory foundation.

CREATE TYPE "MemoryType" AS ENUM ('PERSONAL', 'BUSINESS', 'CONTACT', 'PREFERENCE', 'DECISION', 'GOAL', 'CONTEXT');

CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100),
    "displayName" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(50),
    "email" VARCHAR(320),
    "telegramUsername" VARCHAR(100),
    "company" VARCHAR(200),
    "position" VARCHAR(200),
    "notes" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserMemory" ADD COLUMN "type" "MemoryType" NOT NULL DEFAULT 'CONTEXT';
ALTER TABLE "UserMemory" ADD COLUMN "source" VARCHAR(100) NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "UserMemory" ADD COLUMN "contactId" UUID;
ALTER TABLE "UserMemory" ADD COLUMN "lastUsedAt" TIMESTAMP(3);

UPDATE "UserMemory"
SET "type" = CASE "category"
  WHEN 'PROFILE' THEN 'PERSONAL'::"MemoryType"
  WHEN 'PREFERENCE' THEN 'PREFERENCE'::"MemoryType"
  WHEN 'CONTACT' THEN 'CONTACT'::"MemoryType"
  WHEN 'GOAL' THEN 'GOAL'::"MemoryType"
  WHEN 'WORK' THEN 'BUSINESS'::"MemoryType"
  ELSE 'CONTEXT'::"MemoryType"
END;

ALTER TABLE "Meeting" ADD COLUMN "contactId" UUID;
ALTER TABLE "Note" ADD COLUMN "contactId" UUID;

DROP INDEX "UserMemory_userId_category_idx";
ALTER TABLE "UserMemory" DROP COLUMN "category";
DROP TYPE "MemoryCategory";

CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");
CREATE INDEX "Contact_displayName_idx" ON "Contact"("displayName");
CREATE INDEX "Contact_phone_idx" ON "Contact"("phone");
CREATE INDEX "Contact_email_idx" ON "Contact"("email");
CREATE INDEX "Contact_telegramUsername_idx" ON "Contact"("telegramUsername");
CREATE INDEX "Contact_userId_displayName_idx" ON "Contact"("userId", "displayName");
CREATE INDEX "Contact_userId_phone_idx" ON "Contact"("userId", "phone");
CREATE INDEX "Contact_userId_email_idx" ON "Contact"("userId", "email");
CREATE INDEX "Contact_userId_telegramUsername_idx" ON "Contact"("userId", "telegramUsername");
CREATE INDEX "Meeting_userId_contactId_startsAt_idx" ON "Meeting"("userId", "contactId", "startsAt");
CREATE INDEX "Note_userId_contactId_updatedAt_idx" ON "Note"("userId", "contactId", "updatedAt");
CREATE INDEX "UserMemory_userId_type_idx" ON "UserMemory"("userId", "type");
CREATE INDEX "UserMemory_userId_contactId_idx" ON "UserMemory"("userId", "contactId");
CREATE INDEX "UserMemory_userId_lastUsedAt_idx" ON "UserMemory"("userId", "lastUsedAt");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

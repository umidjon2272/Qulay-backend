CREATE TABLE "PlatformSettings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "name" VARCHAR(100) NOT NULL DEFAULT 'Qulay AI',
  "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformSettings" ("id", "name", "registrationEnabled", "updatedAt")
VALUES ('global', 'Qulay AI', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

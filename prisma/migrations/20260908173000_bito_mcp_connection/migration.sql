CREATE TYPE "BitoConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');
CREATE TYPE "BitoAuthMode" AS ENUM ('NONE', 'BEARER', 'X_API_KEY');

CREATE TABLE "BitoConnection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "encryptedServerUrl" TEXT NOT NULL,
    "encryptedAccessToken" TEXT,
    "authMode" "BitoAuthMode" NOT NULL DEFAULT 'NONE',
    "status" "BitoConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "serverName" VARCHAR(200),
    "protocolVersion" VARCHAR(50),
    "toolCount" INTEGER NOT NULL DEFAULT 0,
    "connectedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BitoConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BitoConnection_userId_key" ON "BitoConnection"("userId");
CREATE INDEX "BitoConnection_status_idx" ON "BitoConnection"("status");

ALTER TABLE "BitoConnection"
  ADD CONSTRAINT "BitoConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

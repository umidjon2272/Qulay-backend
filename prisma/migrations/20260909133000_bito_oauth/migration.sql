ALTER TYPE "BitoConnectionStatus" ADD VALUE IF NOT EXISTS 'AUTHORIZING';

ALTER TABLE "BitoConnection"
  ADD COLUMN "encryptedRefreshToken" TEXT,
  ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "oauthScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "oauthStateHash" VARCHAR(64),
  ADD COLUMN "encryptedPkceVerifier" TEXT,
  ADD COLUMN "oauthExpiresAt" TIMESTAMP(3),
  ADD COLUMN "oauthIssuer" TEXT,
  ADD COLUMN "oauthResource" TEXT,
  ADD COLUMN "authorizationEndpoint" TEXT,
  ADD COLUMN "tokenEndpoint" TEXT,
  ADD COLUMN "registrationEndpoint" TEXT,
  ADD COLUMN "revocationEndpoint" TEXT,
  ADD COLUMN "oauthClientId" TEXT,
  ADD COLUMN "encryptedOauthClientSecret" TEXT,
  ADD COLUMN "tokenEndpointAuthMethod" VARCHAR(100);

CREATE UNIQUE INDEX "BitoConnection_oauthStateHash_key"
  ON "BitoConnection"("oauthStateHash");

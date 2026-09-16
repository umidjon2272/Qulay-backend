ALTER TABLE "InstagramConnection"
ADD COLUMN "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "tokenRefreshedAt" TIMESTAMP(3);

CREATE TABLE "InstagramOAuthState" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "nonceHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstagramOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstagramOAuthState_nonceHash_key" ON "InstagramOAuthState"("nonceHash");
CREATE INDEX "InstagramOAuthState_userId_expiresAt_idx" ON "InstagramOAuthState"("userId", "expiresAt");
CREATE INDEX "InstagramOAuthState_expiresAt_consumedAt_idx" ON "InstagramOAuthState"("expiresAt", "consumedAt");
ALTER TABLE "InstagramOAuthState" ADD CONSTRAINT "InstagramOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

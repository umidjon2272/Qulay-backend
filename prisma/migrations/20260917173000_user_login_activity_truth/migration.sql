ALTER TABLE "User"
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "lastActivityAt" TIMESTAMP(3);

CREATE INDEX "User_lastLoginAt_idx" ON "User"("lastLoginAt");
CREATE INDEX "User_lastActivityAt_idx" ON "User"("lastActivityAt");

-- Add a deterministic lookup key while retaining tokenHash for verification
-- and backwards compatibility with existing refresh-token rows.
ALTER TABLE "RefreshToken" ADD COLUMN "tokenFingerprint" CHAR(64);

CREATE INDEX "RefreshToken_userId_tokenFingerprint_revokedAt_expiresAt_idx"
ON "RefreshToken"("userId", "tokenFingerprint", "revokedAt", "expiresAt");

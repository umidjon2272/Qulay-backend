ALTER TABLE "InstagramCommentAutomation"
ADD COLUMN "triggerKey" VARCHAR(500);

UPDATE "InstagramCommentAutomation"
SET "triggerKey" = btrim(regexp_replace(
  regexp_replace(lower("triggerText"), '[^[:alnum:]''’‘ʻʼ`]+', ' ', 'g'),
  '[[:space:]]+', ' ', 'g'
));

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "userId", "mediaId", "triggerKey"
           ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
         ) AS rn
  FROM "InstagramCommentAutomation"
)
DELETE FROM "InstagramCommentAutomation" a
USING ranked r
WHERE a.id = r.id AND r.rn > 1;

ALTER TABLE "InstagramCommentAutomation"
ALTER COLUMN "triggerKey" SET NOT NULL;

CREATE UNIQUE INDEX "InstagramCommentAutomation_userId_mediaId_triggerKey_key"
ON "InstagramCommentAutomation"("userId", "mediaId", "triggerKey");

ALTER TABLE "InstagramAutomationReceipt"
ADD COLUMN "privateSentAt" TIMESTAMP(3),
ADD COLUMN "publicSentAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextRetryAt" TIMESTAMP(3),
ADD COLUMN "lastErrorCode" VARCHAR(100),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "InstagramAutomationReceipt_nextRetryAt_idx"
ON "InstagramAutomationReceipt"("nextRetryAt");

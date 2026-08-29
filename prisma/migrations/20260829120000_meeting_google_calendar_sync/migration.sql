ALTER TABLE "Meeting"
ADD COLUMN "googleCalendarEventId" VARCHAR(1024),
ADD COLUMN "googleCalendarId" VARCHAR(200),
ADD COLUMN "googleSyncedAt" TIMESTAMP(3),
ADD COLUMN "googleSyncError" VARCHAR(100);

CREATE UNIQUE INDEX "Meeting_userId_googleCalendarEventId_key"
ON "Meeting"("userId", "googleCalendarEventId");

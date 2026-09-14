CREATE TABLE "SalesPlaybookRule" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "instruction" TEXT NOT NULL,
  "category" VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  "triggerExamples" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "responseExamples" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "priority" INTEGER NOT NULL DEFAULT 50,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesPlaybookRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesPlaybookRule_userId_title_key" ON "SalesPlaybookRule"("userId", "title");
CREATE INDEX "SalesPlaybookRule_userId_active_priority_idx" ON "SalesPlaybookRule"("userId", "active", "priority");
ALTER TABLE "SalesPlaybookRule" ADD CONSTRAINT "SalesPlaybookRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

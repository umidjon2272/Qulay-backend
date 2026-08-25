-- CreateEnum
CREATE TYPE "FinanceTransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceCategoryType" AS ENUM ('INCOME', 'EXPENSE', 'BOTH');

-- CreateEnum
CREATE TYPE "FinanceCurrency" AS ENUM ('UZS', 'USD');

-- AlterTable
ALTER TABLE "UserMemory" ALTER COLUMN "source" SET DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "FinanceCategory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "FinanceCategoryType" NOT NULL,
    "icon" VARCHAR(100),
    "color" VARCHAR(30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTransaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "FinanceTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "FinanceCurrency" NOT NULL,
    "categoryId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "contactId" UUID,
    "source" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceCategory_userId_idx" ON "FinanceCategory"("userId");

-- CreateIndex
CREATE INDEX "FinanceCategory_userId_type_idx" ON "FinanceCategory"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategory_userId_name_type_key" ON "FinanceCategory"("userId", "name", "type");

-- CreateIndex
CREATE INDEX "FinanceTransaction_userId_idx" ON "FinanceTransaction"("userId");

-- CreateIndex
CREATE INDEX "FinanceTransaction_userId_transactionDate_idx" ON "FinanceTransaction"("userId", "transactionDate");

-- CreateIndex
CREATE INDEX "FinanceTransaction_userId_type_idx" ON "FinanceTransaction"("userId", "type");

-- CreateIndex
CREATE INDEX "FinanceTransaction_userId_categoryId_idx" ON "FinanceTransaction"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "FinanceTransaction_userId_currency_idx" ON "FinanceTransaction"("userId", "currency");

-- CreateIndex
CREATE INDEX "FinanceTransaction_userId_currency_transactionDate_idx" ON "FinanceTransaction"("userId", "currency", "transactionDate");

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransaction" ADD CONSTRAINT "FinanceTransaction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

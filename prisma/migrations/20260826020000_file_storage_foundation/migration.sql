-- CreateEnum
CREATE TYPE "FileStorageProvider" AS ENUM ('LOCAL', 'S3');

-- CreateEnum
CREATE TYPE "FileSource" AS ENUM ('UPLOAD', 'GOOGLE_DRIVE', 'TELEGRAM', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('ACTIVE', 'PROCESSING', 'FAILED', 'DELETED');

-- CreateTable
CREATE TABLE "FileFolder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "storedName" VARCHAR(255) NOT NULL,
    "label" VARCHAR(200),
    "mimeType" VARCHAR(200) NOT NULL,
    "extension" VARCHAR(20),
    "sizeBytes" BIGINT NOT NULL,
    "storageProvider" "FileStorageProvider" NOT NULL DEFAULT 'LOCAL',
    "storageKey" VARCHAR(1000) NOT NULL,
    "folderId" UUID,
    "source" "FileSource" NOT NULL DEFAULT 'UPLOAD',
    "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE',
    "checksum" CHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileFolder_userId_parentId_name_key" ON "FileFolder"("userId", "parentId", "name");
CREATE INDEX "FileFolder_userId_parentId_idx" ON "FileFolder"("userId", "parentId");
CREATE INDEX "UserFile_userId_status_createdAt_idx" ON "UserFile"("userId", "status", "createdAt");
CREATE INDEX "UserFile_userId_folderId_idx" ON "UserFile"("userId", "folderId");
CREATE INDEX "UserFile_userId_mimeType_idx" ON "UserFile"("userId", "mimeType");
CREATE INDEX "UserFile_userId_source_idx" ON "UserFile"("userId", "source");
CREATE INDEX "UserFile_userId_checksum_idx" ON "UserFile"("userId", "checksum");

-- AddForeignKey
ALTER TABLE "FileFolder" ADD CONSTRAINT "FileFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileFolder" ADD CONSTRAINT "FileFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserFile" ADD CONSTRAINT "UserFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFile" ADD CONSTRAINT "UserFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "FileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

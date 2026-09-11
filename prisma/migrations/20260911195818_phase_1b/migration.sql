-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "defaultLocationId" TEXT,
ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "sendCount" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "NumberSequence" ADD COLUMN     "prefix" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "estimateTermsText" TEXT,
ADD COLUMN     "invoiceTermsText" TEXT,
ADD COLUMN     "logoStorageKey" TEXT,
ADD COLUMN     "reviewRequestEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "priceBookItemId" TEXT;

-- AlterTable
ALTER TABLE "PriceBookPackageItem" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- CreateIndex
CREATE INDEX "Photo_uploadStatus_createdAt_idx" ON "Photo"("uploadStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_priceBookItemId_fkey" FOREIGN KEY ("priceBookItemId") REFERENCES "PriceBookItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


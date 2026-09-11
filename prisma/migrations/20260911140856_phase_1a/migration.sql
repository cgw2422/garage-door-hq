-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewProvider" AS ENUM ('GOOGLE', 'FACEBOOK', 'YELP', 'BBB', 'ANGI', 'OTHER');

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "taxJurisdiction" TEXT,
ADD COLUMN     "taxRateOverridden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "taxJurisdiction" TEXT,
ADD COLUMN     "taxRateOverridden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "googleReviewUrl",
ADD COLUMN     "laborCostEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "uploadStatus" "UploadStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "uploadedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PriceBookPackage" ADD COLUMN     "defaultTier" "EstimateTier",
ADD COLUMN     "isRecommendedDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ReviewRequest" ADD COLUMN     "destinationId" TEXT;

-- AlterTable
ALTER TABLE "VoiceNote" ADD COLUMN     "uploadStatus" "UploadStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "uploadedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReviewDestination" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "ReviewProvider" NOT NULL DEFAULT 'GOOGLE',
    "label" TEXT,
    "url" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionRemedy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "componentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceBookItemId" TEXT,
    "packageId" TEXT,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "forStatuses" "InspectionItemStatus"[] DEFAULT ARRAY[]::"InspectionItemStatus"[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionRemedy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewDestination_organizationId_isActive_idx" ON "ReviewDestination"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDestination_organizationId_provider_key" ON "ReviewDestination"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "InspectionRemedy_organizationId_componentKey_isActive_idx" ON "InspectionRemedy"("organizationId", "componentKey", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_storageKey_key" ON "Photo"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceNote_storageKey_key" ON "VoiceNote"("storageKey");

-- AddForeignKey
ALTER TABLE "ReviewDestination" ADD CONSTRAINT "ReviewDestination_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRemedy" ADD CONSTRAINT "InspectionRemedy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRemedy" ADD CONSTRAINT "InspectionRemedy_priceBookItemId_fkey" FOREIGN KEY ("priceBookItemId") REFERENCES "PriceBookItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRemedy" ADD CONSTRAINT "InspectionRemedy_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PriceBookPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "ReviewDestination"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: rows that existed before the upload lifecycle was introduced had
-- already been stored, so they are READY rather than awaiting an upload.
UPDATE "Photo" SET "uploadStatus" = 'READY', "uploadedAt" = "createdAt" WHERE "uploadStatus" = 'PENDING';
UPDATE "VoiceNote" SET "uploadStatus" = 'READY', "uploadedAt" = "createdAt" WHERE "uploadStatus" = 'PENDING';

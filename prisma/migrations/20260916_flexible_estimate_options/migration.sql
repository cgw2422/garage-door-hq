
-- CreateEnum
CREATE TYPE "EstimatePresentation" AS ENUM ('PLAIN', 'GOOD_BETTER_BEST');

-- CreateEnum
CREATE TYPE "EstimateKind" AS ENUM ('REPAIR', 'INSTALLATION');

-- CreateEnum
CREATE TYPE "ApprovalMethod" AS ENUM ('IN_PERSON_DEVICE', 'REMOTE_LINK');

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "approvalMethod" "ApprovalMethod",
ADD COLUMN     "kind" "EstimateKind" NOT NULL DEFAULT 'REPAIR',
ADD COLUMN     "presentation" "EstimatePresentation" NOT NULL DEFAULT 'PLAIN';

-- AlterTable
ALTER TABLE "EstimateOption" ALTER COLUMN "tier" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Signature" ADD COLUMN     "approvalMethod" "ApprovalMethod";


-- Estimates built before this change were assembled as Good/Better/Best, and
-- their options say so. Marking them keeps them looking exactly as the
-- customer saw them; everything new starts PLAIN and earns its labels.
UPDATE "Estimate" SET "presentation" = 'GOOD_BETTER_BEST'
 WHERE "id" IN (
   SELECT "estimateId" FROM "EstimateOption"
    WHERE "tier" IN ('GOOD', 'BETTER', 'BEST')
    GROUP BY "estimateId"
   HAVING COUNT(DISTINCT "tier") > 1
 );

-- A lone STANDARD option was never a tier, it was the absence of one.
UPDATE "EstimateOption" SET "tier" = NULL WHERE "tier" = 'STANDARD';

-- Approvals already on record came through the private link, which was the
-- only channel that existed.
UPDATE "Estimate" SET "approvalMethod" = 'REMOTE_LINK' WHERE "acceptedAt" IS NOT NULL;
UPDATE "Signature" SET "approvalMethod" = 'REMOTE_LINK'
 WHERE "kind" = 'ESTIMATE_APPROVAL' AND "approvalMethod" IS NULL;

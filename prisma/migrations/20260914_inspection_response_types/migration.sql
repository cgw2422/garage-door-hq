
-- CreateEnum
CREATE TYPE "InspectionResponseType" AS ENUM ('CONDITION', 'FUNCTION_TEST', 'MAINTENANCE', 'NOISE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InspectionItemStatus" ADD VALUE 'PASS';
ALTER TYPE "InspectionItemStatus" ADD VALUE 'FAIL';
ALTER TYPE "InspectionItemStatus" ADD VALUE 'COMPLETE';
ALTER TYPE "InspectionItemStatus" ADD VALUE 'NEEDED';
ALTER TYPE "InspectionItemStatus" ADD VALUE 'NORMAL';
ALTER TYPE "InspectionItemStatus" ADD VALUE 'NOTICEABLE';
ALTER TYPE "InspectionItemStatus" ADD VALUE 'EXCESSIVE';

-- AlterTable
ALTER TABLE "InspectionItem" ADD COLUMN     "responseType" "InspectionResponseType" NOT NULL DEFAULT 'CONDITION';


-- Existing items answer the question their component actually asks. The
-- mapping is the default residential template's; anything a company added
-- itself keeps the CONDITION default, which is the safe read of "unknown".
UPDATE "InspectionItem" SET "responseType" = 'FUNCTION_TEST'
 WHERE "componentKey" IN (
   'door-balance', 'opener', 'wall-control', 'remotes', 'keypad',
   'photo-eyes', 'auto-reverse', 'manual-release'
 );

UPDATE "InspectionItem" SET "responseType" = 'MAINTENANCE'
 WHERE "componentKey" = 'lubrication';

UPDATE "InspectionItem" SET "responseType" = 'NOISE'
 WHERE "componentKey" = 'noise-vibration';

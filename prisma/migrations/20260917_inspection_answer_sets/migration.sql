
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InspectionItemStatus" ADD VALUE 'BALANCED';
ALTER TYPE "InspectionItemStatus" ADD VALUE 'NEEDS_ADJUSTMENT';
ALTER TYPE "InspectionItemStatus" ADD VALUE 'WORKING';
ALTER TYPE "InspectionItemStatus" ADD VALUE 'UNABLE_TO_TEST';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InspectionResponseType" ADD VALUE 'BALANCE';
ALTER TYPE "InspectionResponseType" ADD VALUE 'SAFETY_TEST';
ALTER TYPE "InspectionResponseType" ADD VALUE 'ALIGNMENT';


-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEAM_INVITATION', 'PASSWORD_RESET', 'ESTIMATE_LINK', 'INVOICE_LINK', 'PAYMENT_RECEIPT', 'REVIEW_REQUEST', 'APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER', 'GENERAL');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommunicationStatus" ADD VALUE 'SENDING';
ALTER TYPE "CommunicationStatus" ADD VALUE 'BOUNCED';

-- DropIndex
DROP INDEX "PasswordResetToken_userId_idx";

-- AlterTable
ALTER TABLE "CommunicationLog" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "invitationId" TEXT,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "messageType" "MessageType" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "providerName" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "displayNumber" TEXT;

-- AlterTable
ALTER TABLE "Door" ADD COLUMN     "displayNumber" TEXT;

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "displayNumber" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "displayNumber" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "displayNumber" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "reviewRequestBody" TEXT,
ADD COLUMN     "reviewRequestSubject" TEXT,
ADD COLUMN     "setupChecklistDoneAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PasswordResetToken" ADD COLUMN     "requestIp" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "providerAccountId" TEXT,
ADD COLUMN     "providerIntentId" TEXT,
ADD COLUMN     "receiptEmail" TEXT;

-- AlterTable
ALTER TABLE "ReviewRequest" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "failedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cardBrand" TEXT,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "pastDueSince" TIMESTAMP(3),
ADD COLUMN     "providerPriceId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "providerAccountId" TEXT,
    "organizationId" TEXT,
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "providerAccountId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'standard',
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "requirementsNote" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "applicationFeeBps" INTEGER NOT NULL DEFAULT 0,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_eventType_receivedAt_idx" ON "WebhookEvent"("provider", "eventType", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_organizationId_receivedAt_idx" ON "WebhookEvent"("organizationId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAccount_organizationId_key" ON "PaymentAccount"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAccount_providerAccountId_key" ON "PaymentAccount"("providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationLog_idempotencyKey_key" ON "CommunicationLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CommunicationLog_organizationId_status_createdAt_idx" ON "CommunicationLog"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationLog_organizationId_messageType_createdAt_idx" ON "CommunicationLog"("organizationId", "messageType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_displayNumber_key" ON "Customer"("organizationId", "displayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Door_organizationId_displayNumber_key" ON "Door"("organizationId", "displayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_organizationId_displayNumber_key" ON "Estimate"("organizationId", "displayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_displayNumber_key" ON "Invoice"("organizationId", "displayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Job_organizationId_displayNumber_key" ON "Job"("organizationId", "displayNumber");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerName_providerIntentId_key" ON "Payment"("providerName", "providerIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_jobId_key" ON "ReviewRequest"("jobId");

-- CreateIndex
CREATE INDEX "Subscription_providerSubscriptionId_idx" ON "Subscription"("providerSubscriptionId");

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Backfill display numbers for records that already exist.
--
-- Every existing record was created before prefixes were configurable, so the
-- built-in prefix is the identifier it has always been shown under. Writing it
-- down now is what makes a later prefix change safe: these keep what they had.
-- ---------------------------------------------------------------------------
UPDATE "Customer" SET "displayNumber" = 'C-'   || "number" WHERE "displayNumber" IS NULL;
UPDATE "Door"     SET "displayNumber" = 'D-'   || "number" WHERE "displayNumber" IS NULL;
UPDATE "Job"      SET "displayNumber" = 'J-'   || "number" WHERE "displayNumber" IS NULL;
UPDATE "Estimate" SET "displayNumber" = 'EST-' || "number" WHERE "displayNumber" IS NULL;
UPDATE "Invoice"  SET "displayNumber" = 'INV-' || "number" WHERE "displayNumber" IS NULL;
-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


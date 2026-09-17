-- CreateTable
CREATE TABLE "PresentationSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "technicianUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedOptionId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PresentationSession_tokenHash_key" ON "PresentationSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PresentationSession_technicianUserId_endedAt_idx" ON "PresentationSession"("technicianUserId", "endedAt");

-- CreateIndex
CREATE INDEX "PresentationSession_organizationId_startedAt_idx" ON "PresentationSession"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "PresentationSession_expiresAt_idx" ON "PresentationSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "PresentationSession" ADD CONSTRAINT "PresentationSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSession" ADD CONSTRAINT "PresentationSession_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSession" ADD CONSTRAINT "PresentationSession_technicianUserId_fkey" FOREIGN KEY ("technicianUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


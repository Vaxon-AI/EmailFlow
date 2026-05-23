-- CreateTable
CREATE TABLE "QuotaLedger" (
    "id" TEXT NOT NULL,
    "identifierType" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "classifyUsed" INTEGER NOT NULL DEFAULT 0,
    "extractUsed" INTEGER NOT NULL DEFAULT 0,
    "pasteTextUsed" INTEGER NOT NULL DEFAULT 0,
    "quotaResetAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSnapshotAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotaLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotaLedger_identifier_idx" ON "QuotaLedger"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaLedger_identifierType_identifier_key" ON "QuotaLedger"("identifierType", "identifier");

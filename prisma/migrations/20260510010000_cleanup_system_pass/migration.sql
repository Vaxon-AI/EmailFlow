-- Tombstone table: prevents sync from re-fetching emails that were truly deleted
CREATE TABLE "DeletedEmailMarker" (
    "id"             TEXT         NOT NULL,
    "userId"         TEXT         NOT NULL,
    "accountId"      TEXT,
    "gmailMessageId" TEXT         NOT NULL,
    "deletedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedEmailMarker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeletedEmailMarker_userId_accountId_gmailMessageId_key"
  ON "DeletedEmailMarker"("userId", "accountId", "gmailMessageId");

CREATE INDEX "DeletedEmailMarker_userId_gmailMessageId_idx"
  ON "DeletedEmailMarker"("userId", "gmailMessageId");

ALTER TABLE "DeletedEmailMarker"
  ADD CONSTRAINT "DeletedEmailMarker_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Task soft-archive field
ALTER TABLE "Task" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Task_userId_archivedAt_idx" ON "Task"("userId", "archivedAt");

-- RetentionPolicy: 3 new fields
ALTER TABLE "RetentionPolicy"
  ADD COLUMN "purgeGracePeriodDays"        INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "staleReviewDismissAfterDays" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "taskRetainAfterDays"         INTEGER NOT NULL DEFAULT 30;

-- RetentionJobLog: 5 new counters
ALTER TABLE "RetentionJobLog"
  ADD COLUMN "emailsDeleted"          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "staleReviewsDismissed"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tasksHardDeleted"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tasksSoftArchived"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tasksPurgedFromArchive" INTEGER NOT NULL DEFAULT 0;

-- Adds Email.actioned as the orthogonal lifecycle axis ("user/system has handled
-- this email"). The classification field stays as the AI's semantic verdict;
-- actioned tracks whether a task was extracted or the user explicitly ignored.
--
-- Backfill rules:
--   1. Any email already linked to a task → actioned = true (the task IS the
--      action that captured this email).
--   2. Pre-existing processingStatus='dismissed' → collapse into the new model:
--      classification='ignore', actioned=true, processingStatus='done'.
--      (We're removing 'dismissed' as a processingStatus value because user
--      dismiss now lives on the classification × actioned axes.)

-- AlterTable
ALTER TABLE "Email" ADD COLUMN "actioned" BOOLEAN NOT NULL DEFAULT false;

-- Backfill 1: emails with linked tasks → actioned=true
UPDATE "Email"
SET "actioned" = true
WHERE "id" IN (
  SELECT DISTINCT "emailId" FROM "TaskEmail"
);

-- Backfill 2: collapse processingStatus='dismissed' into classification='ignore' + actioned=true
UPDATE "Email"
SET "classification" = 'ignore',
    "actioned" = true,
    "processingStatus" = 'done'
WHERE "processingStatus" = 'dismissed';

-- CreateIndex: make the (action OR uncertain) AND actioned=false dashboard query fast
CREATE INDEX "Email_userId_actioned_classification_idx"
  ON "Email"("userId", "actioned", "classification");

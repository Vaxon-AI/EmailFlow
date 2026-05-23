-- Align task statuses with product vocabulary and keep dismissed tasks out of normal task lists.
ALTER TABLE "Task" RENAME COLUMN "confirmedAt" TO "activeAt";

UPDATE "Task"
SET "status" = 'ai_suggestion'
WHERE "status" = 'pending';

UPDATE "Task"
SET "status" = 'active',
    "activeAt" = COALESCE("activeAt", "updatedAt")
WHERE "status" = 'confirmed';

UPDATE "Task"
SET "archivedAt" = COALESCE("archivedAt", "dismissedAt", now()),
    "status" = 'active',
    "activeAt" = COALESCE("activeAt", "updatedAt")
WHERE "status" = 'dismissed';

ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'ai_suggestion';

-- Historical ignored emails used actioned=true, which now means manually tracked.
-- Keep ignored emails with linked tasks tracked by relationship; unmark standalone ignored rows.
UPDATE "Email" e
SET "actioned" = false
WHERE e."classification" = 'ignore'
  AND e."actioned" = true
  AND NOT EXISTS (
    SELECT 1 FROM "TaskEmail" te WHERE te."emailId" = e.id
  );

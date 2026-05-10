-- Keep Email.actioned consistent with TaskEmail links.
-- Any email that already has a linked task has been captured into work and
-- should appear in Tracked rather than Needs Action.
UPDATE "Email"
SET "actioned" = true
WHERE "actioned" = false
  AND EXISTS (
    SELECT 1
    FROM "TaskEmail"
    WHERE "TaskEmail"."emailId" = "Email"."id"
  );

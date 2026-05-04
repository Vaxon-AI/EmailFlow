-- The User.hasSeenSyncSetup field was added to schema.prisma in commit
-- 186600a (the first-login Gmail sync setup dialog) but no migration file
-- was generated, so the column is missing on databases that only see
-- migrations. Adds the column with the default declared in the schema; no
-- backfill needed since false is the safe default for any existing user.
-- Existing users will see the sync setup dialog the next time they connect
-- Gmail, which is acceptable since it's a one-time onboarding step.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "hasSeenSyncSetup" BOOLEAN NOT NULL DEFAULT false;

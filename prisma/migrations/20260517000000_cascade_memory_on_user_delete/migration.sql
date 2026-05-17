-- Add cascading FK from per-user memory tables to User so that account
-- deletion (prisma.user.delete) actually removes this data instead of
-- leaving it orphaned forever.
--
-- Defensive style (DROP IF EXISTS before ADD) mirrors the catch-up
-- migration: safe to run even if a drifted environment already has
-- one of these constraints.


-- 1) Remove orphaned rows from prior account deletions. The FK below
--    cannot be added while rows reference a non-existent User.
DELETE FROM "SenderMemory" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "MatterMemory" WHERE "userId" NOT IN (SELECT "id" FROM "User");
DELETE FROM "ThreadMemory" WHERE "userId" NOT IN (SELECT "id" FROM "User");


-- 2) Add the User foreign key with ON DELETE CASCADE.
ALTER TABLE "SenderMemory" DROP CONSTRAINT IF EXISTS "SenderMemory_userId_fkey";
ALTER TABLE "SenderMemory" ADD CONSTRAINT "SenderMemory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatterMemory" DROP CONSTRAINT IF EXISTS "MatterMemory_userId_fkey";
ALTER TABLE "MatterMemory" ADD CONSTRAINT "MatterMemory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ThreadMemory" DROP CONSTRAINT IF EXISTS "ThreadMemory_userId_fkey";
ALTER TABLE "ThreadMemory" ADD CONSTRAINT "ThreadMemory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

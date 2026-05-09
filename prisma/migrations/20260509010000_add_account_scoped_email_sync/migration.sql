ALTER TABLE "Account"
ADD COLUMN "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lastSyncAt" TIMESTAMP(3),
ADD COLUMN "reauthRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reauthReason" TEXT,
ADD COLUMN "reauthAt" TIMESTAMP(3),
ADD COLUMN "reauthProvider" TEXT;

ALTER TABLE "Email" ADD COLUMN "accountId" TEXT;

UPDATE "Email"
SET "accountId" = account."id"
FROM "Account" account
WHERE "Email"."userId" = account."userId"
  AND account."provider" = 'google'
  AND ("Email"."accountEmail" = account."email" OR "Email"."accountEmail" = '' OR "Email"."accountEmail" IS NULL);

ALTER TABLE "Email" DROP CONSTRAINT IF EXISTS "Email_gmailMessageId_key";

CREATE UNIQUE INDEX "Email_userId_accountId_gmailMessageId_key" ON "Email"("userId", "accountId", "gmailMessageId");
CREATE INDEX "Account_userId_provider_syncEnabled_idx" ON "Account"("userId", "provider", "syncEnabled");
CREATE INDEX "Email_accountId_receivedAt_idx" ON "Email"("accountId", "receivedAt" DESC);

ALTER TABLE "Email"
ADD CONSTRAINT "Email_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

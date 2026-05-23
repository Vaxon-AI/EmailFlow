-- Add provider-neutral message identifiers while keeping legacy gmail* columns
-- for compatibility. The old columns are removed in a later cleanup phase.

ALTER TABLE "Email" ADD COLUMN "providerMessageId" TEXT;
UPDATE "Email" SET "providerMessageId" = "gmailMessageId" WHERE "providerMessageId" IS NULL;
ALTER TABLE "Email" ALTER COLUMN "providerMessageId" SET NOT NULL;

CREATE UNIQUE INDEX "Email_userId_accountId_providerMessageId_key"
  ON "Email"("userId", "accountId", "providerMessageId");

ALTER TABLE "FailedEmailSync" ADD COLUMN "providerMessageId" TEXT;
UPDATE "FailedEmailSync" SET "providerMessageId" = "gmailMessageId" WHERE "providerMessageId" IS NULL;
ALTER TABLE "FailedEmailSync" ALTER COLUMN "providerMessageId" SET NOT NULL;

CREATE UNIQUE INDEX "FailedEmailSync_userId_providerMessageId_key"
  ON "FailedEmailSync"("userId", "providerMessageId");

ALTER TABLE "DeletedEmailMarker" ADD COLUMN "providerMessageId" TEXT;
UPDATE "DeletedEmailMarker" SET "providerMessageId" = "gmailMessageId" WHERE "providerMessageId" IS NULL;
ALTER TABLE "DeletedEmailMarker" ALTER COLUMN "providerMessageId" SET NOT NULL;

CREATE UNIQUE INDEX "DeletedEmailMarker_userId_accountId_providerMessageId_key"
  ON "DeletedEmailMarker"("userId", "accountId", "providerMessageId");

CREATE INDEX "DeletedEmailMarker_userId_providerMessageId_idx"
  ON "DeletedEmailMarker"("userId", "providerMessageId");

ALTER TABLE "Attachment" ADD COLUMN "providerAttachmentId" TEXT;
UPDATE "Attachment" SET "providerAttachmentId" = "gmailAttachmentId" WHERE "providerAttachmentId" IS NULL;

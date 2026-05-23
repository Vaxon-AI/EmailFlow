-- Remove legacy Gmail compatibility columns after provider-neutral IDs have
-- been backfilled and adopted by application code.

DROP INDEX IF EXISTS "Email_userId_accountId_gmailMessageId_key";
DROP INDEX IF EXISTS "FailedEmailSync_userId_gmailMessageId_key";
DROP INDEX IF EXISTS "DeletedEmailMarker_userId_accountId_gmailMessageId_key";
DROP INDEX IF EXISTS "DeletedEmailMarker_userId_gmailMessageId_idx";

ALTER TABLE "Email" DROP COLUMN IF EXISTS "gmailMessageId";
ALTER TABLE "FailedEmailSync" DROP COLUMN IF EXISTS "gmailMessageId";
ALTER TABLE "DeletedEmailMarker" DROP COLUMN IF EXISTS "gmailMessageId";
ALTER TABLE "Attachment" DROP COLUMN IF EXISTS "gmailAttachmentId";

ALTER TABLE "User" DROP COLUMN IF EXISTS "gmailConnected";
ALTER TABLE "User" DROP COLUMN IF EXISTS "gmailEmail";

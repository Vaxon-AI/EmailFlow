ALTER TABLE "Email"
ADD COLUMN "aiReplyDraft" TEXT,
ADD COLUMN "aiReplyGeneratedAt" TIMESTAMP(3),
ADD COLUMN "aiReplyEditedAt" TIMESTAMP(3);

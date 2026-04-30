-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "awaitingReview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "manualReviewMode" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Email_userId_awaitingReview_receivedAt_idx" ON "Email"("userId", "awaitingReview", "receivedAt" DESC);

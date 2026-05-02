-- AlterTable
ALTER TABLE "User" ADD COLUMN     "classifyUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "extractUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "planActivatedAt" TIMESTAMP(3),
ADD COLUMN     "quotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Task_userId_completedAt_idx" ON "Task"("userId", "completedAt" DESC);

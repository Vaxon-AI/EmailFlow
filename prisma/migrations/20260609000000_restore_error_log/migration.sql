CREATE TABLE IF NOT EXISTS "ErrorLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "stack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ErrorLog_action_createdAt_idx"
    ON "ErrorLog"("action", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ErrorLog_createdAt_idx"
    ON "ErrorLog"("createdAt" DESC);

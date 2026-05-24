-- Add a generic email update cursor for new-count badges. Existing rows get
-- the deploy timestamp and the seen-state backfill below prevents historical
-- rows from showing as new.
ALTER TABLE "Email"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Email_userId_updatedAt_idx"
  ON "Email"("userId", "updatedAt");

-- Persist per-user surface/bucket "seen" cursors so tab new-count badges
-- can stay consistent across web, desktop, and future mobile clients.
CREATE TABLE "UserSurfaceSeenState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserSurfaceSeenState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSurfaceSeenState_userId_surface_bucket_key"
  ON "UserSurfaceSeenState"("userId", "surface", "bucket");

CREATE INDEX "UserSurfaceSeenState_userId_surface_idx"
  ON "UserSurfaceSeenState"("userId", "surface");

ALTER TABLE "UserSurfaceSeenState"
  ADD CONSTRAINT "UserSurfaceSeenState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing users should not see every historical email/task as "new" after deploy.
INSERT INTO "UserSurfaceSeenState" ("id", "userId", "surface", "bucket", "lastSeenAt", "createdAt", "updatedAt")
SELECT
  CONCAT('seen_', md5(CONCAT(u."id", ':emails:', b.bucket))),
  u."id",
  'emails',
  b.bucket,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (
  VALUES ('unclassified'), ('needs_action'), ('tracked'), ('fyi'), ('ignored')
) AS b(bucket)
ON CONFLICT ("userId", "surface", "bucket") DO NOTHING;

INSERT INTO "UserSurfaceSeenState" ("id", "userId", "surface", "bucket", "lastSeenAt", "createdAt", "updatedAt")
SELECT
  CONCAT('seen_', md5(CONCAT(u."id", ':tasks:', b.bucket))),
  u."id",
  'tasks',
  b.bucket,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (
  VALUES ('all'), ('ai_suggestion'), ('active'), ('completed')
) AS b(bucket)
ON CONFLICT ("userId", "surface", "bucket") DO NOTHING;

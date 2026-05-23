/**
 * Task Cleanup Service
 *
 * Two-pass cleanup of completed tasks:
 *   1. Tasks past the retention threshold:
 *      - No email links → hard delete
 *      - Has email links → soft archive (set archivedAt; UI hides them but
 *        the email detail page can still trace them)
 *   2. Previously soft-archived tasks whose linked emails have all been
 *      truly DELETEd from the Email table (TaskEmail rows already cascade-
 *      removed) → hard delete the task. This is detected as
 *      "archivedAt set AND no remaining TaskEmail rows".
 *
 * User-initiated delete stays a hard delete and is intentionally orthogonal
 * to this retention pipeline.
 */

import { prisma } from '@/lib/prisma'

export type TaskCleanupResult = {
  /** Standalone (no email link) tasks hard-deleted in pass 1 */
  hardDeleted: number
  /** Email-linked tasks soft-archived in pass 1 */
  softArchived: number
  /** Previously archived tasks whose source emails are all gone, hard-deleted in pass 2 */
  purgedFromArchive: number
}

export async function cleanupTasksForUser(
  userId: string,
  retainAfterDays: number
): Promise<TaskCleanupResult> {
  const cutoff = new Date(Date.now() - retainAfterDays * 24 * 60 * 60 * 1000)

  // Pass 1 — completed past cutoff and not yet archived
  const candidates = await prisma.task.findMany({
    where: {
      userId,
      status: 'completed',
      completedAt: { lt: cutoff },
      archivedAt: null,
    },
    select: {
      id: true,
      _count: { select: { emailLinks: true } },
    },
  })

  const noEmailIds = candidates.filter((t) => t._count.emailLinks === 0).map((t) => t.id)
  const withEmailIds = candidates.filter((t) => t._count.emailLinks > 0).map((t) => t.id)

  let hardDeleted = 0
  if (noEmailIds.length > 0) {
    const { count } = await prisma.task.deleteMany({ where: { id: { in: noEmailIds } } })
    hardDeleted = count
  }

  let softArchived = 0
  if (withEmailIds.length > 0) {
    const { count } = await prisma.task.updateMany({
      where: { id: { in: withEmailIds } },
      data: { archivedAt: new Date() },
    })
    softArchived = count
  }

  // Pass 2 — already-archived tasks whose linked emails were all DELETEd
  // (TaskEmail rows cascade-removed when their email rows go).
  // $executeRaw returns the affected row count.
  const purgedFromArchive = await prisma.$executeRaw`
    DELETE FROM "Task" t
    WHERE t."userId" = ${userId}
      AND t."archivedAt" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "TaskEmail" te WHERE te."taskId" = t.id
      )
  `

  return { hardDeleted, softArchived, purgedFromArchive: Number(purgedFromArchive) }
}

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

type CleanupCandidate = {
  id: string
  _count: { emailLinks: number }
}

export type TaskCleanupResult = {
  /** Standalone (no email link) tasks hard-deleted in pass 1 */
  hardDeleted: number
  /** Email-linked tasks soft-archived in pass 1 */
  softArchived: number
  /** Previously archived tasks whose source emails are all gone, hard-deleted in pass 2 */
  purgedFromArchive: number
}

function getRetentionCutoff(retainAfterDays: number) {
  return new Date(Date.now() - retainAfterDays * 24 * 60 * 60 * 1000)
}

async function findCleanupCandidates(userId: string, cutoff: Date): Promise<CleanupCandidate[]> {
  return prisma.task.findMany({
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
}

function partitionCandidateIds(candidates: CleanupCandidate[]) {
  return candidates.reduce(
    (groups, candidate) => {
      if (candidate._count.emailLinks === 0) {
        groups.noEmailIds.push(candidate.id)
      } else {
        groups.withEmailIds.push(candidate.id)
      }
      return groups
    },
    { noEmailIds: [] as string[], withEmailIds: [] as string[] }
  )
}

async function hardDeleteStandaloneTasks(taskIds: string[]) {
  if (taskIds.length === 0) return 0
  const { count } = await prisma.task.deleteMany({ where: { id: { in: taskIds } } })
  return count
}

async function softArchiveLinkedTasks(taskIds: string[]) {
  if (taskIds.length === 0) return 0
  const { count } = await prisma.task.updateMany({
    where: { id: { in: taskIds } },
    data: { archivedAt: new Date() },
  })
  return count
}

async function purgeArchivedTasksWithoutEmails(userId: string) {
  const purgedFromArchive = await prisma.$executeRaw`
    DELETE FROM "Task" t
    WHERE t."userId" = ${userId}
      AND t."archivedAt" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "TaskEmail" te WHERE te."taskId" = t.id
      )
  `

  return Number(purgedFromArchive)
}

export async function cleanupTasksForUser(
  userId: string,
  retainAfterDays: number
): Promise<TaskCleanupResult> {
  const cutoff = getRetentionCutoff(retainAfterDays)

  // Pass 1 — completed past cutoff and not yet archived
  const candidates = await findCleanupCandidates(userId, cutoff)
  const { noEmailIds, withEmailIds } = partitionCandidateIds(candidates)
  const hardDeleted = await hardDeleteStandaloneTasks(noEmailIds)
  const softArchived = await softArchiveLinkedTasks(withEmailIds)

  // Pass 2 — already-archived tasks whose linked emails were all DELETEd
  // (TaskEmail rows cascade-removed when their email rows go).
  // $executeRaw returns the affected row count.
  const purgedFromArchive = await purgeArchivedTasksWithoutEmails(userId)

  return { hardDeleted, softArchived, purgedFromArchive }
}

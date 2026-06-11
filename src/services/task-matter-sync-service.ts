import { prisma } from '@/lib/prisma'
import { upsertManualMatterAssignment } from '@/repositories/thread-memory-repo'

/**
 * Keep the email side in sync when a task is assigned to a matter/project.
 *
 * Email grouping reads ThreadMemory.matterId, while task grouping reads
 * Task.matterId. Whenever a task gains a matter, upsert the same matter onto
 * the ThreadMemory of every email linked to that task ("latest wins").
 */
export async function syncThreadMattersForTasks(input: {
  userId: string
  taskIds: string[]
  matterId: string
  projectName: string
}): Promise<{ affectedThreads: number }> {
  const { userId, taskIds, matterId, projectName } = input
  if (taskIds.length === 0) return { affectedThreads: 0 }

  const links = await prisma.taskEmail.findMany({
    where: { taskId: { in: taskIds }, email: { userId } },
    select: { email: { select: { threadId: true } } },
  })

  const threadIds = [
    ...new Set(
      links
        .map((link) => link.email?.threadId)
        .filter((id): id is string => !!id)
    ),
  ]

  await Promise.all(
    threadIds.map((threadId) =>
      upsertManualMatterAssignment({ userId, threadId, matterId, projectName })
    )
  )

  return { affectedThreads: threadIds.length }
}

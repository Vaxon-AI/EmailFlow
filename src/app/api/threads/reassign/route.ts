import { errorFromException, getAuthUser, success, error, parseJsonBody } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { ensureMatterForProject } from '@/services/project-matter-service'
import { z } from 'zod'

const reassignThreadSchema = z.object({
  threadId: z.string().min(1, 'threadId and projectId are required'),
  projectId: z.string().min(1, 'threadId and projectId are required'),
  includeThread: z.boolean().optional(),
  taskIds: z.array(z.string()).optional(),
})

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const {
      threadId,
      projectId,
      includeThread = true,
      taskIds,
    } = await parseJsonBody(req, reassignThreadSchema)

    const matter = await ensureMatterForProject(user.id, projectId)
    if (!matter) return error('NOT_FOUND', 'Project not found', 404)

    const ops: Promise<unknown>[] = []

    // Update ThreadMemory (affects all emails in thread)
    if (includeThread) {
      ops.push(
        prisma.threadMemory.upsert({
          where: { userId_threadId: { userId: user.id, threadId } },
          update: { matterId: matter.id },
            create: {
              userId: user.id,
              threadId,
              matterId: matter.id,
              title: matter.projectName,
              summary: 'Manually assigned',
            },
          })
      )
    }

    // Explicitly set matterId on selected tasks
    if (taskIds && taskIds.length > 0) {
      ops.push(
        prisma.task.updateMany({
          where: { id: { in: taskIds }, userId: user.id },
          data: { matterId: matter.id },
        })
      )
    }

    await Promise.all(ops)

    const affectedEmails = includeThread
      ? await prisma.email.count({ where: { userId: user.id, threadId } })
      : 0
    const affectedTasks = taskIds?.length ?? 0

    return success({ affectedEmails, affectedTasks })
  } catch (err) {
    console.error('[api/threads/reassign]', err)
    return errorFromException(err, 'INTERNAL', 'Failed to reassign thread', 500)
  }
}

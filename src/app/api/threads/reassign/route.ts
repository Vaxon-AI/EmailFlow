import { defineRoute, error, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
import { countEmailsByThread } from '@/repositories/email-repo'
import { bulkSetMatter } from '@/repositories/task-repo'
import { upsertManualMatterAssignment } from '@/repositories/thread-memory-repo'
import { ensureMatterForProject } from '@/services/project-matter-service'
import { z } from 'zod'

const reassignThreadSchema = z.object({
  threadId: z.string().min(1, 'threadId and projectId are required'),
  projectId: z.string().min(1, 'threadId and projectId are required'),
  includeThread: z.boolean().optional(),
  taskIds: z.array(z.string()).optional(),
})

export const POST = defineRoute(
  { tag: 'api/threads/reassign', code: 'INTERNAL', message: 'Failed to reassign thread' },
  async (req: Request) => {
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
        upsertManualMatterAssignment({
          userId: user.id,
          threadId,
          matterId: matter.id,
          projectName: matter.projectName,
        })
      )
    }

    // Explicitly set matterId on selected tasks
    if (taskIds && taskIds.length > 0) {
      ops.push(bulkSetMatter(user.id, taskIds, matter.id))
    }

    await Promise.all(ops)

    const affectedEmails = includeThread
      ? await countEmailsByThread(user.id, threadId)
      : 0
    const affectedTasks = taskIds?.length ?? 0

    return success({ affectedEmails, affectedTasks })
  },
)

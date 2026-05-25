export const dynamic = 'force-dynamic'
import { defineRoute, error, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
import * as taskRepo from '@/repositories/task-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'
import { ensureMatterForProject } from '@/services/project-matter-service'
import { z } from 'zod'

const batchTaskSchema = z.object({
  ids: z.array(z.string()).min(1, 'ids is required'),
  action: z.string().min(1, 'action is required'),
  projectId: z.string().optional(),
})

export const POST = defineRoute(
  { tag: 'api/tasks/batch', code: 'INTERNAL', message: 'Batch operation failed' },
  async (req: Request) => {
    const user = await getAuthUser()
    const { ids, action, projectId } = await parseJsonBody(req, batchTaskSchema)

    const now = new Date()

    switch (action) {
      case 'complete':
        await taskRepo.bulkComplete(user.id, ids, now)
        break

      case 'activate':
        await taskRepo.bulkActivate(user.id, ids, now)
        break

      case 'delete':
        await taskRepo.deleteManyTasks(ids, user.id)
        break

      case 'reassign': {
        if (!projectId) return error('BAD_REQUEST', 'projectId is required for reassign', 400)
        const matter = await ensureMatterForProject(user.id, projectId)
        if (!matter) return error('NOT_FOUND', 'Project not found', 404)
        await taskRepo.bulkSetMatter(user.id, ids, matter.id)
        break
      }

      default:
        return error('BAD_REQUEST', `Unknown action: ${action}`, 400)
    }

    invalidateStatsCache(user.id)
    return success({ affected: ids.length })
  },
)

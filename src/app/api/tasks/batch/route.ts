export const dynamic = 'force-dynamic'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import * as taskRepo from '@/repositories/task-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'

type BatchAction = 'complete' | 'activate' | 'delete' | 'reassign'

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const { ids, action, projectId }: { ids: string[]; action: BatchAction; projectId?: string } = await req.json()

    if (!ids || ids.length === 0) return error('BAD_REQUEST', 'ids is required', 400)
    if (!action) return error('BAD_REQUEST', 'action is required', 400)

    const now = new Date()

    switch (action) {
      case 'complete':
        await prisma.task.updateMany({
          where: { id: { in: ids }, userId: user.id },
          data: { status: 'completed', completedAt: now, dismissedAt: null },
        })
        break

      case 'activate':
        await prisma.task.updateMany({
          where: { id: { in: ids }, userId: user.id },
          data: { status: 'active', activeAt: now, dismissedAt: null, completedAt: null },
        })
        break

      case 'delete':
        await taskRepo.deleteManyTasks(ids, user.id)
        break

      case 'reassign': {
        if (!projectId) return error('BAD_REQUEST', 'projectId is required for reassign', 400)
        const project = await prisma.projectContext.findFirst({
          where: { id: projectId, userId: user.id },
        })
        if (!project) return error('NOT_FOUND', 'Project not found', 404)
        let matter = await prisma.matterMemory.findFirst({
          where: { userId: user.id, projectContextId: projectId },
        })
        if (!matter) {
          matter = await prisma.matterMemory.create({
            data: {
              userId: user.id,
              projectContextId: projectId,
              title: project.name,
              summary: 'Manually assigned to this project',
              status: 'open',
              topic: 'other',
            },
          })
        }
        await prisma.task.updateMany({
          where: { id: { in: ids }, userId: user.id },
          data: { matterId: matter.id },
        })
        break
      }

      default:
        return error('BAD_REQUEST', `Unknown action: ${action}`, 400)
    }

    invalidateStatsCache(user.id)
    return success({ affected: ids.length })
  } catch (err) {
    console.error('[api/tasks/batch]', err)
    return errorFromException(err, 'INTERNAL', 'Batch operation failed', 500)
  }
}

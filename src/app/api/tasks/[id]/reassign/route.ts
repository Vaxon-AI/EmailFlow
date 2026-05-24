import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { ensureMatterForProject } from '@/services/project-matter-service'
import { parseJsonBody } from '@/lib/api-helpers'
import { z } from 'zod'

const reassignTaskSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id: taskId } = await params
    const { projectId } = await parseJsonBody(req, reassignTaskSchema)

    const task = await prisma.task.findFirst({ where: { id: taskId, userId: user.id } })
    if (!task) return error('NOT_FOUND', 'Task not found', 404)
    const matter = await ensureMatterForProject(user.id, projectId)
    if (!matter) return error('NOT_FOUND', 'Project not found', 404)

    await prisma.task.update({ where: { id: taskId }, data: { matterId: matter.id } })

    return success({ taskId, matterId: matter.id })
  } catch (err) {
    console.error('[api/tasks/reassign]', err)
    return errorFromException(err, 'INTERNAL', 'Failed to reassign task', 500)
  }
}

import { errorFromException, getAuthUser, success, error, parseJsonBody } from '@/lib/api-helpers'
import { findTaskOwnedBy, setMatter } from '@/repositories/task-repo'
import { ensureMatterForProject } from '@/services/project-matter-service'
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

    const task = await findTaskOwnedBy(user.id, taskId)
    if (!task) return error('NOT_FOUND', 'Task not found', 404)
    const matter = await ensureMatterForProject(user.id, projectId)
    if (!matter) return error('NOT_FOUND', 'Project not found', 404)

    await setMatter(user.id, taskId, matter.id)

    return success({ taskId, matterId: matter.id })
  } catch (err) {
    console.error('[api/tasks/reassign]', err)
    return errorFromException(err, 'INTERNAL', 'Failed to reassign task', 500)
  }
}

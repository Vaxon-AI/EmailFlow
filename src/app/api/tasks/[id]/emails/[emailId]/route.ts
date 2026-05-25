export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import * as taskRepo from '@/repositories/task-repo'
import * as emailRepo from '@/repositories/email-repo'

type RouteParams = { params: Promise<{ id: string; emailId: string }> }

async function resolveTaskAndEmailIds(params: Promise<{ id: string; emailId: string }>) {
  const { id: taskId, emailId } = await params
  return { taskId, emailId }
}

async function ensureTaskExists(userId: string, taskId: string) {
  const task = await taskRepo.findTaskById(userId, taskId)
  if (!task) {
    return { errorResponse: error('NOT_FOUND', 'Task not found', 404) }
  }

  return { task }
}

export const POST = defineRoute(
  { tag: 'api/tasks/[id]/emails/[emailId] POST', message: 'Failed to link email' },
  async (_req: NextRequest, { params }: RouteParams) => {
    const user = await getAuthUser()
    const { taskId, emailId } = await resolveTaskAndEmailIds(params)

    const taskState = await ensureTaskExists(user.id, taskId)
    if (taskState.errorResponse) return taskState.errorResponse

    const emailExists = await emailRepo.existsForUser(user.id, emailId)
    if (!emailExists) return error('NOT_FOUND', 'Email not found', 404)

    await taskRepo.linkEmailToTask(taskId, emailId)
    await emailRepo.bulkMarkActioned(user.id, [emailId])

    return success({ message: 'Email linked to task' })
  },
)

export const DELETE = defineRoute(
  { tag: 'api/tasks/[id]/emails/[emailId] DELETE', message: 'Failed to unlink email' },
  async (_req: NextRequest, { params }: RouteParams) => {
    const user = await getAuthUser()
    const { taskId, emailId } = await resolveTaskAndEmailIds(params)

    const taskState = await ensureTaskExists(user.id, taskId)
    if (taskState.errorResponse) return taskState.errorResponse

    await taskRepo.unlinkTaskFromEmail(emailId, taskId)
    return success({ message: 'Email unlinked from task' })
  },
)

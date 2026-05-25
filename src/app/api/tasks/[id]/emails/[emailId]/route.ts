export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import * as taskRepo from '@/repositories/task-repo'
import * as emailRepo from '@/repositories/email-repo'

export const POST = defineRoute(
  { tag: 'api/tasks/[id]/emails/[emailId] POST', message: 'Failed to link email' },
  async (req: NextRequest, { params }: { params: Promise<{ id: string; emailId: string }> }) => {
    const user = await getAuthUser()
    const { id: taskId, emailId } = await params

    const task = await taskRepo.findTaskById(user.id, taskId)
    if (!task) return error('NOT_FOUND', 'Task not found', 404)

    const emailExists = await emailRepo.existsForUser(user.id, emailId)
    if (!emailExists) return error('NOT_FOUND', 'Email not found', 404)

    await taskRepo.linkEmailToTask(taskId, emailId)
    await emailRepo.bulkMarkActioned(user.id, [emailId])

    return success({ message: 'Email linked to task' })
  },
)

export const DELETE = defineRoute(
  { tag: 'api/tasks/[id]/emails/[emailId] DELETE', message: 'Failed to unlink email' },
  async (req: NextRequest, { params }: { params: Promise<{ id: string; emailId: string }> }) => {
    const user = await getAuthUser()
    const { id: taskId, emailId } = await params

    const task = await taskRepo.findTaskById(user.id, taskId)
    if (!task) return error('NOT_FOUND', 'Task not found', 404)

    await taskRepo.unlinkTaskFromEmail(emailId, taskId)
    return success({ message: 'Email unlinked from task' })
  },
)

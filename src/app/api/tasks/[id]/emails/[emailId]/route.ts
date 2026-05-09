export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import * as taskRepo from '@/repositories/task-repo'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id: taskId, emailId } = await params

    const task = await taskRepo.findTaskById(user.id, taskId)
    if (!task) return error('NOT_FOUND', 'Task not found', 404)

    const email = await prisma.email.findFirst({
      where: { id: emailId, userId: user.id },
      select: { id: true },
    })
    if (!email) return error('NOT_FOUND', 'Email not found', 404)

    await prisma.taskEmail.createMany({
      data: [{ taskId, emailId, relationship: 'source' }],
      skipDuplicates: true,
    })

    return success({ message: 'Email linked to task' })
  } catch (err) {
    console.error('[api/tasks/[id]/emails/[emailId] POST]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to link email', 500)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id: taskId, emailId } = await params

    const task = await taskRepo.findTaskById(user.id, taskId)
    if (!task) return error('NOT_FOUND', 'Task not found', 404)

    await prisma.taskEmail.deleteMany({
      where: {
        taskId,
        emailId,
      },
    })
    return success({ message: 'Email unlinked from task' })
  } catch (err) {
    console.error('[api/tasks/[id]/emails/[emailId]]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to unlink email', 500)
  }
}

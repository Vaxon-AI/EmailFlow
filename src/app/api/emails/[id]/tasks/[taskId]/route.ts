export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { unlinkTaskFromEmail } from '@/repositories/task-repo'

export const DELETE = defineRoute(
  { tag: 'api/emails/[id]/tasks/[taskId]', message: 'Failed to unlink task' },
  async (req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) => {
    const user = await getAuthUser()
    const { id: emailId, taskId } = await params

    const email = await emailRepo.findEmailById(user.id, emailId)
    if (!email) return error('NOT_FOUND', 'Email not found', 404)

    await unlinkTaskFromEmail(emailId, taskId)
    return success({ message: 'Task unlinked from email' })
  },
)

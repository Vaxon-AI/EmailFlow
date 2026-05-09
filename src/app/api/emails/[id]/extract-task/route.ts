import { after } from 'next/server'
import { getAuthUser, errorFromException, error, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { createTaskFromClassifiedEmail, processEmail } from '@/workflows'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id: emailId } = await params

    const email = await emailRepo.findEmailById(user.id, emailId)
    if (!email) return error('NOT_FOUND', 'Email not found', 404)
    const canExtract = email.classification === 'action' || email.classification === 'uncertain'
    if (!canExtract) {
      return error('INVALID_STATE', 'Only Needs Action or Uncertain emails can be extracted into tasks', 400)
    }

    // Prevent duplicate if an active task is already linked
    const taskLinks = (email as typeof email & { taskLinks?: { task?: { status?: string } | null }[] }).taskLinks ?? []
    const hasActiveTask = taskLinks.some(
      (l) => l.task && !['completed', 'dismissed'].includes(l.task.status ?? '')
    )
    if (hasActiveTask) {
      return error('ALREADY_HAS_TASK', 'A task is already linked to this email', 409)
    }

    const wasUncertain = email.classification === 'uncertain'
    if (wasUncertain) {
      await emailRepo.setEmailBucket(emailId, 'tracked')
    }

    if (email.awaitingReview && !wasUncertain) {
      // Existing path: atomic claim prevents double-extraction
      after(async () => {
        try {
          await createTaskFromClassifiedEmail(user.id, emailId, 'pending')
        } catch (err) {
          console.error(`[extract-task] awaitingReview path failed for ${emailId}:`, err)
        }
      })
    } else {
      // User-confirmed extraction: treat the email as actionable and create an
      // AI suggestion, even when the original AI classification was uncertain.
      after(async () => {
        try {
          await processEmail(user.id, {
            id: email.id,
            subject: email.subject,
            sender: email.sender,
            receivedAt: email.receivedAt,
            bodyPreview: email.bodyPreview,
            bodyFull: email.bodyFull,
            labels: email.labels,
            threadId: email.threadId,
            awaitingReview: false,
            taskStatus: 'pending',
            forceAction: true,
          })
        } catch (err) {
          console.error(`[extract-task] manual path failed for ${emailId}:`, err)
        }
      })
    }

    return success({ queued: true })
  } catch (err) {
    return errorFromException(err, 'EXTRACT_FAILED', 'Failed to extract task', 500)
  }
}

import { after } from 'next/server'
import { getAuthUser, errorFromException, error, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { createTaskFromClassifiedEmail } from '@/workflows'

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const body = await req.json()
    const { action, emailIds } = body as { action: 'approve' | 'ignore'; emailIds: string[] }

    if (!action || !Array.isArray(emailIds) || emailIds.length === 0) {
      return error('INVALID_INPUT', 'Missing action or emailIds', 400)
    }

    if (action !== 'approve' && action !== 'ignore') {
      return error('INVALID_INPUT', 'action must be approve or ignore', 400)
    }

    if (action === 'ignore') {
      await emailRepo.dismissReviewEmails(emailIds)
      return success({ action, count: emailIds.length })
    }

    // approve: createTaskFromClassifiedEmail handles clearing awaitingReview internally
    after(async () => {
      for (const emailId of emailIds) {
        try {
          await createTaskFromClassifiedEmail(user.id, emailId, 'pending')
        } catch (err) {
          console.error(`[review/approve] failed for email ${emailId}:`, err)
        }
      }
    })

    return success({ action, count: emailIds.length })
  } catch (err) {
    return errorFromException(err, 'REVIEW_FAILED', 'Failed to process review action', 500)
  }
}

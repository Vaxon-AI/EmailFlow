import { after } from 'next/server'
import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { createTaskFromClassifiedEmail } from '@/workflows'

export const POST = defineRoute(
  { tag: 'api/emails/review POST', code: 'REVIEW_FAILED', message: 'Failed to process review action' },
  async (req: Request) => {
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
          await createTaskFromClassifiedEmail(user.id, emailId, 'ai_suggestion')
        } catch (err) {
          console.error(`[review/approve] failed for email ${emailId}:`, err)
        }
      }
    })

    return success({ action, count: emailIds.length })
  },
)

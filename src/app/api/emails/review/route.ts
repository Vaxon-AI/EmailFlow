import { after } from 'next/server'
import { z } from 'zod'
import { defineRoute, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { createTaskFromClassifiedEmail } from '@/workflows'

const reviewActionSchema = z.object({
  action: z.enum(['approve', 'ignore'], {
    error: () => ({ message: 'action must be approve or ignore' }),
  }),
  emailIds: z.array(z.string()).min(1, 'Missing action or emailIds'),
})

export const POST = defineRoute(
  { tag: 'api/emails/review POST', code: 'REVIEW_FAILED', message: 'Failed to process review action' },
  async (req: Request) => {
    const user = await getAuthUser()
    const { action, emailIds } = await parseJsonBody(req, reviewActionSchema, {
      code: 'INVALID_INPUT',
      message: 'Missing action or emailIds',
      status: 400,
    })

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

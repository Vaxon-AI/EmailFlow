import { after } from 'next/server'
import { defineRoute, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
import { setManualReviewMode } from '@/repositories/user-repo'
import { findAwaitingReviewIds } from '@/repositories/email-repo'
import { createTaskFromClassifiedEmail } from '@/workflows'
import { z } from 'zod'

const reviewModeSchema = z.object({
  manualReviewMode: z.boolean({ message: 'manualReviewMode must be a boolean' }),
})

export const POST = defineRoute(
  { tag: 'api/settings/review-mode POST', code: 'UPDATE_FAILED', message: 'Failed to update review mode' },
  async (req: Request) => {
    const user = await getAuthUser()
    const { manualReviewMode } = await parseJsonBody(req, reviewModeSchema, {
      code: 'INVALID_INPUT',
    })

    await setManualReviewMode(user.id, manualReviewMode)

    // When switching to auto, kick off task creation for all pending review emails
    if (!manualReviewMode) {
      const emailIds = await findAwaitingReviewIds(user.id)

      if (emailIds.length > 0) {
        after(async () => {
          for (const emailId of emailIds) {
            try {
              await createTaskFromClassifiedEmail(user.id, emailId, 'ai_suggestion')
            } catch (err) {
              console.error(`[settings/review-mode] failed for email ${emailId}:`, err)
            }
          }
        })
      }
    }

    return success({ manualReviewMode })
  },
)

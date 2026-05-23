import { after } from 'next/server'
import { getAuthUser, errorFromException, error, success } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { createTaskFromClassifiedEmail } from '@/workflows'

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const body = await req.json()
    const { manualReviewMode } = body as { manualReviewMode: boolean }

    if (typeof manualReviewMode !== 'boolean') {
      return error('INVALID_INPUT', 'manualReviewMode must be a boolean', 400)
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { manualReviewMode },
    })

    // When switching to auto, kick off task creation for all pending review emails
    if (!manualReviewMode) {
      const pendingEmails = await prisma.email.findMany({
        where: { userId: user.id, awaitingReview: true },
        select: { id: true },
      })

      if (pendingEmails.length > 0) {
        const emailIds = pendingEmails.map((e) => e.id)
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
  } catch (err) {
    return errorFromException(err, 'UPDATE_FAILED', 'Failed to update review mode', 500)
  }
}

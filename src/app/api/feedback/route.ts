export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorFromException, getAuthUser, success, parseJsonBody } from '@/lib/api-helpers'
import { createFeedback } from '@/repositories/feedback-repo'

const MAX_MESSAGE_LENGTH = 2000
const MAX_EMAIL_LENGTH = 200

const feedbackSchema = z.object({
  category: z.enum(['bug', 'idea', 'other'], 'Invalid category'),
  message: z
    .string('Message is required')
    .trim()
    .min(1, 'Message is required')
    .max(MAX_MESSAGE_LENGTH, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`),
  email: z.string().max(MAX_EMAIL_LENGTH, 'Invalid email').nullish(),
})

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    const { category, message, email } = await parseJsonBody(req, feedbackSchema, {
      code: 'BAD_REQUEST',
    })

    const feedback = await createFeedback({
      userId: user.id,
      category,
      message,
      email: email?.trim() || null,
    })

    return success(feedback)
  } catch (err) {
    console.error('[api/feedback]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to submit feedback', 500)
  }
}

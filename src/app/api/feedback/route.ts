export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { defineRoute, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
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

export const POST = defineRoute(
  { tag: 'api/feedback POST', message: 'Failed to submit feedback' },
  async (req: NextRequest) => {
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
  },
)

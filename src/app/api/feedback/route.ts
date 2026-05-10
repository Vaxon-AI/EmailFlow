export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'

const ALLOWED_CATEGORIES = ['bug', 'idea', 'other'] as const
const MAX_MESSAGE_LENGTH = 2000
const MAX_EMAIL_LENGTH = 200

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()
    const { category, message, email } = await req.json()

    if (typeof message !== 'string' || !message.trim()) {
      return error('BAD_REQUEST', 'Message is required', 400)
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return error('BAD_REQUEST', `Message must be at most ${MAX_MESSAGE_LENGTH} characters`, 400)
    }
    if (typeof category !== 'string' || !ALLOWED_CATEGORIES.includes(category as typeof ALLOWED_CATEGORIES[number])) {
      return error('BAD_REQUEST', 'Invalid category', 400)
    }
    if (email != null && (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH)) {
      return error('BAD_REQUEST', 'Invalid email', 400)
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId: user.id,
        category,
        message: message.trim(),
        email: email?.trim() || null,
      },
      select: { id: true, createdAt: true },
    })

    return success(feedback)
  } catch (err) {
    console.error('[api/feedback]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to submit feedback', 500)
  }
}

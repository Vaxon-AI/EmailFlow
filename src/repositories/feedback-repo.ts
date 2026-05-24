import { prisma } from '@/lib/prisma'

export async function createFeedback(input: {
  userId: string
  category: string
  message: string
  email: string | null
}) {
  return prisma.feedback.create({
    data: {
      userId: input.userId,
      category: input.category,
      message: input.message,
      email: input.email,
    },
    select: { id: true, createdAt: true },
  })
}

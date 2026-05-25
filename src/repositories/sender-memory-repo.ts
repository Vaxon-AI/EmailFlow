import { prisma } from '@/lib/prisma'

export type SenderMemoryCategory = 'action' | 'awareness' | 'ignore'

export async function findByUserAndSender(userId: string, sender: string) {
  return prisma.senderMemory.findUnique({
    where: { userId_sender: { userId, sender } },
  })
}

export async function incrementSenderMemory(
  userId: string,
  sender: string,
  category: SenderMemoryCategory,
) {
  const existing = await findByUserAndSender(userId, sender)

  if (!existing) {
    return prisma.senderMemory.create({
      data: {
        userId,
        sender,
        actionCount: category === 'action' ? 1 : 0,
        awarenessCount: category === 'awareness' ? 1 : 0,
        ignoreCount: category === 'ignore' ? 1 : 0,
      },
    })
  }

  return prisma.senderMemory.update({
    where: { userId_sender: { userId, sender } },
    data: {
      actionCount: existing.actionCount + (category === 'action' ? 1 : 0),
      awarenessCount: existing.awarenessCount + (category === 'awareness' ? 1 : 0),
      ignoreCount: existing.ignoreCount + (category === 'ignore' ? 1 : 0),
    },
  })
}

import { prisma } from '@/lib/prisma'

export async function findByTokenHashWithUser(tokenHash: string) {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  })
}

export async function findLatestForUser(userId: string) {
  return prisma.passwordResetToken.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function invalidateAllActiveForUser(userId: string) {
  return prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })
}

export async function createResetToken(input: { userId: string; tokenHash: string; expiresAt: Date }) {
  return prisma.passwordResetToken.create({
    data: input,
  })
}

export async function applyResetPassword(input: {
  userId: string
  passwordHash: string
  tokenId: string
}) {
  return prisma.$transaction([
    prisma.user.update({
      where: { id: input.userId },
      data: { passwordHash: input.passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: input.tokenId },
      data: { usedAt: new Date() },
    }),
  ])
}

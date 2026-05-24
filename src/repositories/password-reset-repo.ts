import { prisma } from '@/lib/prisma'

const TOKEN_WITH_USER_INCLUDE = { user: true } as const
const LATEST_TOKEN_ORDER = { createdAt: 'desc' } as const

function activeResetTokenWhere(userId: string, now = new Date()) {
  return { userId, usedAt: null, expiresAt: { gt: now } }
}

function usedAtData(now = new Date()) {
  return { usedAt: now }
}

function passwordResetTransaction(input: {
  userId: string
  passwordHash: string
  tokenId: string
}): [
  ReturnType<typeof prisma.user.update>,
  ReturnType<typeof prisma.passwordResetToken.update>,
] {
  return [
    prisma.user.update({
      where: { id: input.userId },
      data: { passwordHash: input.passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: input.tokenId },
      data: usedAtData(),
    }),
  ]
}

export async function findByTokenHashWithUser(tokenHash: string) {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: TOKEN_WITH_USER_INCLUDE,
  })
}

export async function findLatestForUser(userId: string) {
  return prisma.passwordResetToken.findFirst({
    where: { userId },
    orderBy: LATEST_TOKEN_ORDER,
  })
}

export async function invalidateAllActiveForUser(userId: string) {
  return prisma.passwordResetToken.updateMany({
    where: activeResetTokenWhere(userId),
    data: usedAtData(),
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
  return prisma.$transaction(passwordResetTransaction(input))
}

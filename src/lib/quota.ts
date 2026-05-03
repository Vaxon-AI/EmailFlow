import { prisma } from '@/lib/prisma'

export const FREE_CLASSIFY_LIMIT = 100
export const FREE_EXTRACT_LIMIT = 10
const QUOTA_PERIOD_MS = 30 * 24 * 60 * 60 * 1000

async function maybeResetQuota(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - QUOTA_PERIOD_MS)
  await prisma.user.updateMany({
    where: { id: userId, quotaResetAt: { lt: cutoff } },
    data: { classifyUsed: 0, extractUsed: 0, quotaResetAt: new Date() },
  })
}

export async function getClassifyRemaining(userId: string): Promise<number> {
  await maybeResetQuota(userId)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true, classifyUsed: true },
  })
  if (user.plan !== 'free') return Infinity
  return Math.max(0, FREE_CLASSIFY_LIMIT - user.classifyUsed)
}

export async function getExtractRemaining(userId: string): Promise<number> {
  await maybeResetQuota(userId)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true, extractUsed: true },
  })
  if (user.plan !== 'free') return Infinity
  return Math.max(0, FREE_EXTRACT_LIMIT - user.extractUsed)
}

export async function incrementClassifyUsed(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { classifyUsed: { increment: 1 } },
  })
}

export async function incrementExtractUsed(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { extractUsed: { increment: 1 } },
  })
}

export async function getQuotaStatus(userId: string) {
  await maybeResetQuota(userId)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true, classifyUsed: true, extractUsed: true, quotaResetAt: true },
  })
  const isPro = user.plan !== 'free'
  const resetAt = new Date(user.quotaResetAt.getTime() + QUOTA_PERIOD_MS)
  return {
    plan: user.plan,
    classify: {
      used: user.classifyUsed,
      limit: isPro ? null : FREE_CLASSIFY_LIMIT,
      resetAt,
    },
    extract: {
      used: user.extractUsed,
      limit: isPro ? null : FREE_EXTRACT_LIMIT,
      resetAt,
    },
  }
}

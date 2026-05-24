import { prisma } from '@/lib/prisma'

export const FREE_CLASSIFY_LIMIT = 100
export const FREE_EXTRACT_LIMIT = 10
export const FREE_PASTE_TEXT_LIMIT = 3
const QUOTA_PERIOD_MS = 30 * 24 * 60 * 60 * 1000

type QuotaPlan = 'free' | string
type QuotaField = 'classifyUsed' | 'extractUsed' | 'pasteTextUsed'

function isFreePlan(plan: QuotaPlan) {
  return plan === 'free'
}

function remainingQuota(limit: number, used: number) {
  return Math.max(0, limit - used)
}

async function getQuotaFieldValue<T extends 'classifyUsed' | 'extractUsed' | 'pasteTextUsed'>(
  userId: string,
  field: T,
) {
  await maybeResetQuota(userId)
  switch (field) {
    case 'classifyUsed': {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { plan: true, classifyUsed: true },
      })
      return { plan: user.plan, used: user.classifyUsed }
    }
    case 'extractUsed': {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { plan: true, extractUsed: true },
      })
      return { plan: user.plan, used: user.extractUsed }
    }
    case 'pasteTextUsed': {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { plan: true, pasteTextUsed: true },
      })
      return { plan: user.plan, used: user.pasteTextUsed }
    }
  }
}

async function getRemainingQuota(
  userId: string,
  field: QuotaField,
  limit: number,
): Promise<number> {
  const { plan, used } = await getQuotaFieldValue(userId, field)
  if (!isFreePlan(plan)) return Infinity
  return remainingQuota(limit, used)
}

async function incrementQuotaField(
  userId: string,
  field: QuotaField,
): Promise<void> {
  switch (field) {
    case 'classifyUsed':
      await prisma.user.update({
        where: { id: userId },
        data: { classifyUsed: { increment: 1 } },
      })
      return
    case 'extractUsed':
      await prisma.user.update({
        where: { id: userId },
        data: { extractUsed: { increment: 1 } },
      })
      return
    case 'pasteTextUsed':
      await prisma.user.update({
        where: { id: userId },
        data: { pasteTextUsed: { increment: 1 } },
      })
      return
  }
}

async function maybeResetQuota(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - QUOTA_PERIOD_MS)
  await prisma.user.updateMany({
    where: { id: userId, quotaResetAt: { lt: cutoff } },
    data: { classifyUsed: 0, extractUsed: 0, pasteTextUsed: 0, quotaResetAt: new Date() },
  })
}

export async function getClassifyRemaining(userId: string): Promise<number> {
  return getRemainingQuota(userId, 'classifyUsed', FREE_CLASSIFY_LIMIT)
}

export async function getExtractRemaining(userId: string): Promise<number> {
  return getRemainingQuota(userId, 'extractUsed', FREE_EXTRACT_LIMIT)
}

export async function getPasteTextRemaining(userId: string): Promise<number> {
  return getRemainingQuota(userId, 'pasteTextUsed', FREE_PASTE_TEXT_LIMIT)
}

export async function incrementClassifyUsed(userId: string): Promise<void> {
  await incrementQuotaField(userId, 'classifyUsed')
}

export async function incrementExtractUsed(userId: string): Promise<void> {
  await incrementQuotaField(userId, 'extractUsed')
}

export async function incrementPasteTextUsed(userId: string): Promise<void> {
  await incrementQuotaField(userId, 'pasteTextUsed')
}

export async function getQuotaStatus(userId: string) {
  await maybeResetQuota(userId)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true, classifyUsed: true, extractUsed: true, pasteTextUsed: true, quotaResetAt: true },
  })
  const isPro = !isFreePlan(user.plan)
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
    pasteText: {
      used: user.pasteTextUsed,
      limit: isPro ? null : FREE_PASTE_TEXT_LIMIT,
      resetAt,
    },
  }
}

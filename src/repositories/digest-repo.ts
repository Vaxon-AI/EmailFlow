import { prisma } from '@/lib/prisma'

// ============================================================
// Digest Repository — all digest database operations
// ============================================================

export interface CreateDigestData {
  userId: string
  period: string
  periodStart: Date
  periodEnd: Date
  content: string
  stats: Record<string, number>
  isPreview?: boolean
}

function periodEndExclusive(period: string, periodStart: Date) {
  const days = period === 'weekly' ? 7 : 1
  return new Date(periodStart.getTime() + days * 24 * 60 * 60 * 1000)
}

export async function createDigest(data: CreateDigestData) {
  const isPreview = data.isPreview ?? false
  const existingDigests = await prisma.digest.findMany({
    where: {
      userId: data.userId,
      period: data.period,
      periodStart: {
        gte: data.periodStart,
        lt: periodEndExclusive(data.period, data.periodStart),
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  const [existing, ...duplicates] = existingDigests

  if (existing) {
    const [updated] = await prisma.$transaction([
      prisma.digest.update({
        where: { id: existing.id },
        data: {
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          content: data.content,
          stats: JSON.stringify(data.stats),
          isPreview,
          createdAt: new Date(),
        },
      }),
      ...(duplicates.length
        ? [prisma.digest.deleteMany({ where: { id: { in: duplicates.map((digest) => digest.id) } } })]
        : []),
    ])

    return updated
  }

  return prisma.digest.create({
    data: {
      userId: data.userId,
      period: data.period,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      content: data.content,
      stats: JSON.stringify(data.stats),
      isPreview,
    },
  })
}

export async function findDigestsPaginated(
  userId: string,
  options: { page: number; limit: number }
) {
  const [digests, total] = await Promise.all([
    prisma.digest.findMany({
      where: { userId },
      orderBy: { periodStart: 'desc' },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    }),
    prisma.digest.count({ where: { userId } }),
  ])

  return { digests, total }
}

export async function deleteExpiredDigests(
  userId: string,
  dailyRetentionDays: number,
  weeklyRetentionDays: number
): Promise<{ dailyDeleted: number; weeklyDeleted: number }> {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const dailyCutoff = new Date(now - dailyRetentionDays * dayMs)
  const weeklyCutoff = new Date(now - weeklyRetentionDays * dayMs)

  const [daily, weekly] = await prisma.$transaction([
    prisma.digest.deleteMany({
      where: { userId, period: 'daily', periodEnd: { lt: dailyCutoff } },
    }),
    prisma.digest.deleteMany({
      where: { userId, period: 'weekly', periodEnd: { lt: weeklyCutoff } },
    }),
  ])

  return { dailyDeleted: daily.count, weeklyDeleted: weekly.count }
}

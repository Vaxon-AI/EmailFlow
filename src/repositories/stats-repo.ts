import { prisma } from '@/lib/prisma'

// ============================================================
// Stats Repository — aggregated counts for dashboard
// ============================================================

type DashboardStats = {
  emails: { total: number; action: number; awareness: number; ignore: number; uncertain: number; unclassified: number }
  tasks: { total: number; pending: number; active: number; completed: number }
  sync: {
    lastSyncAt: Date | null | undefined
    emailConnected: boolean | undefined
    syncEnabled: boolean | undefined
    providerReauthRequired: boolean | undefined
    providerReauthReason: string | null | undefined
    providerReauthAt: Date | null | undefined
    providerReauthProvider: string | null | undefined
  }
}

// Per-user in-memory cache — survives across requests in the same process instance
const statsCache = new Map<string, { stats: DashboardStats; expiresAt: number }>()
const CACHE_TTL_MS = 45_000 // 45 seconds

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const cached = statsCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.stats
  }

  // 3 queries instead of 10: groupBy replaces individual counts
  const [emailGroups, taskGroups, userInfo] = await Promise.all([
    prisma.email.groupBy({
      by: ['classification'],
      where: { userId },
      _count: { id: true },
    }),
    prisma.task.groupBy({
      by: ['status'],
      where: { userId, archivedAt: null },
      _count: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastSyncAt: true,
        syncEnabled: true,
        emailProviderReauthRequired: true,
        emailProviderReauthReason: true,
        emailProviderReauthAt: true,
        emailProviderReauthProvider: true,
        accounts: {
          where: { provider: 'google', syncEnabled: true },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ])

  const emailCount = (cls: string | null) =>
    emailGroups.find((g) => g.classification === cls)?._count.id ?? 0

  const taskCount = (status: string) =>
    taskGroups.find((g) => g.status === status)?._count.id ?? 0

  // unclassified = quota_skipped (null classification) + uncertain — both
  // need user attention and now share the same Unclassified tab.
  const unclassifiedTotal = emailCount(null) + emailCount('uncertain')
  // Headline total excludes the Unclassified group so it matches what's
  // visible in the inbox tabs (Needs Action / Tracked / FYI / Ignored).
  const emailTotal = emailGroups.reduce((sum, g) => sum + g._count.id, 0) - unclassifiedTotal
  const taskTotal = taskGroups.reduce((sum, g) => sum + g._count.id, 0)

  const stats: DashboardStats = {
    emails: {
      total: emailTotal,
      action: emailCount('action'),
      awareness: emailCount('awareness'),
      ignore: emailCount('ignore'),
      uncertain: emailCount('uncertain'),
      unclassified: unclassifiedTotal,
    },
    tasks: {
      total: taskTotal,
      pending: taskCount('ai_suggestion'),
      active: taskCount('active'),
      completed: taskCount('completed'),
    },
    sync: {
      lastSyncAt: userInfo?.lastSyncAt,
      emailConnected: (userInfo?.accounts.length ?? 0) > 0,
      syncEnabled: userInfo?.syncEnabled,
      providerReauthRequired: userInfo?.emailProviderReauthRequired,
      providerReauthReason: userInfo?.emailProviderReauthReason,
      providerReauthAt: userInfo?.emailProviderReauthAt,
      providerReauthProvider: userInfo?.emailProviderReauthProvider,
    },
  }

  statsCache.set(userId, { stats, expiresAt: Date.now() + CACHE_TTL_MS })
  return stats
}

export function invalidateStatsCache(userId: string) {
  statsCache.delete(userId)
}

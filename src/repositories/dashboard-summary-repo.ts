import { prisma } from '@/lib/prisma'
import { getPriorityBand } from '@/types/task'
import { Prisma } from '@prisma/client'

type PriorityCounts = {
  critical: number
  high: number
  medium: number
  low: number
}

type DashboardStats = {
  emails: { total: number; action: number; awareness: number; ignore: number; uncertain: number; linkedAction: number }
  tasks: { total: number; pending: number; confirmed: number; completed: number; dismissed: number }
  sync: {
    lastSyncAt: Date | null | undefined
    gmailConnected: boolean | undefined
    syncEnabled: boolean | undefined
    providerReauthRequired: boolean | undefined
    providerReauthReason: string | null | undefined
    providerReauthAt: Date | null | undefined
    providerReauthProvider: string | null | undefined
  }
}

type DashboardFilters = {
  identityIds?: string[]
  projectIds?: string[]
}

const UNCATEGORIZED = '__uncategorized__'

export async function getDashboardSummary(userId: string, filters: DashboardFilters = {}) {
  const taskWhere = buildTaskWhere(userId, filters)
  const emailWhere = await buildEmailWhere(userId, filters)

  const [emailGroups, linkedActionEmails, taskGroups, aiTaskGroups, userInfo, tasks, attentionEmails] = await Promise.all([
    prisma.email.groupBy({
      by: ['classification'],
      where: emailWhere,
      _count: { id: true },
    }),
    prisma.email.count({
      where: {
        ...emailWhere,
        classification: 'action',
        taskLinks: { some: {} },
      },
    }),
    prisma.task.groupBy({
      by: ['status'],
      where: taskWhere,
      _count: { id: true },
    }),
    prisma.task.groupBy({
      by: ['status'],
      where: {
        ...taskWhere,
        source: 'ai_auto',
        status: { in: ['confirmed', 'completed', 'dismissed'] },
      },
      _count: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastSyncAt: true,
        gmailConnected: true,
        syncEnabled: true,
        emailProviderReauthRequired: true,
        emailProviderReauthReason: true,
        emailProviderReauthAt: true,
        emailProviderReauthProvider: true,
      },
    }),
    prisma.task.findMany({
      where: taskWhere,
      orderBy: { priorityScore: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        priorityScore: true,
        explicitDeadline: true,
        inferredDeadline: true,
        userSetDeadline: true,
      },
    }),
    prisma.email.findMany({
      where: {
        ...emailWhere,
        OR: [{ classification: 'action' }, { classification: 'uncertain' }],
        taskLinks: { none: {} },
      },
      orderBy: { receivedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        subject: true,
        sender: true,
        classification: true,
      },
    }),
  ])

  const stats = buildStats(emailGroups, linkedActionEmails, taskGroups, userInfo)
  const taskSummary = buildTaskSummary(tasks, stats.tasks, aiTaskGroups)

  return {
    stats,
    tasks: taskSummary,
    attentionEmails,
  }
}

function buildTaskWhere(userId: string, filters: DashboardFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { userId }

  if (filters.projectIds?.length) {
    const projectIds = filters.projectIds.filter((id) => id !== UNCATEGORIZED)
    where.OR = [
      ...(projectIds.length ? [{ matter: { projectContextId: { in: projectIds } } }] : []),
      ...(filters.projectIds.includes(UNCATEGORIZED) ? [{ matterId: null }] : []),
    ]
  } else if (filters.identityIds?.length) {
    const identityIds = filters.identityIds.filter((id) => id !== UNCATEGORIZED)
    where.OR = [
      ...(identityIds.length ? [{ matter: { projectContext: { identityId: { in: identityIds } } } }] : []),
      ...(filters.identityIds.includes(UNCATEGORIZED)
        ? [{ matterId: null }, { matter: { projectContext: { identityId: null } } }]
        : []),
    ]
  }

  return where
}

async function buildEmailWhere(userId: string, filters: DashboardFilters): Promise<Prisma.EmailWhereInput> {
  const where: Prisma.EmailWhereInput = { userId }

  if (!filters.projectIds?.length && !filters.identityIds?.length) return where

  const projectIds = filters.projectIds?.filter((id) => id !== UNCATEGORIZED) ?? []
  const identityIds = filters.identityIds?.filter((id) => id !== UNCATEGORIZED) ?? []
  const includeUncategorizedProject = Boolean(filters.projectIds?.includes(UNCATEGORIZED))
  const includeUncategorizedIdentity = Boolean(filters.identityIds?.includes(UNCATEGORIZED))

  const threads = await prisma.threadMemory.findMany({
    where: {
      userId,
      OR: filters.projectIds?.length
        ? [
            ...(projectIds.length ? [{ matter: { projectContextId: { in: projectIds } } }] : []),
            ...(includeUncategorizedProject ? [{ matterId: null }] : []),
          ]
        : [
            ...(identityIds.length ? [{ matter: { projectContext: { identityId: { in: identityIds } } } }] : []),
            ...(includeUncategorizedIdentity
              ? [{ matterId: null }, { matter: { projectContext: { identityId: null } } }]
              : []),
          ],
    },
    select: { threadId: true },
  })

  const threadIds = threads.map((thread) => thread.threadId)
  if (includeUncategorizedProject || includeUncategorizedIdentity) {
    where.OR = [{ threadId: { in: threadIds } }, { threadId: null }]
  } else {
    where.threadId = { in: threadIds }
  }
  return where
}

function buildStats(
  emailGroups: Array<{ classification: string | null; _count: { id: number } }>,
  linkedActionEmails: number,
  taskGroups: Array<{ status: string; _count: { id: number } }>,
  userInfo: {
    lastSyncAt: Date | null
    gmailConnected: boolean
    syncEnabled: boolean
    emailProviderReauthRequired: boolean
    emailProviderReauthReason: string | null
    emailProviderReauthAt: Date | null
    emailProviderReauthProvider: string | null
  } | null
): DashboardStats {
  const emailCount = (classification: string | null) =>
    emailGroups.find((group) => group.classification === classification)?._count.id ?? 0

  const taskCount = (status: string) =>
    taskGroups.find((group) => group.status === status)?._count.id ?? 0

  const emailTotal = emailGroups.reduce((sum, group) => sum + group._count.id, 0)
  const taskTotal = taskGroups.reduce((sum, group) => sum + group._count.id, 0)
  const pending = taskCount('pending')
  const completed = taskCount('completed')
  const dismissed = taskCount('dismissed')

  return {
    emails: {
      total: emailTotal,
      action: emailCount('action'),
      awareness: emailCount('awareness'),
      ignore: emailCount('ignore'),
      uncertain: emailCount('uncertain'),
      linkedAction: linkedActionEmails,
    },
    tasks: {
      total: taskTotal,
      pending,
      confirmed: Math.max(0, taskTotal - pending - completed - dismissed),
      completed,
      dismissed,
    },
    sync: {
      lastSyncAt: userInfo?.lastSyncAt,
      gmailConnected: userInfo?.gmailConnected,
      syncEnabled: userInfo?.syncEnabled,
      providerReauthRequired: userInfo?.emailProviderReauthRequired,
      providerReauthReason: userInfo?.emailProviderReauthReason,
      providerReauthAt: userInfo?.emailProviderReauthAt,
      providerReauthProvider: userInfo?.emailProviderReauthProvider,
    },
  }
}

function buildTaskSummary(
  tasks: Array<{
    id: string
    title: string
    summary: string
    status: string
    priorityScore: number | null
    explicitDeadline: Date | null
    inferredDeadline: Date | null
    userSetDeadline: Date | null
  }>,
  taskStats: DashboardStats['tasks'],
  aiTaskGroups: Array<{ status: string; _count: { id: number } }>
) {
  const priorityCounts: PriorityCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  const now = Date.now()
  const weekFromNow = now + 7 * 86400000
  let upcomingCount = 0

  for (const task of tasks) {
    const band = getPriorityBand(task.priorityScore || 0)
    priorityCounts[band] += 1

    const deadline = task.userSetDeadline || task.explicitDeadline || task.inferredDeadline
    if (!deadline) continue

    const deadlineTime = deadline.getTime()
    const isActive = task.status === 'pending' || task.status === 'confirmed'
    if (isActive && deadlineTime >= now && deadlineTime <= weekFromNow) {
      upcomingCount += 1
    }
  }

  const aiAccepted = aiTaskGroups
    .filter((group) => group.status === 'confirmed' || group.status === 'completed')
    .reduce((sum, group) => sum + group._count.id, 0)
  const aiRejected = aiTaskGroups.find((group) => group.status === 'dismissed')?._count.id ?? 0

  return {
    confirmedPreview: tasks.filter((task) => task.status === 'confirmed').slice(0, 5),
    pendingPreview: tasks.filter((task) => task.status === 'pending').slice(0, 5),
    confirmedCount: taskStats.confirmed,
    pendingCount: taskStats.pending,
    dismissedCount: taskStats.dismissed,
    priorityCounts,
    upcomingCount,
    aiAcceptance: {
      accepted: aiAccepted,
      rejected: aiRejected,
      rate: aiAccepted + aiRejected > 0 ? Math.round((aiAccepted / (aiAccepted + aiRejected)) * 100) : null,
    },
  }
}

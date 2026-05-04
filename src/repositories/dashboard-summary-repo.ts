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
  emails: {
    total: number
    action: number
    awareness: number
    ignore: number
    uncertain: number
    linkedAction: number
    // New buckets driven by classification × actioned axis. needsReview and
    // tracked together replace the old "Needs Action / Needs Review" split.
    needsReview: number  // (action OR uncertain) AND actioned=false
    tracked: number      // actioned=true (regardless of classification)
  }
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
  view?: DashboardView
  timezoneOffset?: number
}

type DateRange = {
  start: Date
  end: Date
}

const UNCATEGORIZED = '__uncategorized__'
const MOMENTUM_DAYS = 14
const WEEK_MOMENTUM_DAYS = 7

export type DashboardView = 'today' | 'week' | 'all'

export async function getDashboardSummary(userId: string, filters: DashboardFilters = {}) {
  const view = filters.view ?? 'all'
  const now = new Date()
  const period = getPeriodRange(view, filters.timezoneOffset ?? 0, now)
  const isAllView = period === null
  const baseTaskWhere = buildTaskWhere(userId, filters)
  const baseEmailWhere = await buildEmailWhere(userId, filters)
  const taskWhere = applyTaskPeriod(baseTaskWhere, period, now)
  const emailWhere = applyEmailPeriod(baseEmailWhere, period)
  const momentumDays = view === 'today' ? 1 : view === 'week' ? WEEK_MOMENTUM_DAYS : MOMENTUM_DAYS
  const momentumStart = startOfUtcDay(addUtcDays(period?.start ?? now, -(momentumDays - 1)))

  // The "Needs Review" bucket: emails that need a human eye. Combines two
  // groups that were previously split:
  //   1. action emails the user hasn't yet turned into a task (actioned=false)
  //   2. uncertain emails the AI couldn't confidently classify
  // Once a task is created (or the user dismisses to ignore), actioned=true
  // and the email moves to Tracked / Ignored, exiting this bucket.
  // Failed-classification emails are excluded as technical failures, not real
  // pending work.
  const attentionEmailWhere: Prisma.EmailWhereInput = {
    classification: { in: ['action', 'uncertain'] },
    actioned: false,
    processingStatus: { not: 'failed' },
  }

  const [
    emailGroups,
    linkedActionEmails,
    needsReviewCount,
    trackedCount,
    taskGroups,
    aiTaskGroups,
    dueOrOverdueCount,
    overdueCount,
    userInfo,
    tasks,
    attentionEmails,
    allTimeAttentionEmailsRaw,
    allTimeAttentionEmailCountRaw,
    completedMomentumTasks,
    createdMomentumTasks,
    actionMomentumEmails,
    allTimeEmailGroupsRaw,
    allTimeLinkedActionEmailsRaw,
    allTimeNeedsReviewCountRaw,
    allTimeTrackedCountRaw,
    allTimeTaskGroupsRaw,
    allTimeAiTaskGroupsRaw,
    allTimeTasksRaw,
  ] = await Promise.all([
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
    prisma.email.count({
      where: { ...emailWhere, ...attentionEmailWhere },
    }),
    prisma.email.count({
      where: { ...emailWhere, actioned: true },
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
    prisma.task.count({
      where: andWhere(baseTaskWhere, {
        status: { in: ['pending', 'confirmed'] },
        OR: dueDateConditions(period ? { lte: period.end } : { gte: now, lte: addUtcDays(now, 7) }),
      }),
    }),
    prisma.task.count({
      where: andWhere(baseTaskWhere, {
        status: { in: ['pending', 'confirmed'] },
        OR: dueDateConditions({ lt: period?.start ?? now }),
      }),
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
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
    }),
    prisma.email.findMany({
      where: { ...emailWhere, ...attentionEmailWhere },
      orderBy: { receivedAt: 'desc' },
      take: 5,
      select: { id: true, subject: true, sender: true, classification: true },
    }),
    isAllView
      ? Promise.resolve(null)
      : prisma.email.findMany({
          where: { ...baseEmailWhere, ...attentionEmailWhere },
          orderBy: { receivedAt: 'desc' },
          take: 5,
          select: { id: true, subject: true, sender: true, classification: true },
        }),
    isAllView
      ? Promise.resolve(null)
      : prisma.email.count({ where: { ...baseEmailWhere, ...attentionEmailWhere } }),
    prisma.task.findMany({
      where: { ...taskWhere, completedAt: { gte: momentumStart } },
      select: { completedAt: true },
    }),
    prisma.task.findMany({
      where: { ...taskWhere, createdAt: { gte: momentumStart } },
      select: { createdAt: true },
    }),
    prisma.email.findMany({
      where: {
        ...emailWhere,
        classification: 'action',
        ...(period ? { receivedAt: { gte: momentumStart, lt: period.end } } : { receivedAt: { gte: momentumStart } }),
      },
      select: { receivedAt: true },
    }),
    isAllView
      ? Promise.resolve(null)
      : prisma.email.groupBy({ by: ['classification'], where: baseEmailWhere, _count: { id: true } }),
    isAllView
      ? Promise.resolve(null)
      : prisma.email.count({ where: { ...baseEmailWhere, classification: 'action', taskLinks: { some: {} } } }),
    isAllView
      ? Promise.resolve(null)
      : prisma.email.count({ where: { ...baseEmailWhere, ...attentionEmailWhere } }),
    isAllView
      ? Promise.resolve(null)
      : prisma.email.count({ where: { ...baseEmailWhere, actioned: true } }),
    isAllView
      ? Promise.resolve(null)
      : prisma.task.groupBy({ by: ['status'], where: baseTaskWhere, _count: { id: true } }),
    isAllView
      ? Promise.resolve(null)
      : prisma.task.groupBy({
          by: ['status'],
          where: { ...baseTaskWhere, source: 'ai_auto', status: { in: ['confirmed', 'completed', 'dismissed'] } },
          _count: { id: true },
        }),
    isAllView
      ? Promise.resolve(null)
      : prisma.task.findMany({
          where: baseTaskWhere,
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
            createdAt: true,
            updatedAt: true,
            completedAt: true,
          },
        }),
  ])

  const allTimeEmailGroups = allTimeEmailGroupsRaw ?? emailGroups
  const allTimeLinkedActionEmails = allTimeLinkedActionEmailsRaw ?? linkedActionEmails
  const allTimeNeedsReviewCount = allTimeNeedsReviewCountRaw ?? needsReviewCount
  const allTimeTrackedCount = allTimeTrackedCountRaw ?? trackedCount
  const allTimeTaskGroups = allTimeTaskGroupsRaw ?? taskGroups
  const allTimeAiTaskGroups = allTimeAiTaskGroupsRaw ?? aiTaskGroups
  const allTimeTasks = allTimeTasksRaw ?? tasks
  const allTimeAttentionEmails = allTimeAttentionEmailsRaw ?? attentionEmails
  const allTimeAttentionEmailCount = allTimeAttentionEmailCountRaw ?? attentionEmails.length

  const stats = buildStats(emailGroups, linkedActionEmails, needsReviewCount, trackedCount, taskGroups, userInfo)
  const taskSummary = {
    ...buildTaskSummary(tasks, stats.tasks, aiTaskGroups, period, now),
    upcomingCount: dueOrOverdueCount,
  }
  const momentum = buildMomentum(
    completedMomentumTasks,
    createdMomentumTasks,
    actionMomentumEmails,
    momentumDays,
    period?.start,
    filters.timezoneOffset ?? 0
  )
  const allTimeStats = buildStats(
    allTimeEmailGroups,
    allTimeLinkedActionEmails,
    allTimeNeedsReviewCount,
    allTimeTrackedCount,
    allTimeTaskGroups,
    userInfo,
  )
  const allTimeTaskSummary = buildTaskSummary(allTimeTasks, allTimeStats.tasks, allTimeAiTaskGroups, null, now)
  const feedback = buildFeedback(view, stats.tasks.completed, dueOrOverdueCount, overdueCount, allTimeStats.tasks)

  return {
    view,
    stats,
    tasks: taskSummary,
    attentionEmails: allTimeAttentionEmails,
    attentionEmailCount: allTimeAttentionEmailCount,
    momentum,
    feedback,
    currentPeriod: {
      stats,
      tasks: taskSummary,
      attentionEmails,
      attentionEmailCount: attentionEmails.length,
      momentum,
    },
    allTime: {
      stats: allTimeStats,
      tasks: allTimeTaskSummary,
    },
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

function applyTaskPeriod(where: Prisma.TaskWhereInput, period: DateRange | null, now: Date): Prisma.TaskWhereInput {
  if (!period) return where

  return andWhere(where, {
    OR: [
      { completedAt: { gte: period.start, lt: period.end } },
      {
        status: { in: ['pending', 'confirmed'] },
        OR: [
          { createdAt: { gte: period.start, lt: period.end } },
          { updatedAt: { gte: period.start, lt: period.end } },
          ...dueDateConditions({ lt: period.end }),
          ...dueDateConditions({ lt: now }),
        ],
      },
    ],
  })
}

function applyEmailPeriod(where: Prisma.EmailWhereInput, period: DateRange | null): Prisma.EmailWhereInput {
  if (!period) return where
  return andWhere(where, { receivedAt: { gte: period.start, lt: period.end } })
}

function andWhere<T extends Prisma.TaskWhereInput | Prisma.EmailWhereInput>(base: T, next: T): T {
  return { AND: [base, next] } as T
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
  needsReviewCount: number,
  trackedCount: number,
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
      needsReview: needsReviewCount,
      tracked: trackedCount,
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
    createdAt: Date
    updatedAt: Date
    completedAt: Date | null
  }>,
  taskStats: DashboardStats['tasks'],
  aiTaskGroups: Array<{ status: string; _count: { id: number } }>,
  period: DateRange | null,
  nowDate: Date
) {
  const priorityCounts: PriorityCounts = { critical: 0, high: 0, medium: 0, low: 0 }
  const now = nowDate.getTime()
  const upcomingEnd = period?.end.getTime() ?? now + 7 * 86400000
  let upcomingCount = 0

  for (const task of tasks) {
    const band = getPriorityBand(task.priorityScore || 0)
    priorityCounts[band] += 1

    const deadline = task.userSetDeadline || task.explicitDeadline || task.inferredDeadline
    if (!deadline) continue

    const deadlineTime = deadline.getTime()
    const isActive = task.status === 'pending' || task.status === 'confirmed'
    if (isActive && deadlineTime >= now && deadlineTime <= upcomingEnd) {
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

function buildMomentum(
  completedTasks: Array<{ completedAt: Date | null }>,
  createdTasks: Array<{ createdAt: Date }>,
  actionEmails: Array<{ receivedAt: Date }>,
  days = MOMENTUM_DAYS,
  startDate?: Date,
  timezoneOffset = 0
) {
  const buckets = new Map<string, { date: string; completedTasks: number; createdTasks: number; actionEmails: number }>()
  const start = startDate ?? startOfUtcDay(addUtcDays(new Date(), -(days - 1)))

  for (let index = 0; index < days; index += 1) {
    const date = toLocalDateKey(addUtcDays(start, index), timezoneOffset)
    buckets.set(date, { date, completedTasks: 0, createdTasks: 0, actionEmails: 0 })
  }

  for (const task of completedTasks) {
    if (!task.completedAt) continue
    const bucket = buckets.get(toLocalDateKey(task.completedAt, timezoneOffset))
    if (bucket) bucket.completedTasks += 1
  }

  for (const task of createdTasks) {
    const bucket = buckets.get(toLocalDateKey(task.createdAt, timezoneOffset))
    if (bucket) bucket.createdTasks += 1
  }

  for (const email of actionEmails) {
    const bucket = buckets.get(toLocalDateKey(email.receivedAt, timezoneOffset))
    if (bucket) bucket.actionEmails += 1
  }

  return Array.from(buckets.values())
}

function buildFeedback(
  view: DashboardView,
  completedInPeriod: number,
  openDueOrOverdueTasks: number,
  overdueOpenTasks: number,
  allTimeTaskStats: DashboardStats['tasks']
) {
  const allTimeOpenTasks = allTimeTaskStats.pending + allTimeTaskStats.confirmed
  const relevantTasks = openDueOrOverdueTasks + completedInPeriod
  const completionRate = relevantTasks > 0 ? completedInPeriod / relevantTasks : 1

  if (view === 'all') {
    return {
      label: 'Workspace Summary',
      tone: 'neutral',
      message: `${allTimeTaskStats.completed} tasks completed overall, ${allTimeOpenTasks} currently open.`,
    }
  }

  if (view === 'today') {
    if (openDueOrOverdueTasks === 0) {
      return {
        label: 'All caught up',
        tone: 'success',
        message: 'No due or overdue work is waiting today.',
      }
    }

    if (overdueOpenTasks >= 2 || (overdueOpenTasks > 0 && completedInPeriod === 0)) {
      return {
        label: 'Needs attention',
        tone: 'warning',
        message: `${overdueOpenTasks} overdue task${overdueOpenTasks === 1 ? '' : 's'} need follow-up.`,
      }
    }

    if (completedInPeriod > 0) {
      return {
        label: 'Good momentum',
        tone: 'success',
        message: `${completedInPeriod} completed today, ${openDueOrOverdueTasks} due or overdue.`,
      }
    }

    return {
      label: 'Needs attention',
      tone: 'warning',
      message: `${openDueOrOverdueTasks} due task${openDueOrOverdueTasks === 1 ? '' : 's'} need a push today.`,
    }
  }

  if (openDueOrOverdueTasks === 0 || completionRate >= 0.85) {
    return {
      label: 'Ahead of schedule',
      tone: 'success',
      message: 'This week is in great shape.',
    }
  }

  if (overdueOpenTasks >= 3 || (openDueOrOverdueTasks >= 5 && completionRate < 0.35)) {
    return {
      label: 'Needs attention',
      tone: 'warning',
      message: `${openDueOrOverdueTasks} due or overdue tasks need follow-up this week.`,
    }
  }

  if ((completionRate >= 0.45 && overdueOpenTasks <= 1) || (completedInPeriod > 0 && openDueOrOverdueTasks <= 3)) {
    return {
      label: 'On track',
      tone: 'info',
      message: `${completedInPeriod} completed this week, ${openDueOrOverdueTasks} due or overdue.`,
    }
  }

  return {
    label: 'Needs attention',
    tone: 'warning',
    message: `${openDueOrOverdueTasks} due or overdue tasks need follow-up this week.`,
  }
}

function getPeriodRange(view: DashboardView, timezoneOffset: number, now: Date): DateRange | null {
  if (view === 'all') return null

  const localNow = new Date(now.getTime() - timezoneOffset * 60000)
  const localStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()))

  if (view === 'week') {
    const day = localStart.getUTCDay()
    const daysSinceMonday = (day + 6) % 7
    localStart.setUTCDate(localStart.getUTCDate() - daysSinceMonday)
  }

  const start = new Date(localStart.getTime() + timezoneOffset * 60000)
  const end = addUtcDays(start, view === 'week' ? 7 : 1)
  return { start, end }
}

function dueDateConditions(filter: Prisma.DateTimeNullableFilter): Prisma.TaskWhereInput[] {
  return [
    { userSetDeadline: filter },
    { userSetDeadline: null, explicitDeadline: filter },
    { userSetDeadline: null, explicitDeadline: null, inferredDeadline: filter },
  ]
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toLocalDateKey(date: Date, timezoneOffset: number) {
  return toDateKey(new Date(date.getTime() - timezoneOffset * 60000))
}

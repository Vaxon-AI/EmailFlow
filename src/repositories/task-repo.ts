import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { TaskCandidate, PriorityResult } from '@/ai'
import * as Sentry from '@sentry/nextjs'
import type { TaskStatus } from '@/lib/task-status'

// ============================================================
// Task Repository — all task database operations
// ============================================================

export interface CreateTaskData {
  userId: string
  emailId: string
  extraction: TaskCandidate
  priority: PriorityResult
  status?: Extract<TaskStatus, 'ai_suggestion' | 'active'>
}

export type TaskTabBucket = 'all' | 'ai_suggestion' | 'active' | 'completed'
export const TASK_TAB_BUCKETS: TaskTabBucket[] = ['all', 'ai_suggestion', 'active', 'completed']

export type TaskTabState = {
  bucket: TaskTabBucket
  totalCount: number
  newCount: number
  lastSeenAt: Date | null
}

export function taskTabWhere(bucket: TaskTabBucket): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { archivedAt: null }
  if (bucket === 'all') where.status = { in: ['ai_suggestion', 'active'] }
  else where.status = bucket
  return where
}

export async function findTaskTabStates(userId: string): Promise<TaskTabState[]> {
  const seenStates = await prisma.userSurfaceSeenState.findMany({
    where: { userId, surface: 'tasks', bucket: { in: TASK_TAB_BUCKETS } },
    select: { bucket: true, lastSeenAt: true },
  })
  const seenByBucket = new Map(seenStates.map((state) => [state.bucket, state.lastSeenAt]))

  return Promise.all(
    TASK_TAB_BUCKETS.map(async (bucket) => {
      const where = { userId, ...taskTabWhere(bucket) }
      const lastSeenAt = seenByBucket.get(bucket) ?? null
      const [totalCount, newCount] = await Promise.all([
        prisma.task.count({ where }),
        bucket === 'completed'
          ? Promise.resolve(0)
          : prisma.task.count({
              where: lastSeenAt
                ? {
                    AND: [
                      where,
                      {
                        OR: [
                          { createdAt: { gt: lastSeenAt } },
                          { updatedAt: { gt: lastSeenAt } },
                        ],
                      },
                    ],
                  }
                : where,
            }),
      ])
      return { bucket, totalCount, newCount, lastSeenAt }
    })
  )
}

export async function markTaskTabSeen(userId: string, bucket: TaskTabBucket) {
  return prisma.userSurfaceSeenState.upsert({
    where: {
      userId_surface_bucket: {
        userId,
        surface: 'tasks',
        bucket,
      },
    },
    create: {
      userId,
      surface: 'tasks',
      bucket,
      lastSeenAt: new Date(),
    },
    update: { lastSeenAt: new Date() },
  })
}

export async function createTask(data: CreateTaskData) {
  try {
  const task = await prisma.task.create({
    data: {
      userId: data.userId,
      title: data.extraction.title,
      summary: data.extraction.summary,
      actionItems: JSON.stringify(data.extraction.actionItems),
      status: data.status ?? 'ai_suggestion',
      source: 'ai_auto',
      activeAt: data.status === 'active' ? new Date() : null,

      urgency: data.priority.urgency,
      impact: data.priority.impact,
      priorityScore: data.priority.combinedScore,
      priorityReason: data.priority.reasoning,

      explicitDeadline: data.extraction.explicitDeadline
        ? new Date(data.extraction.explicitDeadline)
        : null,
      inferredDeadline: data.extraction.inferredDeadline
        ? new Date(data.extraction.inferredDeadline)
        : null,
      deadlineConfidence: data.extraction.deadlineConfidence,
    },
  })

  // Link task to source email
  await prisma.taskEmail.create({
    data: {
      taskId: task.id,
      emailId: data.emailId,
      relationship: 'source',
    },
  })

  return task
  } catch (err) {
    console.error('[createTask]', err)
    Sentry.captureException(err, { tags: { action: 'createTask' }, extra: { userId: data.userId } })
    throw err
  }
}

export type ProjectContext = {
  id: string
  name: string
  identity: { id: string; name: string } | null
} | null

export type MatterTag = {
  id: string
  title: string
} | null

export async function findTasksPaginated(
  userId: string,
  options: {
    page: number
    limit: number
    status?: string
    scope?: 'open'
    priority?: 'critical' | 'high' | 'medium' | 'low'
    sort?: 'priority' | 'date' | 'deadline' | 'title'
  }
) {
  // Hide soft-archived tasks from list views; they remain accessible by id and via email detail.
  const where: Prisma.TaskWhereInput = { userId, archivedAt: null }
  if (options.status) {
    where.status = options.status
  } else if (options.scope === 'open') {
    where.status = { in: ['ai_suggestion', 'active'] }
  }
  if (options.priority) {
    if (options.priority === 'low') {
      where.OR = [{ priorityScore: { lt: 6 } }, { priorityScore: null }]
    } else {
      where.priorityScore = priorityScoreWhere(options.priority)
    }
  }

  const orderBy: Prisma.TaskOrderByWithRelationInput =
    options.sort === 'priority'
      ? { priorityScore: 'desc' }
      : options.sort === 'deadline'
        ? { inferredDeadline: 'asc' }
        : options.sort === 'title'
          ? { title: 'asc' }
          : { createdAt: 'desc' }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy,
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      include: {
        emailLinks: {
          include: {
            email: {
              select: { id: true, subject: true, sender: true, receivedAt: true, threadId: true },
            },
          },
        },
        matter: {
          include: { projectContext: { include: { identity: true } } },
        },
      },
    }),
    prisma.task.count({ where }),
  ])

  // Enrich each task with project + matter — prefer explicit task.matter, fall back to ThreadMemory
  try {
    const threadIds = tasks
      .filter((t) => !t.matterId)
      .flatMap((t) => t.emailLinks.map((l) => l.email?.threadId).filter((id): id is string => !!id))
    const ctxMap = await buildThreadContextMap(userId, threadIds)

    const enriched = tasks.map((task) => {
      if (task.matter) {
        return {
          ...task,
          project: extractProject(task.matter),
          matter: { id: task.matter.id, title: task.matter.title },
        }
      }
      const threadId = task.emailLinks[0]?.email?.threadId ?? null
      const ctx = threadId ? ctxMap.get(threadId) : null
      return { ...task, project: ctx?.project ?? null, matter: ctx?.matter ?? null }
    })

    return { tasks: enriched, total }
  } catch (err) {
    console.error('[task-repo] enrichment failed, returning tasks without project context:', err)
    return { tasks, total }
  }
}

function priorityScoreWhere(priority: 'critical' | 'high' | 'medium'): Prisma.IntNullableFilter {
  switch (priority) {
    case 'critical':
      return { gte: 20 }
    case 'high':
      return { gte: 12, lt: 20 }
    case 'medium':
      return { gte: 6, lt: 12 }
  }
}

type MatterWithProject = {
  id: string
  title: string
  projectContext: {
    id: string
    name: string
    identity: { id: string; name: string } | null
  } | null
}

function extractProject(matter: MatterWithProject): ProjectContext {
  if (!matter.projectContext) return null
  return {
    id: matter.projectContext.id,
    name: matter.projectContext.name,
    identity: matter.projectContext.identity
      ? { id: matter.projectContext.identity.id, name: matter.projectContext.identity.name }
      : null,
  }
}

async function buildThreadContextMap(userId: string, threadIds: string[]) {
  if (!threadIds.length) return new Map<string, { project: ProjectContext; matter: MatterTag }>()

  const threads = await prisma.threadMemory.findMany({
    where: { userId, threadId: { in: threadIds } },
    include: {
      matter: {
        include: {
          projectContext: { include: { identity: true } },
        },
      },
    },
  })

  return new Map(
    threads.map((t) => [
      t.threadId,
      {
        matter: t.matter ? { id: t.matter.id, title: t.matter.title } : null,
        project: t.matter?.projectContext
          ? {
              id: t.matter.projectContext.id,
              name: t.matter.projectContext.name,
              identity: t.matter.projectContext.identity
                ? { id: t.matter.projectContext.identity.id, name: t.matter.projectContext.identity.name }
                : null,
            }
          : null,
      },
    ])
  )
}

export async function findTaskById(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: {
      emailLinks: {
        include: {
          email: {
            select: {
              id: true,
              subject: true,
              sender: true,
              bodyPreview: true,
              receivedAt: true,
              classification: true,
              threadId: true,
            },
          },
        },
      },
      matter: {
        include: { projectContext: { include: { identity: true } } },
      },
    },
  })

  if (!task) return task

  // Prefer explicit task.matter, fall back to ThreadMemory
  if (task.matter) {
    return {
      ...task,
      project: extractProject(task.matter),
      matter: { id: task.matter.id, title: task.matter.title },
    }
  }

  const threadId = task.emailLinks?.[0]?.email?.threadId ?? null
  if (!threadId) return { ...task, project: null, matter: null }

  try {
    const ctxMap = await buildThreadContextMap(userId, [threadId])
    const ctx = ctxMap.get(threadId)
    return { ...task, project: ctx?.project ?? null, matter: ctx?.matter ?? null }
  } catch (err) {
    console.error('[task-repo] detail enrichment failed:', err)
    return task
  }
}

export async function updateTask(taskId: string, data: Prisma.TaskUpdateInput) {
  return prisma.task.update({ where: { id: taskId }, data })
}

export async function deleteTask(taskId: string, userId: string) {
  return prisma.task.delete({ where: { id: taskId, userId } })
}

export async function deleteManyTasks(taskIds: string[], userId: string) {
  return prisma.task.deleteMany({ where: { id: { in: taskIds }, userId } })
}

export async function bulkComplete(userId: string, taskIds: string[], at: Date) {
  return prisma.task.updateMany({
    where: { id: { in: taskIds }, userId },
    data: { status: 'completed', completedAt: at, dismissedAt: null },
  })
}

export async function bulkActivate(userId: string, taskIds: string[], at: Date) {
  return prisma.task.updateMany({
    where: { id: { in: taskIds }, userId },
    data: { status: 'active', activeAt: at, dismissedAt: null, completedAt: null },
  })
}

export async function setMatter(userId: string, taskId: string, matterId: string) {
  return prisma.task.update({
    where: { id: taskId, userId },
    data: { matterId },
  })
}

export async function findTaskOwnedBy(userId: string, taskId: string) {
  return prisma.task.findFirst({ where: { id: taskId, userId } })
}

export async function linkEmailToTask(taskId: string, emailId: string) {
  return prisma.taskEmail.createMany({
    data: [{ taskId, emailId, relationship: 'source' }],
    skipDuplicates: true,
  })
}

export async function findRecentDatedTasksForProject(input: {
  userId: string
  projectContextId: string
  since: Date
  take: number
}) {
  const { userId, projectContextId, since, take } = input
  return prisma.task.findMany({
    where: {
      userId,
      archivedAt: null,
      matter: { projectContextId },
      createdAt: { gte: since },
      OR: [
        { userSetDeadline: { not: null } },
        { explicitDeadline: { not: null } },
        { inferredDeadline: { not: null } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      title: true,
      startDate: true,
      userSetDeadline: true,
      explicitDeadline: true,
      inferredDeadline: true,
    },
  })
}

export async function bulkSetMatter(userId: string, taskIds: string[], matterId: string) {
  return prisma.task.updateMany({
    where: { id: { in: taskIds }, userId },
    data: { matterId },
  })
}

export async function unlinkTaskFromEmail(emailId: string, taskId: string) {
  return prisma.taskEmail.deleteMany({ where: { emailId, taskId } })
}

export async function findActiveTasksLinkedToThread(userId: string, threadId: string) {
  return prisma.task.findMany({
    where: {
      userId,
      archivedAt: null,
      emailLinks: { some: { email: { threadId } } },
    },
    select: {
      id: true,
      title: true,
      matterId: true,
      matter: {
        include: { projectContext: { include: { identity: true } } },
      },
    },
  })
}

export async function findTasksByDateRange(
  userId: string,
  dateRange: { start: Date; end: Date }
) {
  return prisma.task.findMany({
    where: {
      userId,
      archivedAt: null,
      createdAt: { gte: dateRange.start, lt: dateRange.end },
    },
    orderBy: { priorityScore: 'desc' },
  })
}

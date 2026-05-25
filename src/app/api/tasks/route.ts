export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { defineRoute, getAuthUser, success, error } from '@/lib/api-helpers'
import * as taskRepo from '@/repositories/task-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'
import { isTaskStatus } from '@/lib/task-status'
import { createManualTask } from '@/services/manual-task-service'

export const GET = defineRoute(
  { tag: 'api/tasks GET', message: 'Failed to load tasks' },
  async (req: NextRequest) => {
    const user = await getAuthUser()

    const url = req.nextUrl
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 2000)
    const statusParam = url.searchParams.get('status')
    if (statusParam && !isTaskStatus(statusParam)) {
      return error('BAD_REQUEST', 'Invalid task status', 400)
    }
    const status = statusParam || undefined
    const scope = url.searchParams.get('scope') === 'open' ? 'open' : undefined
    const priorityParam = url.searchParams.get('priority')
    const priority = isPriorityFilter(priorityParam) ? priorityParam : undefined
    const sort = (url.searchParams.get('sort') || 'priority') as 'priority' | 'date' | 'deadline' | 'title'

    const { tasks, total } = await taskRepo.findTasksPaginated(user.id, {
      page,
      limit,
      status,
      scope,
      priority,
      sort,
    })

    return success(tasks, {
      page,
      totalPages: Math.ceil(total / limit),
      totalCount: total,
    })
  },
)

function isPriorityFilter(value: string | null): value is 'critical' | 'high' | 'medium' | 'low' {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low'
}

export const POST = defineRoute(
  { tag: 'api/tasks POST', message: 'Failed to create task' },
  async (req: NextRequest) => {
    const user = await getAuthUser()

    const { title, summary, actionItems, userSetDeadline, startDate, urgency, impact, priorityScore, projectId, source, emailIds } = await req.json()
    const taskSource = source ?? 'manual'

    if (!title) {
      return error('BAD_REQUEST', 'Title is required', 400)
    }

    const task = await createManualTask({
      userId: user.id,
      title,
      summary,
      actionItems,
      userSetDeadline,
      startDate,
      urgency,
      impact,
      priorityScore,
      projectId,
      source: taskSource,
      emailIds: Array.isArray(emailIds) ? emailIds : [],
      markLinkedEmailsActioned: true,
      emptyActionItemsValue: '[]',
    })

    invalidateStatsCache(user.id)
    return success(task)
  },
)

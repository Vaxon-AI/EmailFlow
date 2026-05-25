export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { defineRoute, getAuthUser, success, error, parseJsonBody } from '@/lib/api-helpers'
import * as taskRepo from '@/repositories/task-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'
import { isTaskStatus } from '@/lib/task-status'
import { createManualTask } from '@/services/manual-task-service'

const createTaskBodySchema = z.object({}).catchall(z.unknown())

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

type ManualTaskSource = 'manual' | 'copy_text'

function normalizeManualTaskSource(value: unknown): ManualTaskSource {
  return value === 'copy_text' ? 'copy_text' : 'manual'
}

function buildCreateTaskInput(
  userId: string,
  body: Record<string, unknown>,
) {
  return {
    userId,
    title: body.title as string,
    summary: body.summary as string | undefined,
    actionItems: body.actionItems as string | undefined,
    userSetDeadline: body.userSetDeadline as string | undefined,
    startDate: body.startDate as string | undefined,
    urgency: body.urgency as number | undefined,
    impact: body.impact as number | undefined,
    priorityScore: body.priorityScore as number | undefined,
    projectId: body.projectId as string | undefined,
    source: normalizeManualTaskSource(body.source),
    emailIds: Array.isArray(body.emailIds) ? body.emailIds : [],
    markLinkedEmailsActioned: true,
    emptyActionItemsValue: '[]',
  }
}

export const POST = defineRoute(
  { tag: 'api/tasks POST', message: 'Failed to create task' },
  async (req: NextRequest) => {
    const user = await getAuthUser()

    const body = await parseJsonBody(req, createTaskBodySchema, {
      code: 'BAD_REQUEST',
      message: 'Invalid request body',
      status: 400,
    })

    if (!body.title) {
      return error('BAD_REQUEST', 'Title is required', 400)
    }

    const task = await createManualTask(buildCreateTaskInput(user.id, body))

    invalidateStatsCache(user.id)
    return success(task)
  },
)

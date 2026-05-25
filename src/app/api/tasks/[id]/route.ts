export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { defineRoute, error, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
import * as taskRepo from '@/repositories/task-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'
import { isTaskStatus } from '@/lib/task-status'

type AllowedTaskField =
  | 'title'
  | 'summary'
  | 'status'
  | 'urgency'
  | 'impact'
  | 'startDate'
  | 'userSetDeadline'
  | 'userNotes'
  | 'checkedActionItems'
  | 'actionItems'

const patchTaskBodySchema = z.object({}).catchall(z.unknown())
const PATCHABLE_FIELDS: AllowedTaskField[] = [
  'title', 'summary', 'status', 'urgency', 'impact',
  'startDate', 'userSetDeadline', 'userNotes', 'checkedActionItems', 'actionItems',
]
const DATE_FIELDS = new Set<AllowedTaskField>(['startDate', 'userSetDeadline'])

function buildTaskUpdateData(
  body: Record<string, unknown>,
  existing: { urgency?: number | null; impact?: number | null },
): Prisma.TaskUpdateInput {
  const data: Prisma.TaskUpdateInput = { isUserEdited: true, updatedAt: new Date() }

  for (const field of PATCHABLE_FIELDS) {
    if (body[field] === undefined) continue

    const value = body[field]

    if (DATE_FIELDS.has(field)) {
      if (field === 'startDate') {
        data.startDate = value ? new Date(value as string | number | Date) : null
      } else {
        data.userSetDeadline = value ? new Date(value as string | number | Date) : null
      }
      continue
    }

    switch (field) {
      case 'title':
        data.title = value as string
        break
      case 'summary':
        data.summary = value as string
        break
      case 'status':
        data.status = value as string
        break
      case 'urgency':
        data.urgency = value as number
        break
      case 'impact':
        data.impact = value as number
        break
      case 'userNotes':
        data.userNotes = value as string
        break
      case 'checkedActionItems':
        data.checkedActionItems = value as string
        break
      case 'actionItems':
        data.actionItems = value as string
        break
    }
  }

  const nextUrgency =
    typeof body.urgency === 'number' ? body.urgency : (existing.urgency ?? 1)
  const nextImpact =
    typeof body.impact === 'number' ? body.impact : (existing.impact ?? 1)

  if (body.urgency !== undefined || body.impact !== undefined) {
    data.priorityScore = nextUrgency * nextImpact
  }

  if (body.status === 'active') {
    data.activeAt = new Date()
    data.dismissedAt = null
    data.completedAt = null
  } else if (body.status === 'completed') {
    data.completedAt = new Date()
    data.dismissedAt = null
  } else if (body.status === 'ai_suggestion') {
    data.activeAt = null
    data.dismissedAt = null
    data.completedAt = null
  }

  return data
}

export const GET = defineRoute(
  { tag: 'api/tasks/[id] GET', message: 'Failed to load task' },
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getAuthUser()
    const { id } = await params
    const task = await taskRepo.findTaskById(user.id, id)
    if (!task) return error('NOT_FOUND', 'Task not found', 404)
    return success(task)
  },
)

export const DELETE = defineRoute(
  { tag: 'api/tasks/[id] DELETE', message: 'Failed to delete task' },
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getAuthUser()
    const { id } = await params
    const existing = await taskRepo.findTaskById(user.id, id)
    if (!existing) return error('NOT_FOUND', 'Task not found', 404)
    await taskRepo.deleteTask(id, user.id)
    invalidateStatsCache(user.id)
    return success({ deleted: true })
  },
)

export const PATCH = defineRoute(
  { tag: 'api/tasks/[id] PATCH', message: 'Failed to update task' },
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getAuthUser()
    const { id } = await params
    const body = await parseJsonBody(req, patchTaskBodySchema, {
      code: 'BAD_REQUEST',
      message: 'Invalid request body',
      status: 400,
    })

    const existing = await taskRepo.findTaskById(user.id, id)
    if (!existing) return error('NOT_FOUND', 'Task not found', 404)

    if (body.status !== undefined && !isTaskStatus(body.status)) {
      return error('BAD_REQUEST', 'Invalid task status', 400)
    }

    const data = buildTaskUpdateData(body, existing)

    const updated = await taskRepo.updateTask(id, data)
    if (body.status !== undefined) invalidateStatsCache(user.id)
    return success(updated)
  },
)

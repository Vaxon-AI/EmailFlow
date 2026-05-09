export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import * as taskRepo from '@/repositories/task-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id } = await params
    const task = await taskRepo.findTaskById(user.id, id)
    if (!task) return error('NOT_FOUND', 'Task not found', 404)
    return success(task)
  } catch (err) {
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to load task', 500)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id } = await params
    const existing = await taskRepo.findTaskById(user.id, id)
    if (!existing) return error('NOT_FOUND', 'Task not found', 404)
    await taskRepo.deleteTask(id, user.id)
    invalidateStatsCache(user.id)
    return success({ deleted: true })
  } catch (err) {
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to delete task', 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id } = await params
    const body = await req.json()

    const existing = await taskRepo.findTaskById(user.id, id)
    if (!existing) return error('NOT_FOUND', 'Task not found', 404)

    if (body.status === 'dismissed') {
      await taskRepo.deleteTask(id, user.id)
      invalidateStatsCache(user.id)
      return success({ deleted: true })
    }

    const allowed: AllowedTaskField[] = [
      'title', 'summary', 'status', 'urgency', 'impact',
      'startDate', 'userSetDeadline', 'userNotes', 'checkedActionItems', 'actionItems',
    ]
    const dateFields = new Set<AllowedTaskField>(['startDate', 'userSetDeadline'])
    const data: Prisma.TaskUpdateInput = { isUserEdited: true, updatedAt: new Date() }

    for (const field of allowed) {
      if (body[field] !== undefined) {
        const value = body[field]

        if (dateFields.has(field)) {
          if (field === 'startDate') {
            data.startDate = value ? new Date(value) : null
          } else {
            data.userSetDeadline = value ? new Date(value) : null
          }
          continue
        }

        switch (field) {
          case 'title':
            data.title = value
            break
          case 'summary':
            data.summary = value
            break
          case 'status':
            data.status = value
            break
          case 'urgency':
            data.urgency = value
            break
          case 'impact':
            data.impact = value
            break
          case 'userNotes':
            data.userNotes = value
            break
          case 'checkedActionItems':
            data.checkedActionItems = value
            break
          case 'actionItems':
            data.actionItems = value
            break
        }
      }
    }

    const nextUrgency =
      typeof body.urgency === 'number' ? body.urgency : (existing.urgency ?? 1)
    const nextImpact =
      typeof body.impact === 'number' ? body.impact : (existing.impact ?? 1)

    if (body.urgency !== undefined || body.impact !== undefined) {
      const u = nextUrgency
      const i = nextImpact
      data.priorityScore = u * i
    }

    if (body.status === 'confirmed') {
      data.confirmedAt = new Date()
      data.dismissedAt = null
      data.completedAt = null
    } else if (body.status === 'completed') {
      data.completedAt = new Date()
      data.dismissedAt = null
    } else if (body.status === 'pending') {
      data.confirmedAt = null
      data.dismissedAt = null
      data.completedAt = null
    }

    const updated = await taskRepo.updateTask(id, data)
    if (body.status !== undefined) invalidateStatsCache(user.id)
    return success(updated)
  } catch (err) {
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to update task', 500)
  }
}

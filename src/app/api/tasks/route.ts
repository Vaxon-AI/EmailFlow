export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import * as taskRepo from '@/repositories/task-repo'
import * as emailRepo from '@/repositories/email-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()

    const url = req.nextUrl
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 2000)
    const status = url.searchParams.get('status') || undefined
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
  } catch (err) {
    console.error('[api/tasks GET]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to load tasks', 500)
  }
}

function isPriorityFilter(value: string | null): value is 'critical' | 'high' | 'medium' | 'low' {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low'
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()

    const { title, summary, actionItems, userSetDeadline, startDate, urgency, impact, priorityScore, projectId, source, emailIds } = await req.json()
    const taskSource = source ?? 'manual'
    const taskStatus = taskSource === 'copy_text' ? 'pending' : 'confirmed'

    if (!title) {
      return error('BAD_REQUEST', 'Title is required', 400)
    }

    // If projectId provided, find or create a MatterMemory to link the task
    let matterId: string | undefined
    if (projectId) {
      const project = await prisma.projectContext.findFirst({ where: { id: projectId, userId: user.id } })
      if (project) {
        let matter = await prisma.matterMemory.findFirst({ where: { userId: user.id, projectContextId: projectId } })
        if (!matter) {
          matter = await prisma.matterMemory.create({
            data: {
              userId: user.id,
              projectContextId: projectId,
              title: project.name,
              summary: 'Manually assigned to this project',
              status: 'open',
              topic: 'other',
            },
          })
        }
        matterId = matter.id
      }
    }

    const task = await prisma.task.create({
      data: {
        userId: user.id,
        title,
        summary: summary || '',
        status: taskStatus,
        confirmedAt: taskStatus === 'confirmed' ? new Date() : null,
        urgency: urgency ?? 3,
        impact: impact ?? 3,
        priorityScore: priorityScore ?? 9,
        actionItems: actionItems ?? '[]',
        userSetDeadline: userSetDeadline ? new Date(userSetDeadline) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        source: taskSource,
        matterId,
      },
    })

    if (Array.isArray(emailIds) && emailIds.length > 0) {
      const ownedEmails = await prisma.email.findMany({
        where: { id: { in: emailIds }, userId: user.id },
        select: { id: true },
      })
      if (ownedEmails.length > 0) {
        await prisma.taskEmail.createMany({
          data: ownedEmails.map((e) => ({ taskId: task.id, emailId: e.id, relationship: 'source' })),
          skipDuplicates: true,
        })
        await emailRepo.bulkMarkActioned(user.id, ownedEmails.map((e) => e.id))
      }
    }

    invalidateStatsCache(user.id)
    return success(task)
  } catch (err) {
    console.error('[api/tasks POST]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to create task', 500)
  }
}

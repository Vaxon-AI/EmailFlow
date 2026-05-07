export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { suggestTaskDates } from '@/ai/skills/suggest-task-dates'

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()

    if (user.plan === 'free') {
      return error('PRO_REQUIRED', 'Date suggestions are available on Pro.', 402)
    }

    const { title, summary, projectId } = await req.json()

    if (!title || typeof title !== 'string' || !title.trim()) {
      return error('BAD_REQUEST', 'Title is required', 400)
    }

    const today = new Date().toISOString().slice(0, 10)

    let projectName: string | undefined
    let recentTasks: { title: string; startDate: string | null; dueDate: string | null }[] = []

    if (projectId && typeof projectId === 'string') {
      const project = await prisma.projectContext.findFirst({
        where: { id: projectId, userId: user.id },
        select: { id: true, name: true },
      })
      if (project) {
        projectName = project.name
        const since = new Date()
        since.setDate(since.getDate() - 30)
        const tasks = await prisma.task.findMany({
          where: {
            userId: user.id,
            matter: { projectContextId: project.id },
            createdAt: { gte: since },
            OR: [
              { userSetDeadline: { not: null } },
              { explicitDeadline: { not: null } },
              { inferredDeadline: { not: null } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            title: true,
            startDate: true,
            userSetDeadline: true,
            explicitDeadline: true,
            inferredDeadline: true,
          },
        })
        recentTasks = tasks.map((t) => {
          const due = t.userSetDeadline ?? t.explicitDeadline ?? t.inferredDeadline
          return {
            title: t.title,
            startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
            dueDate: due ? due.toISOString().slice(0, 10) : null,
          }
        })
      }
    }

    const result = await suggestTaskDates({
      title: title.trim(),
      summary: typeof summary === 'string' ? summary : undefined,
      today,
      recentTasks,
      projectName,
    })

    return success(result)
  } catch (err) {
    console.error('[api/tasks/suggest-dates POST]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to suggest dates', 500)
  }
}

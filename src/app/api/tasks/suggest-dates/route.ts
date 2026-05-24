export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error, parseJsonBody } from '@/lib/api-helpers'
import { findOwnedById as findProjectOwnedById } from '@/repositories/project-context-repo'
import { findRecentDatedTasksForProject } from '@/repositories/task-repo'
import { suggestTaskDates } from '@/ai/skills/suggest-task-dates'
import { z } from 'zod'

const suggestDatesSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  summary: z.string().optional(),
  projectId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser()

    if (user.plan === 'free') {
      return error('PRO_REQUIRED', 'Date suggestions are available on Pro.', 402)
    }

    const { title, summary, projectId } = await parseJsonBody(req, suggestDatesSchema)

    const today = new Date().toISOString().slice(0, 10)

    let projectName: string | undefined
    let recentTasks: { title: string; startDate: string | null; dueDate: string | null }[] = []

    if (projectId && typeof projectId === 'string') {
      const project = await findProjectOwnedById(user.id, projectId)
      if (project) {
        projectName = project.name
        const since = new Date()
        since.setDate(since.getDate() - 30)
        const tasks = await findRecentDatedTasksForProject({
          userId: user.id,
          projectContextId: project.id,
          since,
          take: 10,
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
      title,
      summary,
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

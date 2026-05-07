export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import { extractTask } from '@/ai/skills/extract-task'
import { scorePriority } from '@/ai/skills/score-priority'

export async function POST(req: NextRequest) {
  try {
    await getAuthUser()

    const { text } = await req.json()

    if (!text || typeof text !== 'string') {
      return error('BAD_REQUEST', 'Text is required', 400)
    }

    const truncated = text.slice(0, 1000)
    const now = new Date().toISOString().split('T')[0]

    const extraction = await extractTask({
      subject: '',
      sender: '',
      date: now,
      bodyPreview: truncated,
      body: truncated,
    })

    if (!extraction.tasks.length) {
      return error('EXTRACTION_EMPTY', 'No task could be extracted', 422)
    }

    const tasks = await Promise.all(extraction.tasks.map(async (task) => {
      const priority = await scorePriority({
        title: task.title,
        summary: task.summary,
        actionItems: task.actionItems,
        sender: '',
        currentDate: now,
      })
      return {
        title: task.title,
        summary: task.summary,
        actionItems: task.actionItems,
        explicitDeadline: task.explicitDeadline,
        inferredDeadline: task.inferredDeadline,
        deadlineConfidence: task.deadlineConfidence,
        urgency: priority.urgency,
        impact: priority.impact,
        priorityScore: priority.combinedScore,
        priorityReason: priority.reasoning,
        splitReason: task.splitReason,
      }
    }))

    return success({ tasks })
  } catch (err) {
    console.error('[api/tasks/from-text POST]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to extract task', 500)
  }
}

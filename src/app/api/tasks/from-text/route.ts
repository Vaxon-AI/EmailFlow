export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import { extractTask } from '@/ai/skills/extract-task'
import { scorePriority } from '@/ai/skills/score-priority'
import { FREE_PASTE_TEXT_LIMIT, getPasteTextRemaining, incrementPasteTextUsed } from '@/lib/quota'

export const POST = defineRoute(
  { tag: 'api/tasks/from-text POST', message: 'Failed to extract task' },
  async (req: NextRequest) => {
    const user = await getAuthUser()

    const { text } = await req.json()

    if (!text || typeof text !== 'string') {
      return error('BAD_REQUEST', 'Text is required', 400)
    }

    if (user.plan === 'free') {
      const remaining = await getPasteTextRemaining(user.id)
      if (remaining <= 0) {
        return error('QUOTA_EXCEEDED', `Free plan limit of ${FREE_PASTE_TEXT_LIMIT} Paste Text extractions reached. Upgrade to Pro for unlimited access.`, 402)
      }
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

    if (user.plan === 'free') {
      await incrementPasteTextUsed(user.id)
    }

    return success({ tasks })
  },
)

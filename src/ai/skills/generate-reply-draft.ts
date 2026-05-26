import { generateObject } from 'ai'
import { withFallback } from '../utils/with-fallback'
import { replyDraftSchema, type ReplyDraftResult } from '../schemas'

type ReplyTaskContext = {
  title: string
  summary: string
  status: string
  priority?: string
  startDate?: string | null
  dueDate?: string | null
  checklistItems: string[]
  completedChecklistItems: string[]
  userNotes?: string | null
}

export interface GenerateReplyDraftInput {
  subject: string
  sender: string
  receivedAt: string
  body: string
  classification?: string | null
  classReasoning?: string | null
  tasks: ReplyTaskContext[]
}

const SYSTEM_PROMPT = `You write concise email reply drafts for the user.

Rules:
- Write the reply as the user, addressed to the sender.
- Use the email and linked task context only.
- Do not invent progress, promises, dates, blockers, names, or decisions not present in the context.
- If a linked task is completed, it is okay to acknowledge completion or summarize the completed outcome.
- If a linked task is active and some checklist items are completed, give a progress update and next step.
- If a linked task is an AI Suggestion/pending, be conservative: acknowledge receipt and avoid implying the user has committed.
- If there is no linked task, acknowledge the message and propose a careful next step.
- Keep the tone professional, warm, and clear.
- Do not include a subject line.
- Do not add placeholders like [Name] unless the recipient name is unavailable.
- Return only the body of the reply.`

export async function generateReplyDraft(input: GenerateReplyDraftInput): Promise<ReplyDraftResult> {
  const taskContext = input.tasks.length
    ? input.tasks.map((task, index) => {
      const checklist = task.checklistItems.length
        ? task.checklistItems.map((item) => {
          const done = task.completedChecklistItems.includes(item) ? 'done' : 'open'
          return `    - [${done}] ${item}`
        }).join('\n')
        : '    - none'

      return [
        `Task ${index + 1}: ${task.title}`,
        `  Status: ${task.status}`,
        `  Summary: ${task.summary}`,
        task.priority ? `  Priority: ${task.priority}` : null,
        task.startDate ? `  Start date: ${task.startDate}` : null,
        task.dueDate ? `  Due date: ${task.dueDate}` : null,
        task.userNotes ? `  User notes: ${task.userNotes}` : null,
        '  Checklist:',
        checklist,
      ].filter(Boolean).join('\n')
    }).join('\n\n')
    : 'No linked tasks.'

  const prompt = `Email:
Subject: ${input.subject}
From: ${input.sender}
Received: ${input.receivedAt}
Classification: ${input.classification ?? 'unknown'}
AI reasoning: ${input.classReasoning ?? 'none'}

Body:
${input.body}

Linked task context:
${taskContext}`

  return withFallback('Reply draft', 'balanced', async (model) => {
    const { object } = await generateObject({
      model,
      schema: replyDraftSchema,
      system: SYSTEM_PROMPT,
      prompt,
    })
    return object
  })
}

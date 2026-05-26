import { generateObject } from 'ai'
import { withFallback } from '../utils/with-fallback'
import { threadMemoryUpdateSchema, type ThreadMemoryUpdateResult } from '../schemas'

// ============================================================
// Skill: Thread Memory Update
// Maintains a living summary of what a thread/matter is about.
// Called once per email (after classification) to keep thread
// memory current without re-reading full email bodies.
// ============================================================

const SYSTEM_PROMPT = `You are an email thread analyst.

Given an email thread's current memory state and a new email, produce an updated thread summary.

Rules:
- title: specific and descriptive, not generic. Use the actual subject matter.
  Good: "Job application at Acme Corp — software engineer role"
  Bad:  "Email thread" or "Re: your message"
- topic: pick the closest match from the allowed list
- summary: one sentence describing the current state of the thread (what it is about and where it stands)
- status:
  - "open": thread is ongoing, no resolution yet
  - "pending": waiting for something to happen (review, payment, decision)
  - "waiting_reply": the user or another party needs to reply to move forward
  - "completed": the matter is resolved or no longer relevant
- nextAction: the most important concrete next step the user needs to take, or null if no action is needed
- needsFullAnalysis: true only when the email body preview is clearly truncated or too short to understand
  the actual action items or deadlines — not merely because the email is complex

If existing memory is provided, only update fields that have genuinely changed based on the new email.
Do not invent information not present in the email content.`

export interface UpdateThreadMemoryInput {
  subject: string
  sender: string
  date: string
  bodyPreview: string
  classification: string // action | awareness | ignore | uncertain
  existingMemory?: {
    title: string
    topic: string
    summary: string
    status: string
    nextAction: string | null
  } | null
}

export async function updateThreadMemory(
  input: UpdateThreadMemoryInput
): Promise<ThreadMemoryUpdateResult> {
  const existingBlock = input.existingMemory
    ? [
        'Current thread memory:',
        `Title: ${input.existingMemory.title}`,
        `Topic: ${input.existingMemory.topic}`,
        `Summary: ${input.existingMemory.summary}`,
        `Status: ${input.existingMemory.status}`,
        `Next action: ${input.existingMemory.nextAction ?? 'none'}`,
        '',
      ].join('\n')
    : 'This is the first email in the thread — no existing memory.\n\n'

  const prompt = `${existingBlock}New email:
Subject: ${input.subject}
From: ${input.sender}
Date: ${input.date}
Classification: ${input.classification}
Body preview: ${input.bodyPreview}`

  return withFallback('Thread memory update', 'fast', async (model) => {
    const { object } = await generateObject({
      model,
      schema: threadMemoryUpdateSchema,
      system: SYSTEM_PROMPT,
      prompt,
    })
    return object
  })
}

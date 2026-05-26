import { generateObject } from 'ai'
import { withFallback } from '../utils/with-fallback'
import { taskExtractionSchema, type TaskExtractionResult } from '../schemas'

// ============================================================
// Skill: Task Extraction
// Extracts structured task from an email that requires action
// ============================================================

const SYSTEM_PROMPT = `You are an assistant that extracts structured tasks from emails.

Rules:
- Return task candidates, not arbitrary notes.
- One independent outcome = one task candidate.
- Steps toward the same outcome belong in that candidate's actionItems checklist.
- Return one candidate for normal emails, even when the checklist has several steps.
- Return multiple candidates only when the email clearly asks for separate outcomes that can be completed, delayed, or dismissed independently.
- Do not split just because an email has multiple steps for one deliverable.
- Title: start with a verb, max 80 chars, clear and actionable.
- Summary: what and why, max 200 chars, concise.
- Action items: concrete steps for that candidate (bullet-style, no fluff).
- splitReason: short reason for separate candidates; null when there is only one candidate.
- Deadlines:
  - Extract explicit ones as stated.
  - If none, infer from urgency cues (ASAP, this week, before Friday).
  - Set deadlineConfidence accordingly.
- NEVER fabricate information not present in the email.
- Prefer clarity over verbosity.
- Dates must be in YYYY-MM-DD format.

Additional guidance:
- Use user preferences as soft guidance (e.g., prefer concise and actionable tasks).
- Focus only on what the recipient needs to do, ignore irrelevant noise (signatures, disclaimers).
Return 1-5 candidates total.`

export interface ExtractTaskInput {
  subject: string
  sender: string
  date: string
  bodyPreview: string
  body?: string
  memory?: string
  threadContext?: {
    sender: string
    date: string
    bodyPreview: string
  }[]
}

export async function extractTask(input: ExtractTaskInput): Promise<TaskExtractionResult> {
  let prompt = `${input.memory ? `User preferences and task style:\n${input.memory}\n\n` : ''}Subject: ${input.subject}
From: ${input.sender}
Date: ${input.date}
Body: ${input.body || input.bodyPreview}`

  if (input.threadContext && input.threadContext.length > 0) {
    prompt += `\n\nThread context (recent messages):\n`
    for (const msg of input.threadContext.slice(-3)) {
      prompt += `From: ${msg.sender} | Date: ${msg.date}\n${msg.bodyPreview}\n---\n`
    }
  }

  return withFallback('Task extraction', 'balanced', async (model) => {
    const { object } = await generateObject({
      model,
      schema: taskExtractionSchema,
      system: SYSTEM_PROMPT,
      prompt,
    })
    return object
  })
}

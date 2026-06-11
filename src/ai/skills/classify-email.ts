import { generateObject } from 'ai'
import { withFallback } from '../utils/with-fallback'
import { classificationSchema, type ClassificationResult } from '../schemas'

// ============================================================
// Skill: Email Classification
// Determines if an email requires action, is informational, or can be ignored
// ============================================================

const SYSTEM_PROMPT = `You are an email triage assistant.

Classify the email into exactly one category.

Categories:
- "action": the recipient is expected to do something, such as reply, review, confirm, approve, submit, pay, schedule, attend, or follow up
- "awareness": useful information, but no clear action is required
- "ignore": spam, promotions, newsletters, receipts, automated low-value notifications, irrelevant messages
- "uncertain": not enough information to decide confidently

Rules:
- Prefer "action" when the email contains a clear request, deliverable, question requiring a reply, deadline, meeting ask, approval ask, payment ask, or response expectation.
- If someone asks the recipient to review, confirm, submit, pay, reply, schedule, approve, or attend, classify as "action".
- Use "awareness" only when the email is truly FYI and no response or follow-up is expected.
- Use "ignore" only for irrelevant, promotional, or low-value automated messages.
- Use "uncertain" only when the content is too ambiguous to judge.
- Treat user preferences and learned handling rules as soft guidance, not absolute rules.
- If the actual email clearly contains a required action, choose "action" even if some preference says similar emails are often low value.
- Be careful not to classify everything as "ignore" just because the sender is automated.
- isOngoingMatter: judge whether this email belongs to an ongoing, multi-step situation.
  - false (one-off): simple requests fully resolved by a single reply or quick action — a dinner or social invitation, "please send me that file", a quick RSVP, a one-time question, a single confirmation.
  - true (ongoing): situations that will span multiple emails or steps over time — work projects, apartment hunting, job applications and interview loops, vendor or contract negotiations, course enrollment, an insurance claim.
  - When unsure, prefer true for work/process emails and false for casual personal one-liners.

Return:
- category
- confidence
- reasoning
- isWorkRelated
- isOngoingMatter`

export interface ClassifyEmailInput {
  subject: string
  sender: string
  date: string
  bodyPreview: string
  memory?: string
}

export async function classifyEmail(input: ClassifyEmailInput): Promise<ClassificationResult> {
  const prompt = `${input.memory ? `User preferences and learned handling rules:\n${input.memory}\n\n` : ''}Subject: ${input.subject}
From: ${input.sender}
Date: ${input.date}
Body (preview): ${input.bodyPreview}`

  return withFallback('Classification', 'fast', async (model) => {
    const { object } = await generateObject({
      model,
      schema: classificationSchema,
      system: SYSTEM_PROMPT,
      prompt,
    })
    return object
  })
}
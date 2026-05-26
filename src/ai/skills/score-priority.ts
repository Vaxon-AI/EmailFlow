import { generateObject } from 'ai'
import { withFallback } from '../utils/with-fallback'
import { prioritySchema, type PriorityResult } from '../schemas'

// ============================================================
// Skill: Priority Scoring
// Scores a task on urgency and impact dimensions
// ============================================================

const SYSTEM_PROMPT = `Score the task on urgency and impact.

Urgency (1-5):
5 = Due today / overdue / ASAP / urgent
4 = Within 2 days / blocking others / very time-sensitive
3 = This week / moderate time pressure
2 = Next week / some urgency
1 = No clear deadline

Impact (1-5):
5 = Key client, revenue, compliance, access, interview, payment, or major outcome at risk
4 = Project milestone, approval, submission, or multiple people waiting
3 = Standard work or school task
2 = Internal or low-visibility task
1 = Nice-to-have or optional

Rules:
- Use the task title, summary, action items, sender, and current date.
- Use user preferences and learned handling rules as soft guidance, not absolute rules.
- Do not mark everything as urgent.
- If the task involves deadlines, approvals, meetings, interviews, bills, verification, university, or work obligations, urgency and/or impact is often higher.
- combinedScore = urgency × impact

Return the structured result that matches the schema.`

export interface ScorePriorityInput {
  title: string
  summary: string
  actionItems: string[]
  sender: string
  currentDate: string
  memory?: string
}

export async function scorePriority(input: ScorePriorityInput): Promise<PriorityResult> {
  const prompt = `${input.memory ? `User preferences and learned handling rules:\n${input.memory}\n\n` : ''}Task: ${input.title}
Summary: ${input.summary}
Action items: ${input.actionItems.join('; ')}
Sender: ${input.sender}
Current date: ${input.currentDate}`

  return withFallback('Priority scoring', 'fast', async (model) => {
    const { object } = await generateObject({
      model,
      schema: prioritySchema,
      system: SYSTEM_PROMPT,
      prompt,
    })
    return object
  })
}
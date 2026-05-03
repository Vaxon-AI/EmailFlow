import { generateText } from 'ai'
import { getModel, getFallbackModel } from '../provider'

// ============================================================
// AI-generated digest content
// Used for paid (Pro) users; free users get the deterministic
// template in workflows/digest-pipeline.ts
// ============================================================

type EmailRow = { subject: string; sender: string }
type TaskRow = {
  title: string
  status: string
  priorityScore?: number | null
  userSetDeadline?: Date | null
  explicitDeadline?: Date | null
  inferredDeadline?: Date | null
}

export interface DailyDigestAIInput {
  period: 'daily'
  dateLabel: string
  emails: {
    action: EmailRow[]
    awareness: EmailRow[]
    uncertain: EmailRow[]
    ignored: EmailRow[]
  }
  tasks: {
    confirmed: TaskRow[]
    pending: TaskRow[]
  }
}

export interface WeeklyDigestAIInput {
  period: 'weekly'
  weekLabel: string
  byDay: Array<{
    dateLabel: string
    counts: { action: number; awareness: number; uncertain: number; ignored: number }
    actionEmails: EmailRow[]
  }>
  tasks: {
    confirmed: TaskRow[]
    pending: TaskRow[]
  }
}

export type DigestAIInput = DailyDigestAIInput | WeeklyDigestAIInput

const SYSTEM_PROMPT = `You write the calm, useful Markdown digest that EmailFlow AI delivers each morning.

The reader is a busy operator / founder / project lead whose inbox is the job. They need to know what to do today (or this week), not get hyped. Tone: matter-of-fact, neutral, professional. No motivational filler, no "Hope your day is going well", no exclamation marks.

Output rules:
- Markdown only. No code fences around the whole digest.
- Daily digest opens with "## Daily Digest — {date}" then a one-sentence overview ("Three action items, two waiting on stakeholders. The biggest is …").
- Weekly digest opens with "## Weekly Digest — {weekLabel}" then a one-sentence overview that names the trend (volume, busiest day, recurring sender).
- Group emails by category. Use "### Needs Action (N)", "### FYI (N)", "### Uncertain (N)", "### Ignored (N)" — skip a section when its count is 0.
- For Needs Action items use "- **subject** · sender". For other categories use "- subject · sender".
- If a category has more than 8 items, list the most important 5–8 (judge by sender weight and obvious urgency cues like "EOD", "today", "ASAP", named stakeholders) and end with "- …and N more."
- After the email block put "---" on its own line, then "### Tasks - {N} active · {M} AI suggestions".
- Under "**Active**" list confirmed tasks: "- {title}{ priorityScore? · Priority X : ''}{ deadline? · Due {short date} : ''}".
- Under "**AI Suggestions**" list pending tasks by title only.
- If there are no tasks: "No tasks in the pipeline."
- Never invent emails, tasks, deadlines, or senders. If a field is missing, omit it.
- Do not include any preamble before the "## Daily/Weekly Digest" heading.`

function rowDeadline(t: TaskRow): string | null {
  const d = t.userSetDeadline ?? t.explicitDeadline ?? t.inferredDeadline
  return d ? d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) : null
}

function fmtTaskRow(t: TaskRow): string {
  const parts = [t.title]
  if (t.priorityScore != null) parts.push(`priority ${t.priorityScore}`)
  const due = rowDeadline(t)
  if (due) parts.push(`due ${due}`)
  return parts.join(' · ')
}

function buildPrompt(input: DigestAIInput): string {
  const lines: string[] = []
  lines.push(`Period: ${input.period}`)

  if (input.period === 'daily') {
    lines.push(`Date label: ${input.dateLabel}`)
    lines.push('')
    lines.push('Emails (today):')
    for (const cat of ['action', 'awareness', 'uncertain', 'ignored'] as const) {
      const list = input.emails[cat]
      lines.push(`  ${cat} (${list.length}):`)
      for (const e of list) lines.push(`    - subject="${e.subject}" sender="${e.sender}"`)
    }
  } else {
    lines.push(`Week label: ${input.weekLabel}`)
    lines.push('')
    lines.push('Daily counts:')
    for (const day of input.byDay) {
      const c = day.counts
      lines.push(`  ${day.dateLabel}: action=${c.action} fyi=${c.awareness} uncertain=${c.uncertain} ignored=${c.ignored}`)
    }
    lines.push('')
    lines.push('Action emails this week (newest first if order matters):')
    for (const day of input.byDay) {
      for (const e of day.actionEmails) {
        lines.push(`  - subject="${e.subject}" sender="${e.sender}" date="${day.dateLabel}"`)
      }
    }
  }

  lines.push('')
  lines.push(`Tasks - active (${input.tasks.confirmed.length}):`)
  for (const t of input.tasks.confirmed) lines.push(`  - ${fmtTaskRow(t)}`)
  lines.push(`Tasks - AI suggestions / pending (${input.tasks.pending.length}):`)
  for (const t of input.tasks.pending) lines.push(`  - ${fmtTaskRow(t)}`)

  lines.push('')
  lines.push('Write the Markdown digest now.')
  return lines.join('\n')
}

export async function generateAIDigest(input: DigestAIInput): Promise<string> {
  const prompt = buildPrompt(input)

  try {
    const { text } = await generateText({
      model: getModel('balanced'),
      system: SYSTEM_PROMPT,
      prompt,
    })
    return text.trim()
  } catch (error) {
    console.warn('[digest-ai] primary model failed, trying fallback:', error)
    const { text } = await generateText({
      model: getFallbackModel('balanced'),
      system: SYSTEM_PROMPT,
      prompt,
    })
    return text.trim()
  }
}

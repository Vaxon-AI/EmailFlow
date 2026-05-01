import * as taskRepo from '@/repositories/task-repo'
import * as emailRepo from '@/repositories/email-repo'
import * as digestRepo from '@/repositories/digest-repo'

// ============================================================
// Digest Pipeline — template-based, no AI required
//
// Daily:  yesterday's emails by classification + current tasks
// Weekly: last 7 days of emails aggregated + tasks
// ============================================================

type EmailRow = { subject: string; sender: string }
type TaskRow = {
  title: string
  priorityScore?: number | null
  status: string
  userSetDeadline?: Date | null
  explicitDeadline?: Date | null
  inferredDeadline?: Date | null
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtShort(d: Date) {
  return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
}

function deadline(t: TaskRow): string | null {
  const d = t.userSetDeadline ?? t.explicitDeadline ?? t.inferredDeadline
  return d ? d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) : null
}

// ── Daily template ──────────────────────────────────────────

function buildDailyContent({
  action, awareness, uncertain, ignored, confirmed, pending, date,
}: {
  action: EmailRow[]
  awareness: EmailRow[]
  uncertain: EmailRow[]
  ignored: EmailRow[]
  confirmed: TaskRow[]
  pending: TaskRow[]
  date: string
}) {
  const lines: string[] = []
  lines.push(`## Daily Digest — ${date}`, '')

  if (action.length) {
    lines.push(`### Needs Action (${action.length})`)
    action.forEach(e => lines.push(`- **${e.subject}** · ${e.sender}`))
    lines.push('')
  }

  if (awareness.length) {
    lines.push(`### FYI (${awareness.length})`)
    awareness.forEach(e => lines.push(`- ${e.subject} · ${e.sender}`))
    lines.push('')
  }

  if (uncertain.length) {
    lines.push(`### Uncertain (${uncertain.length})`)
    uncertain.forEach(e => lines.push(`- ${e.subject} · ${e.sender}`))
    lines.push('')
  }

  if (ignored.length) {
    lines.push(`### Ignored (${ignored.length})`)
    ignored.forEach(e => lines.push(`- ${e.subject}`))
    lines.push('')
  }

  if (!action.length && !awareness.length && !uncertain.length && !ignored.length) {
    lines.push('No activity yet today.', '')
  }

  lines.push('---', '')
  lines.push(`### Tasks - ${confirmed.length} active · ${pending.length} AI suggestions`, '')

  if (confirmed.length) {
    lines.push('**Active**')
    confirmed.forEach(t => {
      const due = deadline(t)
      lines.push(`- ${t.title}${t.priorityScore ? ` · Priority ${t.priorityScore}` : ''}${due ? ` · Due ${due}` : ''}`)
    })
    lines.push('')
  }

  if (pending.length) {
    lines.push('**AI Suggestions**')
    pending.forEach(t => lines.push(`- ${t.title}`))
    lines.push('')
  }

  if (!confirmed.length && !pending.length) {
    lines.push('No tasks in the pipeline.')
  }

  return lines.join('\n')
}

// ── Weekly template ─────────────────────────────────────────

function buildWeeklyContent({
  byDay, confirmed, pending, weekLabel,
}: {
  byDay: { date: Date; action: EmailRow[]; awareness: EmailRow[]; uncertain: EmailRow[]; ignored: EmailRow[] }[]
  confirmed: TaskRow[]
  pending: TaskRow[]
  weekLabel: string
}) {
  const totalAction = byDay.reduce((s, d) => s + d.action.length, 0)
  const totalAwareness = byDay.reduce((s, d) => s + d.awareness.length, 0)
  const totalUncertain = byDay.reduce((s, d) => s + d.uncertain.length, 0)
  const totalIgnored = byDay.reduce((s, d) => s + d.ignored.length, 0)
  const totalEmails = totalAction + totalAwareness + totalUncertain + totalIgnored

  const lines: string[] = []
  lines.push(`## Weekly Digest — ${weekLabel}`, '')

  lines.push('### Summary')
  lines.push(`- **${totalEmails} emails** processed - ${totalAction} needs action · ${totalAwareness} FYI · ${totalUncertain} uncertain · ${totalIgnored} ignored`)
  lines.push(`- **${confirmed.length + pending.length} tasks** - ${confirmed.length} active · ${pending.length} AI suggestions`)
  lines.push('')

  lines.push('### Daily Breakdown')
  byDay.forEach(day => {
    const total = day.action.length + day.awareness.length + day.uncertain.length + day.ignored.length
    if (total === 0) return
    lines.push(`**${fmtShort(day.date)}** — ${day.action.length} action · ${day.awareness.length} awareness · ${day.uncertain.length} review · ${day.ignored.length} low priority`)
  })
  lines.push('')

  if (totalAction > 0) {
    lines.push('### Action Emails This Week')
    byDay.forEach(day => {
      day.action.forEach(e => lines.push(`- **${e.subject}** · ${e.sender} · ${fmtShort(day.date)}`))
    })
    lines.push('')
  }

  lines.push('---', '')
  lines.push(`### Tasks - ${confirmed.length} active · ${pending.length} AI suggestions`, '')

  if (confirmed.length) {
    lines.push('**Active**')
    confirmed.forEach(t => {
      const due = deadline(t)
      lines.push(`- ${t.title}${due ? ` · Due ${due}` : ''}`)
    })
    lines.push('')
  }

  if (pending.length) {
    lines.push('**AI Suggestions**')
    pending.forEach(t => lines.push(`- ${t.title}`))
    lines.push('')
  }

  if (!confirmed.length && !pending.length) {
    lines.push('No tasks in the pipeline.')
  }

  return lines.join('\n')
}

// ── Period helpers ───────────────────────────────────────────

function todayRange() {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return { start, end: now }
}


function thisWeekSoFarRange() {
  const now = new Date()
  const start = new Date(now)
  const day = start.getDay() // 0=Sun,1=Mon,...,6=Sat
  const daysSinceMonday = day === 0 ? 6 : day - 1
  start.setDate(start.getDate() - daysSinceMonday)
  start.setHours(0, 0, 0, 0)
  return { start, end: now }
}

// ── Public API ───────────────────────────────────────────────

export async function createDailyDigest(userId: string) {
  const { start, end } = todayRange()

  const [action, awareness, uncertain, ignored, tasks] = await Promise.all([
    emailRepo.findEmailsByClassification(userId, 'action', { start, end }),
    emailRepo.findEmailsByClassification(userId, 'awareness', { start, end }),
    emailRepo.findEmailsByClassification(userId, 'uncertain', { start, end }),
    emailRepo.findEmailsByClassification(userId, 'ignore', { start, end }),
    taskRepo.findTasksByDateRange(userId, { start, end }),
  ])

  const confirmed = tasks.filter(t => t.status === 'confirmed').sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
  const pending = tasks.filter(t => t.status === 'pending')

  const stats = {
    actionCount: action.length,
    awarenessCount: awareness.length,
    unresolvedCount: uncertain.length,
    ignoredCount: ignored.length,
    taskTotal: tasks.length,
    taskPending: pending.length,
  }

  const content = buildDailyContent({
    action, awareness, uncertain, ignored, confirmed, pending,
    date: fmtDate(start),
  })

  return digestRepo.createDigest({
    userId,
    period: 'daily',
    periodStart: start,
    periodEnd: end,
    content,
    stats,
  })
}

export async function createWeeklyDigest(userId: string) {
  const { start, end } = thisWeekSoFarRange()

  // Fetch each day's emails separately — Mon through today only
  const days: Date[] = []
  const cursor = new Date(start)
  const todayEnd = new Date(end)
  todayEnd.setHours(23, 59, 59, 999)
  while (cursor <= todayEnd) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  const byDay = await Promise.all(
    days.map(async (date) => {
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setHours(23, 59, 59, 999)
      const range = { start: dayStart, end: dayEnd }

      const [action, awareness, uncertain, ignored] = await Promise.all([
        emailRepo.findEmailsByClassification(userId, 'action', range),
        emailRepo.findEmailsByClassification(userId, 'awareness', range),
        emailRepo.findEmailsByClassification(userId, 'uncertain', range),
        emailRepo.findEmailsByClassification(userId, 'ignore', range),
      ])

      return { date, action, awareness, uncertain, ignored }
    })
  )

  const tasks = await taskRepo.findTasksByDateRange(userId, { start, end })
  const confirmed = tasks.filter(t => t.status === 'confirmed')
  const pending = tasks.filter(t => t.status === 'pending')

  const totalAction = byDay.reduce((s, d) => s + d.action.length, 0)
  const totalAwareness = byDay.reduce((s, d) => s + d.awareness.length, 0)
  const totalUncertain = byDay.reduce((s, d) => s + d.uncertain.length, 0)
  const totalIgnored = byDay.reduce((s, d) => s + d.ignored.length, 0)

  const stats = {
    actionCount: totalAction,
    awarenessCount: totalAwareness,
    unresolvedCount: totalUncertain,
    ignoredCount: totalIgnored,
    taskTotal: tasks.length,
    taskPending: pending.length,
  }

  const weekLabel = `${fmtShort(start)} – ${fmtShort(end)}`
  const content = buildWeeklyContent({ byDay, confirmed, pending, weekLabel })

  return digestRepo.createDigest({
    userId,
    period: 'weekly',
    periodStart: start,
    periodEnd: end,
    content,
    stats,
    isPreview: true,
  })
}

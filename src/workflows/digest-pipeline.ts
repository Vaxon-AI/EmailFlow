import * as taskRepo from '@/repositories/task-repo'
import * as emailRepo from '@/repositories/email-repo'
import * as digestRepo from '@/repositories/digest-repo'
import { prisma } from '@/lib/prisma'

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

// ── Period helpers (timezone-aware) ──────────────────────────

const WEEKDAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function getLocalParts(now: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10) % 24,
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
    weekday: WEEKDAY_MAP[get('weekday')] ?? -1,
  }
}

function getTzOffsetMs(now: Date, tz: string): number {
  // ms to add to a UTC instant such that interpreting the result as UTC matches the wall-clock time in tz
  const p = getLocalParts(now, tz)
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return localAsUtc - now.getTime()
}

function startOfTodayInTz(now: Date, tz: string): Date {
  const p = getLocalParts(now, tz)
  const offsetMs = getTzOffsetMs(now, tz)
  const localMidnightAsUtc = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0)
  return new Date(localMidnightAsUtc - offsetMs)
}

function startOfWeekInTz(now: Date, tz: string): Date {
  const p = getLocalParts(now, tz)
  const daysSinceMonday = p.weekday === 0 ? 6 : p.weekday - 1
  const todayStart = startOfTodayInTz(now, tz)
  todayStart.setUTCDate(todayStart.getUTCDate() - daysSinceMonday)
  return todayStart
}

function isAfterSunday20InTz(now: Date, tz: string): boolean {
  const weekStart = startOfWeekInTz(now, tz)
  // Sunday 20:00 of this week = weekStart + 6 days + 20 hours
  const sun20 = new Date(weekStart.getTime() + (6 * 24 + 20) * 60 * 60 * 1000)
  return now.getTime() >= sun20.getTime()
}

async function resolveTimezone(userId: string, override?: string): Promise<string> {
  if (override) return override
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } })
  return user?.timezone || 'UTC'
}

// ── Public API ───────────────────────────────────────────────

export async function createDailyDigest(userId: string, timezone?: string) {
  const tz = await resolveTimezone(userId, timezone)
  const now = new Date()
  const start = startOfTodayInTz(now, tz)
  const end = now

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

export async function createWeeklyDigest(userId: string, timezone?: string) {
  const tz = await resolveTimezone(userId, timezone)
  const now = new Date()
  const start = startOfWeekInTz(now, tz)
  const end = now

  // Fetch each day's emails separately — Mon through today only (user-local day boundaries)
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
    if (dayStart.getTime() > now.getTime()) break
    days.push(dayStart)
  }

  const byDay = await Promise.all(
    days.map(async (dayStart) => {
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)
      const range = { start: dayStart, end: dayEnd }

      const [action, awareness, uncertain, ignored] = await Promise.all([
        emailRepo.findEmailsByClassification(userId, 'action', range),
        emailRepo.findEmailsByClassification(userId, 'awareness', range),
        emailRepo.findEmailsByClassification(userId, 'uncertain', range),
        emailRepo.findEmailsByClassification(userId, 'ignore', range),
      ])

      return { date: dayStart, action, awareness, uncertain, ignored }
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
    isPreview: !isAfterSunday20InTz(now, tz),
  })
}

import * as taskRepo from '@/repositories/task-repo'
import * as emailRepo from '@/repositories/email-repo'
import * as digestRepo from '@/repositories/digest-repo'
import { prisma } from '@/lib/prisma'
import { generateAIDigest } from '@/ai/skills/generate-digest'
import { getPriorityBand, getPriorityLabel } from '@/types'

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

type DigestBuildResult = {
  period: 'daily' | 'weekly'
  periodStart: Date
  periodEnd: Date
  content: string
  stats: Record<string, number>
  isPreview?: boolean
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
  action, awareness, uncertain, ignored, active, pending, date,
}: {
  action: EmailRow[]
  awareness: EmailRow[]
  uncertain: EmailRow[]
  ignored: EmailRow[]
  active: TaskRow[]
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
    lines.push(`### Needs Review (${uncertain.length})`)
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
  lines.push(`### Tasks - ${active.length} active · ${pending.length} AI suggestions`, '')

  if (active.length) {
    lines.push('**active**')
    active.forEach(t => {
      const due = deadline(t)
      const priorityLabel = t.priorityScore != null ? getPriorityLabel(getPriorityBand(t.priorityScore)) : null
      lines.push(`- ${t.title}${priorityLabel ? ` · Priority ${priorityLabel}` : ''}${due ? ` · Due ${due}` : ''}`)
    })
    lines.push('')
  }

  if (pending.length) {
    lines.push('**AI Suggestions**')
    pending.forEach(t => lines.push(`- ${t.title}`))
    lines.push('')
  }

  if (!active.length && !pending.length) {
    lines.push('No tasks in the pipeline.')
  }

  return lines.join('\n')
}

// ── Weekly template ─────────────────────────────────────────

function buildWeeklyContent({
  byDay, active, pending, weekLabel,
}: {
  byDay: { date: Date; action: EmailRow[]; awareness: EmailRow[]; uncertain: EmailRow[]; ignored: EmailRow[] }[]
  active: TaskRow[]
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
  lines.push(`- **${active.length + pending.length} tasks** - ${active.length} active · ${pending.length} AI suggestions`)
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
  lines.push(`### Tasks - ${active.length} active · ${pending.length} AI suggestions`, '')

  if (active.length) {
    lines.push('**active**')
    active.forEach(t => {
      const due = deadline(t)
      const priorityLabel = t.priorityScore != null ? getPriorityLabel(getPriorityBand(t.priorityScore)) : null
      lines.push(`- ${t.title}${priorityLabel ? ` · Priority ${priorityLabel}` : ''}${due ? ` · Due ${due}` : ''}`)
    })
    lines.push('')
  }

  if (pending.length) {
    lines.push('**AI Suggestions**')
    pending.forEach(t => lines.push(`- ${t.title}`))
    lines.push('')
  }

  if (!active.length && !pending.length) {
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

async function resolveUserContext(userId: string, timezoneOverride?: string): Promise<{ tz: string; plan: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, plan: true },
    })
    return {
      tz: timezoneOverride || user?.timezone || 'UTC',
      plan: user?.plan || 'free',
    }
  } catch {
    return { tz: timezoneOverride || 'UTC', plan: 'free' }
  }
}

function enumerateDays(start: Date, now: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
    if (dayStart.getTime() > now.getTime()) break
    days.push(dayStart)
  }
  return days
}

async function fetchDailyEmailBuckets(userId: string, days: Date[]) {
  return Promise.all(
    days.map(async (dayStart) => {
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)
      const range = { start: dayStart, end: dayEnd }

      const [action, tracked, awareness, uncertain, ignored] = await Promise.all([
        emailRepo.findEmailsByClassification(userId, 'action', range, { actioned: false }),
        emailRepo.findActionedEmails(userId, range),
        emailRepo.findEmailsByClassification(userId, 'awareness', range, { actioned: false }),
        emailRepo.findEmailsByClassification(userId, 'uncertain', range),
        emailRepo.findEmailsByClassification(userId, 'ignore', range),
      ])

      return { date: dayStart, action, tracked, awareness, uncertain, ignored }
    })
  )
}

// ── Public API ───────────────────────────────────────────────

async function buildDailyDigest(userId: string, timezone?: string, useAi = true): Promise<DigestBuildResult> {
  const { tz, plan } = await resolveUserContext(userId, timezone)
  const now = new Date()
  const start = startOfTodayInTz(now, tz)
  const end = now

  const [action, tracked, awareness, uncertain, ignored, tasks] = await Promise.all([
    emailRepo.findEmailsByClassification(userId, 'action', { start, end }, { actioned: false }),
    emailRepo.findActionedEmails(userId, { start, end }),
    emailRepo.findEmailsByClassification(userId, 'awareness', { start, end }, { actioned: false }),
    emailRepo.findEmailsByClassification(userId, 'uncertain', { start, end }),
    emailRepo.findEmailsByClassification(userId, 'ignore', { start, end }),
    taskRepo.findTasksByDateRange(userId, { start, end }),
  ])

  const active = tasks.filter(t => t.status === 'active').sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
  const pending = tasks.filter(t => t.status === 'ai_suggestion')
  const completed = tasks.filter(t => t.status === 'completed')

  const stats = {
    actionCount: action.length,
    trackedCount: tracked.length,
    awarenessCount: awareness.length,
    unresolvedCount: uncertain.length,
    ignoredCount: ignored.length,
    taskTotal: tasks.length,
    taskActive: active.length,
    taskPending: pending.length,
    taskCompleted: completed.length,
  }

  const dateLabel = fmtDate(start)
  let content: string
  if (useAi && plan === 'pro') {
    try {
      content = await generateAIDigest({
        period: 'daily',
        dateLabel,
        emails: { action, awareness, uncertain, ignored },
        tasks: { active, pending },
      })
    } catch (err) {
      console.warn('[digest-pipeline] AI daily digest failed for user, falling back to template:', err)
      content = buildDailyContent({ action, awareness, uncertain, ignored, active, pending, date: dateLabel })
    }
  } else {
    content = buildDailyContent({ action, awareness, uncertain, ignored, active, pending, date: dateLabel })
  }

  return { period: 'daily', periodStart: start, periodEnd: end, content, stats }
}

export async function createDailyDigest(userId: string, timezone?: string) {
  const built = await buildDailyDigest(userId, timezone)
  return digestRepo.createDigest({
    userId,
    ...built,
  })
}

async function buildWeeklyDigest(userId: string, timezone?: string, useAi = true): Promise<DigestBuildResult> {
  const { tz, plan } = await resolveUserContext(userId, timezone)
  const now = new Date()
  const start = startOfWeekInTz(now, tz)
  const end = now

  const days = enumerateDays(start, now)
  const byDay = await fetchDailyEmailBuckets(userId, days)

  const tasks = await taskRepo.findTasksByDateRange(userId, { start, end })
  const active = tasks.filter(t => t.status === 'active')
  const pending = tasks.filter(t => t.status === 'ai_suggestion')
  const completed = tasks.filter(t => t.status === 'completed')

  const totalAction = byDay.reduce((s, d) => s + d.action.length, 0)
  const totalTracked = byDay.reduce((s, d) => s + d.tracked.length, 0)
  const totalAwareness = byDay.reduce((s, d) => s + d.awareness.length, 0)
  const totalUncertain = byDay.reduce((s, d) => s + d.uncertain.length, 0)
  const totalIgnored = byDay.reduce((s, d) => s + d.ignored.length, 0)

  const stats = {
    actionCount: totalAction,
    trackedCount: totalTracked,
    awarenessCount: totalAwareness,
    unresolvedCount: totalUncertain,
    ignoredCount: totalIgnored,
    taskTotal: tasks.length,
    taskActive: active.length,
    taskPending: pending.length,
    taskCompleted: completed.length,
  }

  const weekLabel = `${fmtShort(start)} - ${fmtShort(end)}`
  let content: string
  if (useAi && plan === 'pro') {
    try {
      content = await generateAIDigest({
        period: 'weekly',
        weekLabel,
        byDay: byDay.map((d) => ({
          dateLabel: fmtShort(d.date),
          counts: {
            action: d.action.length,
            awareness: d.awareness.length,
            uncertain: d.uncertain.length,
            ignored: d.ignored.length,
          },
          actionEmails: d.action,
        })),
        tasks: { active, pending },
      })
    } catch (err) {
      console.warn('[digest-pipeline] AI weekly digest failed for user, falling back to template:', err)
      content = buildWeeklyContent({ byDay, active, pending, weekLabel })
    }
  } else {
    content = buildWeeklyContent({ byDay, active, pending, weekLabel })
  }

  return {
    period: 'weekly',
    periodStart: start,
    periodEnd: end,
    content,
    stats,
    isPreview: !isAfterSunday20InTz(now, tz),
  }
}

export async function createWeeklyDigest(userId: string, timezone?: string) {
  const { tz, plan } = await resolveUserContext(userId, timezone)
  const now = new Date()
  const start = startOfWeekInTz(now, tz)
  const end = now

  const days = enumerateDays(start, now)
  const byDay = await fetchDailyEmailBuckets(userId, days)

  const tasks = await taskRepo.findTasksByDateRange(userId, { start, end })
  const active = tasks.filter(t => t.status === 'active')
  const pending = tasks.filter(t => t.status === 'ai_suggestion')
  const completed = tasks.filter(t => t.status === 'completed')

  const totalAction = byDay.reduce((s, d) => s + d.action.length, 0)
  const totalTracked = byDay.reduce((s, d) => s + d.tracked.length, 0)
  const totalAwareness = byDay.reduce((s, d) => s + d.awareness.length, 0)
  const totalUncertain = byDay.reduce((s, d) => s + d.uncertain.length, 0)
  const totalIgnored = byDay.reduce((s, d) => s + d.ignored.length, 0)

  const stats = {
    actionCount: totalAction,
    trackedCount: totalTracked,
    awarenessCount: totalAwareness,
    unresolvedCount: totalUncertain,
    ignoredCount: totalIgnored,
    taskTotal: tasks.length,
    taskActive: active.length,
    taskPending: pending.length,
    taskCompleted: completed.length,
  }

  const weekLabel = `${fmtShort(start)} – ${fmtShort(end)}`
  let content: string
  if (plan === 'pro') {
    try {
      content = await generateAIDigest({
        period: 'weekly',
        weekLabel,
        byDay: byDay.map((d) => ({
          dateLabel: fmtShort(d.date),
          counts: {
            action: d.action.length,
            awareness: d.awareness.length,
            uncertain: d.uncertain.length,
            ignored: d.ignored.length,
          },
          actionEmails: d.action,
        })),
        tasks: { active, pending },
      })
    } catch (err) {
      console.warn('[digest-pipeline] AI weekly digest failed for user, falling back to template:', err)
      content = buildWeeklyContent({ byDay, active, pending, weekLabel })
    }
  } else {
    content = buildWeeklyContent({ byDay, active, pending, weekLabel })
  }

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

export async function previewDigest(userId: string, period: 'daily' | 'weekly', timezone?: string) {
  const built = period === 'weekly'
    ? await buildWeeklyDigest(userId, timezone, false)
    : await buildDailyDigest(userId, timezone, false)
  const now = new Date()

  return {
    id: `current-${period}`,
    userId,
    ...built,
    stats: JSON.stringify(built.stats),
    isPreview: true,
    isCurrent: true,
    createdAt: now,
    updatedAt: now,
  }
}

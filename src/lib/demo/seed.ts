// ============================================================
// Demo seed — turns the static content templates into a dated dataset.
//
// Every date is computed RELATIVE TO `now` (the moment the demo is opened),
// so tasks always land around "today" instead of a fixed calendar date.
// Re-seeding (page reload / leaving the demo) produces a fresh dataset →
// the demo "resets to initial" with no persistence anywhere.
// ============================================================

import {
  DEMO_EMAILS,
  DEMO_IDENTITIES,
  DEMO_MATTERS,
  DEMO_PROJECTS,
  DEMO_TASKS,
  type TaskTemplate,
} from './content'
import type {
  ChartHistoryPoint,
  DemoData,
  DemoDigest,
  DemoDigestStats,
  DemoEmail,
  DemoTask,
  DemoTaskEmailLink,
} from './types'

// ---------- date helpers ----------

const DAY_MS = 86_400_000

/**
 * Emails the user has already turned into active work — they surface under the
 * "Tracked" tab. These are the action emails whose linked task is already
 * activated; the rest of the action emails stay in "Needs Action". Mirrors the
 * real inbox, where extracting a task flips the email to actioned = true.
 */
const TRACKED_EMAIL_IDS = new Set([
  'em-2',
  'em-5',
  'em-7',
  'em-10',
  'em-13',
  'em-14',
  ...DEMO_TASKS.map((task) => task.sourceEmailId).filter((id): id is string => Boolean(id)),
])

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

/** A date `days` from `now`, at `hour:minute` local time. */
function dateAt(now: Date, days: number, hour: number, minute = 0): Date {
  const r = startOfDay(now)
  r.setDate(r.getDate() + days)
  r.setHours(hour, minute, 0, 0)
  return r
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d)
  // Monday-based week
  const day = r.getDay()
  const diff = day === 0 ? -6 : 1 - day
  r.setDate(r.getDate() + diff)
  return r
}

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

// ---------- builders ----------

function buildEmails(now: Date): DemoEmail[] {
  return DEMO_EMAILS.map((t) => ({
    id: t.id,
    threadId: t.threadId,
    subject: t.subject,
    senderName: t.senderName,
    sender: t.sender,
    recipients: 'you@workspace.com',
    bodyPreview: t.bodyPreview,
    bodyFull: t.bodyFull,
    receivedAt: dateAt(now, -t.daysAgo, t.hour, randInt(0, 59)).toISOString(),
    hasAttachments: t.hasAttachments,
    classification: t.classification,
    classConfidence: t.classConfidence,
    classReasoning: t.classReasoning,
    awaitingReview: t.awaitingReview,
    actioned: TRACKED_EMAIL_IDS.has(t.id),
    aiReplyDraft: null,
    aiReplyGeneratedAt: null,
    projectId: t.projectId,
    matterId: t.matterId,
  }))
}

/** Jitter only "later" tasks so the curated near-today distribution holds. */
function jitterOffset(offset: number): number {
  if (offset >= 6) return offset + randInt(-2, 2)
  return offset
}

function buildTask(now: Date, t: TaskTemplate): DemoTask {
  const deadlineOffset = jitterOffset(t.deadlineOffset)
  const deadline = dateAt(now, deadlineOffset, 17, 0)
  const startDate = dateAt(now, deadlineOffset - Math.max(1, t.durationDays), 9, 0)
  const isEmailSourced = t.source === 'email'

  return {
    id: t.id,
    title: t.title,
    summary: t.summary,
    actionItems: [...t.actionItems],
    checkedActionItems: [],
    status: t.status,
    urgency: t.urgency,
    impact: t.impact,
    priorityScore: t.urgency * t.impact,
    priorityReason: t.priorityReason,
    startDate: startDate.toISOString(),
    explicitDeadline: null,
    inferredDeadline: isEmailSourced ? deadline.toISOString() : null,
    userSetDeadline: isEmailSourced ? null : deadline.toISOString(),
    isUserEdited: false,
    userNotes: null,
    // Completed tasks are created a few days before they were finished;
    // others were created within the last week.
    createdAt:
      t.status === 'completed' && t.completedOffset !== null
        ? dateAt(now, t.completedOffset - randInt(2, 5), randInt(8, 18)).toISOString()
        : dateAt(now, -randInt(1, 6), randInt(8, 18)).toISOString(),
    completedAt:
      t.status === 'completed' && t.completedOffset !== null
        ? dateAt(now, t.completedOffset, randInt(10, 16)).toISOString()
        : null,
    source: t.source,
    projectId: t.projectId,
    matterId: t.matterId,
  }
}

function buildLinks(): DemoTaskEmailLink[] {
  return DEMO_TASKS.filter((t) => t.sourceEmailId).map((t) => ({
    taskId: t.id,
    emailId: t.sourceEmailId as string,
    relationship: 'primary' as const,
  }))
}

// ---------- digest ----------

export function computeDigestStats(
  emails: DemoEmail[],
  tasks: DemoTask[],
  windowStart: Date,
  windowEnd: Date,
): DemoDigestStats {
  const inWindow = emails.filter((e) => {
    const t = new Date(e.receivedAt).getTime()
    return t >= windowStart.getTime() && t <= windowEnd.getTime()
  })
  return {
    actionCount: inWindow.filter((e) => e.classification === 'action').length,
    trackedCount: tasks.filter((t) => t.status === 'active').length,
    awarenessCount: inWindow.filter((e) => e.classification === 'awareness').length,
    unresolvedCount: inWindow.filter((e) => e.awaitingReview).length,
    ignoredCount: inWindow.filter((e) => e.classification === 'ignore').length,
    taskTotal: tasks.length,
    taskActive: tasks.filter((t) => t.status === 'active').length,
    taskPending: tasks.filter((t) => t.status === 'ai_suggestion').length,
    taskCompleted: tasks.filter((t) => t.status === 'completed').length,
  }
}

function effectiveDeadlineMs(t: DemoTask): number | null {
  const raw = t.userSetDeadline ?? t.explicitDeadline ?? t.inferredDeadline
  return raw ? new Date(raw).getTime() : null
}

export function buildDigestContent(
  period: 'daily' | 'weekly',
  stats: DemoDigestStats,
  tasks: DemoTask[],
  now: Date,
): string {
  const todayEnd = startOfDay(now).getTime() + DAY_MS
  const open = tasks.filter((t) => t.status === 'ai_suggestion' || t.status === 'active')

  const overdue = open.filter((t) => {
    const d = effectiveDeadlineMs(t)
    return d !== null && d < startOfDay(now).getTime()
  })
  const dueToday = open.filter((t) => {
    const d = effectiveDeadlineMs(t)
    return d !== null && d >= startOfDay(now).getTime() && d < todayEnd
  })
  const topThree = [...open]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 3)

  const label = period === 'daily' ? 'today' : 'this week'
  const lines: string[] = []

  lines.push(`## Your ${period} summary`)
  lines.push(
    `EmailFlow processed **${stats.actionCount + stats.awarenessCount + stats.ignoredCount} emails** ${label} — ` +
      `**${stats.actionCount}** needed action, **${stats.awarenessCount}** were FYI, and **${stats.ignoredCount}** were filtered as noise.`,
  )

  lines.push('## What needs you first')
  if (overdue.length > 0) {
    lines.push(`- ⚠️ **${overdue.length} task${overdue.length === 1 ? '' : 's'} overdue** — clear ${overdue.length === 1 ? 'it' : 'these'} before anything else.`)
  }
  if (dueToday.length > 0) {
    lines.push(`- 📌 **${dueToday.length} task${dueToday.length === 1 ? '' : 's'} due today.**`)
  }
  if (overdue.length === 0 && dueToday.length === 0) {
    lines.push('- ✅ Nothing overdue or due today — you are ahead.')
  }

  lines.push('## Top priorities')
  for (const t of topThree) {
    lines.push(`- **${t.title}** — ${t.priorityReason}`)
  }

  lines.push('## Workload')
  lines.push(
    `You have **${stats.taskActive} active** task${stats.taskActive === 1 ? '' : 's'}, ` +
      `**${stats.taskPending}** AI suggestion${stats.taskPending === 1 ? '' : 's'} waiting for review, ` +
      `and completed **${stats.taskCompleted}** ${label}.`,
  )

  return lines.join('\n\n')
}

function buildDigest(
  id: string,
  period: 'daily' | 'weekly',
  periodStart: Date,
  periodEnd: Date,
  isCurrent: boolean,
  createdAt: Date,
  emails: DemoEmail[],
  tasks: DemoTask[],
  now: Date,
): DemoDigest {
  const stats = computeDigestStats(emails, tasks, periodStart, periodEnd)
  return {
    id,
    period,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    content: buildDigestContent(period, stats, tasks, now),
    stats,
    createdAt: createdAt.toISOString(),
    isCurrent,
  }
}

function buildDigests(now: Date, emails: DemoEmail[], tasks: DemoTask[]): DemoDigest[] {
  const today = startOfDay(now)
  const weekStart = startOfWeek(now)

  return [
    buildDigest(
      'dg-daily-current',
      'daily',
      today,
      new Date(today.getTime() + DAY_MS),
      true,
      dateAt(now, 0, 8, 0),
      emails,
      tasks,
      now,
    ),
    buildDigest(
      'dg-daily-1',
      'daily',
      new Date(today.getTime() - DAY_MS),
      today,
      false,
      dateAt(now, -1, 8, 0),
      emails,
      tasks,
      now,
    ),
    buildDigest(
      'dg-daily-2',
      'daily',
      new Date(today.getTime() - 2 * DAY_MS),
      new Date(today.getTime() - DAY_MS),
      false,
      dateAt(now, -2, 8, 0),
      emails,
      tasks,
      now,
    ),
    buildDigest(
      'dg-weekly-current',
      'weekly',
      weekStart,
      new Date(weekStart.getTime() + 7 * DAY_MS),
      true,
      dateAt(now, 0, 8, 0),
      emails,
      tasks,
      now,
    ),
    buildDigest(
      'dg-weekly-1',
      'weekly',
      new Date(weekStart.getTime() - 7 * DAY_MS),
      weekStart,
      false,
      new Date(weekStart.getTime() - 5 * DAY_MS),
      emails,
      tasks,
      now,
    ),
  ]
}

// ---------- chart history ----------

// Hand-crafted 28-day wave that feeds ONLY the dashboard momentum chart —
// not the Tasks list, Emails inbox, or digest stats. Shape: weekly rhythm
// with mid-week peaks (Tue/Wed/Thu) and weekend troughs (Sat/Sun),
// repeated 4 times with small variation so the chart reads as four real
// working weeks rather than a flat line or a 0→N→0 spike. Index 0 maps
// to day -3 (avoids overlap with real completed task days -1 / -2).
//
// Each tuple is [completedTasks, createdTasks, actionEmails] for that day.
const HISTORY_WAVE: ReadonlyArray<readonly [number, number, number]> = [
  // Week 1 (most recent)
  [3, 2, 4],   // -3
  [5, 3, 6],   // -4
  [6, 4, 7],   // -5 peak
  [4, 3, 5],   // -6
  [2, 1, 3],   // -7
  [1, 1, 2],   // -8  weekend
  [1, 0, 2],   // -9  weekend
  // Week 2
  [3, 2, 4],   // -10
  [4, 3, 6],   // -11
  [5, 4, 7],   // -12 peak
  [5, 3, 6],   // -13
  [3, 2, 4],   // -14
  [1, 1, 2],   // -15 weekend
  [2, 1, 3],   // -16 weekend (someone catching up)
  // Week 3
  [4, 2, 5],   // -17
  [5, 3, 6],   // -18
  [4, 3, 7],   // -19 peak (in emails)
  [3, 2, 5],   // -20
  [2, 1, 3],   // -21
  [1, 0, 2],   // -22 weekend
  [1, 1, 1],   // -23 weekend
  // Week 4 (oldest)
  [3, 2, 4],   // -24
  [4, 3, 5],   // -25
  [5, 4, 7],   // -26 peak
  [4, 3, 5],   // -27
  [2, 2, 3],   // -28
  [1, 1, 2],   // -29 weekend
  [1, 0, 2],   // -30 weekend
]

function buildChartHistory(now: Date): ChartHistoryPoint[] {
  return HISTORY_WAVE.map((row, i) => {
    const daysAgo = -(i + 3)
    const d = dateAt(now, daysAgo, 12)
    return {
      dayKey: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      completedTasks: row[0],
      createdTasks: row[1],
      actionEmails: row[2],
    }
  })
}

// ---------- entry point ----------

export function seedDemoData(now: Date = new Date()): DemoData {
  const emails = buildEmails(now)
  const tasks = DEMO_TASKS.map((t) => buildTask(now, t))
  const links = buildLinks()
  const digests = buildDigests(now, emails, tasks)
  const chartHistory = buildChartHistory(now)

  return {
    identities: DEMO_IDENTITIES.map((i) => ({ ...i })),
    projects: DEMO_PROJECTS.map((p) => ({ ...p })),
    matters: DEMO_MATTERS.map((m) => ({ ...m })),
    emails,
    tasks,
    links,
    digests,
    chartHistory,
    seededAt: now.toISOString(),
  }
}

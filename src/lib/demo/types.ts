// ============================================================
// Demo data types
//
// These mirror the Prisma models (Email / Task / Digest / ...) but are
// trimmed to what the demo UI actually renders. The demo never touches the
// database or any API — every value here lives in memory only.
// ============================================================

export type DemoEmailCategory = 'action' | 'awareness' | 'ignore' | 'uncertain'

export type DemoTaskStatus = 'ai_suggestion' | 'active' | 'completed'

export interface DemoIdentity {
  id: string
  name: string
  description: string
}

export interface DemoProject {
  id: string
  identityId: string
  name: string
  description: string
}

export interface DemoMatter {
  id: string
  projectId: string
  title: string
  summary: string
}

export interface DemoEmail {
  id: string
  threadId: string
  subject: string
  senderName: string
  sender: string
  recipients: string
  bodyPreview: string
  bodyFull: string
  receivedAt: string
  hasAttachments: boolean
  classification: DemoEmailCategory | null
  classConfidence: number | null
  classReasoning: string | null
  awaitingReview: boolean
  actioned: boolean
  /** Pre-written "AI" reply draft — revealed by the simulated reply action. */
  aiReplyDraft: string | null
  aiReplyGeneratedAt: string | null
  projectId: string | null
  matterId: string | null
}

export interface DemoTask {
  id: string
  title: string
  summary: string
  actionItems: string[]
  /** Indices into actionItems that the user has ticked off. */
  checkedActionItems: number[]
  status: DemoTaskStatus
  urgency: number
  impact: number
  /** urgency × impact, 1–25. See getPriorityBand in @/types/task. */
  priorityScore: number
  priorityReason: string
  startDate: string | null
  explicitDeadline: string | null
  inferredDeadline: string | null
  userSetDeadline: string | null
  isUserEdited: boolean
  userNotes: string | null
  createdAt: string
  completedAt: string | null
  source: 'email' | 'manual'
  projectId: string | null
  matterId: string | null
}

export interface DemoTaskEmailLink {
  taskId: string
  emailId: string
  relationship: 'primary' | 'follow_up'
}

export interface DemoDigestStats {
  actionCount: number
  trackedCount: number
  awarenessCount: number
  unresolvedCount: number
  ignoredCount: number
  taskTotal: number
  taskActive: number
  taskPending: number
  taskCompleted: number
}

export interface DemoDigest {
  id: string
  period: 'daily' | 'weekly'
  periodStart: string
  periodEnd: string
  content: string
  stats: DemoDigestStats
  createdAt: string
  isCurrent: boolean
}

/**
 * Per-day synthetic counts that feed the dashboard momentum chart only.
 * These are NOT real tasks/emails — they exist purely to give the chart
 * a smooth, trend-shaped backdrop (busy mid-week, quiet weekends) without
 * polluting the Tasks list or the Emails inbox. Demo's "now" is fresh
 * every reseed, so the dayKey aligns with each session's current date.
 */
export interface ChartHistoryPoint {
  /** `${y}-${m}-${d}` matching the dashboard's dayKey() format. */
  dayKey: string
  completedTasks: number
  createdTasks: number
  actionEmails: number
}

export interface DemoData {
  identities: DemoIdentity[]
  projects: DemoProject[]
  matters: DemoMatter[]
  emails: DemoEmail[]
  tasks: DemoTask[]
  links: DemoTaskEmailLink[]
  digests: DemoDigest[]
  chartHistory: ChartHistoryPoint[]
  /** The moment the dataset was seeded — the demo's "now". */
  seededAt: string
}

/** Effective deadline: user override → explicit → AI-inferred. */
export function effectiveDeadline(task: DemoTask): string | null {
  return task.userSetDeadline ?? task.explicitDeadline ?? task.inferredDeadline
}

import { getPriorityBand } from '@/types'

export type ViewMode = 'list' | 'timeline' | 'calendar'
export type TaskStatus = 'ai_suggestion' | 'active' | 'completed'
export type StatusFilter = 'all' | 'ai_suggestion' | 'active' | 'completed'
export type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

export type TaskTabState = {
  bucket: StatusFilter
  totalCount: number
  newCount: number
  lastSeenAt: string | null
}

export type TaskEmailLink = {
  email?: {
    sender?: string | null
    threadId?: string | null
  } | null
}

export type TaskProject = {
  id: string
  name: string
  identity: { id: string; name: string } | null
} | null

export type TaskItem = {
  id: string
  title: string
  summary?: string | null
  status: TaskStatus
  startDate?: string | null
  priorityScore?: number | null
  explicitDeadline?: string | null
  inferredDeadline?: string | null
  userSetDeadline?: string | null
  emailLinks?: TaskEmailLink[]
  project?: TaskProject
  matter?: { id: string; title: string } | null
  source?: string | null
  createdAt?: string
}

export type TaskUpdateData = {
  status?: TaskStatus
  startDate?: string | null
  userSetDeadline?: string | null
}

export type TaskUpdateVars = {
  id: string
  data: TaskUpdateData
}

export type MutationLike = {
  mutate: (vars: TaskUpdateVars, options?: { onSuccess?: () => void; onError?: () => void }) => void
}

export type QueryResponse<T> = {
  data?: T
  meta?: {
    totalCount?: number
  }
}

export type CreateTaskResponse = {
  data: {
    id: string
  }
}

export type TaskDraft = {
  title: string
  summary: string
  actionItems: string[]
  explicitDeadline: string | null
  inferredDeadline: string | null
  deadlineConfidence: number
  urgency: number
  impact: number
  priorityScore: number
  priorityReason?: string
  splitReason: string | null
}

export type QuotaStatus = {
  pasteText?: {
    used: number
    limit: number | null
    resetAt: string
  }
}

export const PRIORITY_LEVELS: Record<string, { urgency: number; impact: number; score: number }> = {
  critical: { urgency: 5, impact: 4, score: 20 },
  high: { urgency: 4, impact: 4, score: 16 },
  medium: { urgency: 3, impact: 3, score: 9 },
  low: { urgency: 2, impact: 2, score: 4 },
}

export const PRIORITY_LABELS: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'ai_suggestion', label: 'AI Suggestions' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
]

export const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export function priorityBucketFromScore(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 20) return 'critical'
  if (score >= 12) return 'high'
  if (score >= 6) return 'medium'
  return 'low'
}

export function parsePriorityFilter(value: string | null): PriorityFilter {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' ? value : 'all'
}

export function parseStatusFilter(value: string | null): StatusFilter {
  return value === 'ai_suggestion' || value === 'active' || value === 'completed' ? value : 'all'
}

export function renderTaskTabNewBadge(count: number, bucket: StatusFilter) {
  if (bucket === 'completed' || count <= 0) return undefined
  return (
    <span className="rounded-full bg-critical px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
      +{count}
    </span>
  )
}

export function matchesPriorityFilter(task: TaskItem, priority: unknown) {
  if (priority !== 'critical' && priority !== 'high' && priority !== 'medium' && priority !== 'low') return true
  return getPriorityBand(task.priorityScore || 0) === priority
}


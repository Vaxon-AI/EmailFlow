'use client'

import { EMAIL_DISPLAY_CONFIG } from '@/lib/email-classification'
import type { DateRange } from 'react-day-picker'

export type BatchActionEmail = {
  id: string
  subject: string | null
  sender: string | null
  receivedAt: string
  taskLinks: Array<{ task: { id: string; title: string } | null }>
}

export type BatchStatus = {
  isComplete: boolean
  totalEmails: number
  pendingEmails: number
  classifiedEmails?: number
  quotaSkippedEmails?: number
  uncertainCount?: number
  uncertainEmails?: number
  actionEmailCount: number
  // Action emails with no linked task and not actioned — drives the banner.
  // Optional fallback to actionEmailCount guards stale cached responses.
  unhandledActionCount?: number
  actionEmails: BatchActionEmail[]
}

export function getUnhandledActionCount(batchStatus: BatchStatus) {
  return batchStatus.unhandledActionCount ?? batchStatus.actionEmailCount
}

export type Tab = 'needs_action' | 'tracked' | 'fyi' | 'ignored' | 'unclassified'
export type EmailBucket = 'needs_action' | 'tracked' | 'fyi' | 'ignored'
export type EmailClassification = 'action' | 'awareness' | 'ignore' | 'uncertain'

export type EmailTabState = {
  bucket: Tab
  totalCount: number
  newCount: number
  lastSeenAt: string | null
}

export const EMAIL_BUCKET_LABELS: Record<EmailBucket, string> = {
  needs_action: 'Needs Action',
  tracked: 'Tracked',
  fyi: 'FYI',
  ignored: 'Ignored',
}

export type LinkedTask = {
  id: string
  title: string
  status?: string | null
  completedAt?: string | null
}

export type EmailTaskLink = {
  task?: LinkedTask | null
}

export type EmailItem = {
  id: string
  subject?: string | null
  sender?: string | null
  bodyPreview?: string | null
  receivedAt: string
  classification?: EmailClassification | null
  processingStatus?: string | null
  actioned?: boolean
  taskLinks?: EmailTaskLink[]
  accountEmail?: string | null
  hasAttachments?: boolean | null
  threadId?: string | null
  retentionStatus?: string | null
  restorableUntil?: string | null
  project?: { id: string; name: string; identity: { id: string; name: string } | null } | null
  matter?: { id: string; title: string } | null
}

export type QueryMeta = {
  totalCount?: number
  totalPages?: number
  page?: number
}

export type QueryResponse<T> = {
  data?: T
  meta?: QueryMeta
}

const fyiPriority: Record<string, number> = {
  awareness: 0,
}

const VALID_TABS = new Set<Tab>(['needs_action', 'tracked', 'fyi', 'ignored', 'unclassified'])

export function hasLinkedTasks(email: EmailItem) {
  return (email.taskLinks ?? []).some((link) => link.task)
}

export function isNeedsActionPageEmail(email: EmailItem) {
  return email.classification === 'action' && email.actioned !== true && !hasLinkedTasks(email)
}

export function isUncertainEmail(email: EmailItem) {
  return email.classification === 'uncertain' && email.actioned !== true
}

export function canGenerateTaskFromEmail(email: EmailItem) {
  return (email.classification === 'action' || email.classification === 'uncertain' || !email.classification) && !hasLinkedTasks(email)
}

export function isTrackedEmail(email: EmailItem) {
  return hasLinkedTasks(email) || (email.actioned === true && email.classification === 'action')
}

export function isFyiEmail(email: EmailItem) {
  return email.classification === 'awareness' && !hasLinkedTasks(email)
}

export function isIgnoredEmail(email: EmailItem) {
  return email.classification === 'ignore' && !hasLinkedTasks(email)
}

export function isUnclassifiedEmail(email: EmailItem) {
  if (email.actioned || hasLinkedTasks(email)) return false
  if (!email.classification) return true
  if (email.classification === 'uncertain') return true
  return false
}

export function filterEmails(input: {
  emails: EmailItem[]
  tab: Tab
  accountFilter: string
  searchQuery: string
  dateRange?: DateRange
}) {
  const { emails, tab, accountFilter, searchQuery, dateRange } = input
  // Trust the server's bucket filter. Re-filtering here would drop rows when
  // TanStack Query briefly hands us the previous tab's placeholderData during
  // a tab switch, flashing an empty state instead of a spinner.
  let result = emails

  if (accountFilter !== 'all') {
    result = result.filter((email) => email.accountEmail === accountFilter)
  }

  if (dateRange?.from) {
    const from = new Date(dateRange.from)
    from.setHours(0, 0, 0, 0)
    result = result.filter((email) => new Date(email.receivedAt) >= from)
  }

  if (dateRange?.to) {
    const to = new Date(dateRange.to)
    to.setHours(23, 59, 59, 999)
    result = result.filter((email) => new Date(email.receivedAt) <= to)
  }

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase()
    result = result.filter((email) =>
      email.subject?.toLowerCase().includes(query) ||
      email.sender?.toLowerCase().includes(query) ||
      email.bodyPreview?.toLowerCase().includes(query)
    )
  }

  if (tab === 'fyi') {
    result = [...result].sort((a, b) => {
      const rankDiff =
        (fyiPriority[a.classification ?? ''] ?? 99) -
        (fyiPriority[b.classification ?? ''] ?? 99)

      if (rankDiff !== 0) return rankDiff
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    })
  }

  return result
}

export function parseEmailTab(value: string | null, legacyClassification: string | null): Tab {
  if (value && VALID_TABS.has(value as Tab)) return value as Tab
  if (value === 'needs_review') return 'unclassified'
  if (value === 'all' && legacyClassification === 'ignore') return 'ignored'
  if (legacyClassification === 'action') return 'needs_action'
  if (legacyClassification === 'uncertain') return 'unclassified'
  if (legacyClassification === 'awareness') return 'fyi'
  if (legacyClassification === 'ignore') return 'ignored'
  return 'needs_action'
}

export function renderEmailTabNewBadge(count: number, bucket: Tab) {
  if (bucket === 'ignored' || count <= 0) return undefined
  return (
    <span className="rounded-full bg-critical px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
      +{count}
    </span>
  )
}

export function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / 86400000)

  if (days === 0) {
    return date.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })
  }
  if (days === 1) {
    return 'Yesterday'
  }
  if (days < 7) {
    return date.toLocaleDateString('en', { weekday: 'short' })
  }
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export { EMAIL_DISPLAY_CONFIG }

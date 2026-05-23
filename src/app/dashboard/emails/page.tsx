'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/page-header'
import { SegmentedControl } from '@/components/segmented-control'
import { StatePanel } from '@/components/state-panel'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  CheckSquare, Paperclip, Mail,
  Search, CalendarIcon, X, ChevronDown, UserRound, FolderOpen, Loader2, Zap, Eye, EyeOff, Tag, CheckCircle2,
} from 'lucide-react'
import { Suspense, useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { EMAIL_DISPLAY_CONFIG, getEmailDisplayState } from '@/lib/email-classification'
import { getEmailLinkedTaskState } from '@/lib/email-linked-task-status'
import { ReassignProjectModal } from '@/components/reassign-project-modal'
import { BatchReassignModal } from '@/components/batch-reassign-modal'
import { InlineEditableName } from '@/components/inline-editable-name'
import { useAuth } from '@/lib/use-auth'
import { CACHE_TIME } from '@/lib/query-cache'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Sync batch types
// ---------------------------------------------------------------------------

type BatchActionEmail = {
  id: string
  subject: string | null
  sender: string | null
  receivedAt: string
  taskLinks: Array<{ task: { id: string; title: string } | null }>
}

type BatchStatus = {
  isComplete: boolean
  totalEmails: number
  pendingEmails: number
  classifiedEmails?: number
  quotaSkippedEmails?: number
  uncertainCount?: number
  uncertainEmails?: number
  actionEmailCount: number
  actionEmails: BatchActionEmail[]
}

// Each tab is a mutually-exclusive bucket — no "All Mail" tab anymore. Needs
// Action / Tracked / FYI cover the everyday mail; Ignored is the catch-all
// for AI-classified ignore + user-dismissed soft-deletes. Unclassified only
// appears when there are quota-skipped emails awaiting manual classification.
type Tab = 'needs_action' | 'tracked' | 'fyi' | 'ignored' | 'unclassified'
type EmailBucket = 'needs_action' | 'tracked' | 'fyi' | 'ignored'
type EmailClassification = 'action' | 'awareness' | 'ignore' | 'uncertain'

const EMAIL_BUCKET_LABELS: Record<EmailBucket, string> = {
  needs_action: 'Needs Action',
  tracked: 'Tracked',
  fyi: 'FYI',
  ignored: 'Ignored',
}

type LinkedTask = {
  id: string
  title: string
  status?: string | null
  completedAt?: string | null
}

type EmailTaskLink = {
  task?: LinkedTask | null
}

type EmailItem = {
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

type QueryMeta = {
  totalCount?: number
  totalPages?: number
  page?: number
}

type QueryResponse<T> = {
  data?: T
  meta?: QueryMeta
}

const fyiPriority: Record<string, number> = {
  awareness: 0,
}

const VALID_TABS = new Set<Tab>(['needs_action', 'tracked', 'fyi', 'ignored', 'unclassified'])

function isNeedsActionPageEmail(email: EmailItem) {
  return email.classification === 'action' && email.actioned !== true && !hasLinkedTasks(email)
}

function isUncertainEmail(email: EmailItem) {
  return email.classification === 'uncertain' && email.actioned !== true
}

function canGenerateTaskFromEmail(email: EmailItem) {
  return (email.classification === 'action' || email.classification === 'uncertain' || !email.classification) && !hasLinkedTasks(email)
}

function hasLinkedTasks(email: EmailItem) {
  return (email.taskLinks ?? []).some((link) => link.task)
}

function isTrackedEmail(email: EmailItem) {
  return hasLinkedTasks(email) || (email.actioned === true && email.classification === 'action')
}

function isFyiEmail(email: EmailItem) {
  return email.classification === 'awareness' && !hasLinkedTasks(email)
}

function isIgnoredEmail(email: EmailItem) {
  return email.classification === 'ignore' && !hasLinkedTasks(email)
}

// "Unclassified" bucket: anything the user has to look at manually because
// AI either couldn't categorize it (quota_skipped) or wasn't confident
// enough (uncertain). actioned=true takes the email out of this bucket
// (it's effectively triaged by being in Tracked).
function isUnclassifiedEmail(email: EmailItem) {
  if (email.actioned || hasLinkedTasks(email)) return false
  if (!email.classification) return true
  if (email.classification === 'uncertain') return true
  return false
}

function matchesEmailTab(email: EmailItem, tab: Tab) {
  if (tab === 'needs_action') return isNeedsActionPageEmail(email)
  if (tab === 'tracked') return isTrackedEmail(email)
  if (tab === 'fyi') return isFyiEmail(email)
  if (tab === 'unclassified') return isUnclassifiedEmail(email)
  return isIgnoredEmail(email)
}

type FilterEmailsOptions = {
  emails: EmailItem[]
  tab: Tab
  accountFilter: string
  searchQuery: string
  dateRange?: DateRange
}

function filterEmails({
  emails,
  tab,
  accountFilter,
  searchQuery,
  dateRange,
}: FilterEmailsOptions) {
  let result = emails

  result = result.filter((email) => matchesEmailTab(email, tab))

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

      if (rankDiff !== 0) {
        return rankDiff
      }

      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    })
  }

  return result
}

function parseEmailTab(value: string | null, legacyClassification: string | null): Tab {
  if (value && VALID_TABS.has(value as Tab)) return value as Tab
  if (value === 'needs_review') return 'unclassified'
  // Legacy URL compat: an old "?tab=all&classification=ignore" link from the
  // dashboard or a bookmark resolves to the new Ignored tab. Other classifications
  // are absorbed into their tab equivalents.
  if (value === 'all' && legacyClassification === 'ignore') return 'ignored'
  if (legacyClassification === 'action') return 'needs_action'
  if (legacyClassification === 'uncertain') return 'unclassified'
  if (legacyClassification === 'awareness') return 'fyi'
  if (legacyClassification === 'ignore') return 'ignored'
  return 'needs_action'
}

export default function EmailsPage() {
  return (
    <Suspense fallback={null}>
      <EmailsContent />
    </Suspense>
  )
}

function EmailsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusIdentityId = searchParams.get('identity') ?? undefined
  const tab = parseEmailTab(searchParams.get('tab'), searchParams.get('classification'))
  const [accountFilter, setAccountFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!from && !to) return undefined
    return {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    }
  })
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [selectingStep, setSelectingStep] = useState<'from' | 'to'>('from')
  const [page, setPage] = useState(1)
  const [reassignEmail, setReassignEmail] = useState<EmailItem | null>(null)
  const [selection, setSelection] = useState<{ tab: Tab; ids: Set<string> }>({ tab, ids: new Set() })
  const selectedIds = selection.tab === tab ? selection.ids : new Set<string>()
  const setSelectedIds = useCallback((updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setSelection((prev) => {
      const current = prev.tab === tab ? prev.ids : new Set<string>()
      const ids = typeof updater === 'function' ? updater(current) : updater
      return { tab, ids }
    })
  }, [tab])
  const [showBatchReassign, setShowBatchReassign] = useState(false)

  // Manual review mode
  const { user } = useAuth()
  const manualReviewMode = (user as (typeof user & { manualReviewMode?: boolean }) | null)?.manualReviewMode ?? true
  const queryClient = useQueryClient()
  // Per-sync-batch ack: when the user ticks "Don't show again for this sync"
  // in the review modal, we record the current sync batch id in sessionStorage.
  // Banner stays hidden as long as the current batch id matches the acked one.
  // A fresh sync produces a new batch id, so the banner reappears for new emails.
  // Lazy initializers run once on the client; SSR returns null/'no-batch'.
  const [ackedReviewBatchId, setAckedReviewBatchId] = useState<string | null>(() =>
    typeof window !== 'undefined'
      ? sessionStorage.getItem('emailflow:reviewBannerAckBatchId')
      : null
  )
  const [currentReviewBatchKey] = useState<string>(() =>
    typeof window !== 'undefined'
      ? sessionStorage.getItem('emailflow:syncBatchId') || 'no-batch'
      : 'no-batch'
  )
  const reviewBannerDismissed = ackedReviewBatchId === currentReviewBatchKey
  const [showAutoModeConfirm, setShowAutoModeConfirm] = useState(false)

  const ackCurrentReviewBatch = useCallback(() => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem('emailflow:reviewBannerAckBatchId', currentReviewBatchKey)
    setAckedReviewBatchId(currentReviewBatchKey)
  }, [currentReviewBatchKey])

  const clearReviewBannerAck = useCallback(() => {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem('emailflow:reviewBannerAckBatchId')
    setAckedReviewBatchId(null)
  }, [])

  const updateEmailUrlFilter = useCallback((next: { tab?: Tab }) => {
    // Use window.location.search instead of searchParams to always read the
    // current URL — avoids stale closure when the user clicks faster than React
    // can re-render after a router.replace call.
    const params = new URLSearchParams(window.location.search)
    if (next.tab) {
      params.set('tab', next.tab)
      // Clear legacy params so old links don't override the new tab.
      params.delete('filter')
      params.delete('classification')
    }
    const query = params.toString()
    router.replace(query ? `/dashboard/emails?${query}` : '/dashboard/emails', { scroll: false })
  }, [router])

  const { data: pendingReviewData } = useQuery({
    queryKey: ['pending-review-count'],
    queryFn: async () => {
      const r = await fetch('/api/emails/pending-review')
      const d = await r.json()
      return d.data?.count as number
    },
    enabled: manualReviewMode,
    staleTime: CACHE_TIME.list,
  })
  const pendingReviewCount = pendingReviewData ?? 0

  const reviewModeMutation = useMutation({
    mutationFn: async (mode: boolean) => {
      const res = await fetch('/api/settings/review-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualReviewMode: mode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error)
      return json
    },
    onSuccess: (json) => {
      const nextMode = json?.data?.manualReviewMode
      if (typeof nextMode === 'boolean') {
        queryClient.setQueryData(['auth-user'], (current: { manualReviewMode?: boolean } | null | undefined) =>
          current ? { ...current, manualReviewMode: nextMode } : current
        )
      }
      setShowAutoModeConfirm(false)
      clearReviewBannerAck()
      queryClient.invalidateQueries({ queryKey: ['auth-user'] })
      queryClient.invalidateQueries({ queryKey: ['auth-me'] })
      queryClient.invalidateQueries({ queryKey: ['pending-review-count'] })
    },
  })

  const handleReviewModeToggle = () => {
    if (manualReviewMode) {
      setShowAutoModeConfirm(true)
      return
    }

    reviewModeMutation.mutate(true)
  }

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  const clearSelection = () => setSelectedIds(new Set())

  // Batch ignore: collapses selected emails into the ignore bucket
  // (classification='ignore', actioned=true). DB rows stay so email sync
  // dedup remains intact — selected emails just disappear from the default
  // tabs and end up in All + classification=ignore.
  const bulkIgnoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/emails/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'ignore' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || 'Failed to ignore emails')
      return json.data as { affected: number }
    },
    onSuccess: (data) => {
      toast.success(`Ignored ${data.affected} email${data.affected === 1 ? '' : 's'}`)
      clearSelection()
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const bulkClassifyMutation = useMutation({
    mutationFn: async ({ ids, bucket }: { ids: string[]; bucket: EmailBucket }) => {
      const res = await fetch('/api/emails/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'classify', bucket }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || 'Failed to classify emails')
      return json.data as { affected: number; bucket: EmailBucket }
    },
    onSuccess: (data) => {
      toast.success(`Marked ${data.affected} email${data.affected === 1 ? '' : 's'} as ${EMAIL_BUCKET_LABELS[data.bucket]}`)
      clearSelection()
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['pending-review-count'] })
      queryClient.invalidateQueries({ queryKey: ['emails', 'unclassified-count'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Batch generate tasks: queues a pipeline pass for Needs Action emails
  // and respects extract quota. Server caps the queue at remaining quota and
  // tells us how many got queued vs skipped.
  const bulkGenerateTasksMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/emails/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'generate_tasks' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json?.error?.message || 'Failed to queue tasks')
      return json.data as {
        queued: number
        skippedIneligible: number
        skippedQuota: number
        quotaExhausted: boolean
      }
    },
    onSuccess: (data) => {
      const parts: string[] = []
      if (data.queued > 0) parts.push(`Queued ${data.queued} task${data.queued === 1 ? '' : 's'}`)
      if (data.skippedIneligible > 0) parts.push(`${data.skippedIneligible} skipped (not Needs Action)`)
      if (data.skippedQuota > 0) parts.push(`${data.skippedQuota} skipped (quota limit)`)

      const msg = parts.join(' — ') || 'Nothing to do'
      if (data.quotaExhausted || data.skippedQuota > 0) {
        toast.warning(msg)
      } else if (data.queued > 0) {
        toast.success(msg)
      } else {
        toast.info(msg)
      }
      clearSelection()
      // The pipeline runs in `after()`; refresh after a short delay so the
      // user sees Tracked count tick up.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['emails'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      }, 1500)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const bulkToggle = useCallback((ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (select) ids.forEach((id) => next.add(id))
      else ids.forEach((id) => next.delete(id))
      return next
    })
  }, [setSelectedIds])

  const selectAll = () => setSelectedIds(new Set(filtered.map((e) => e.id)))

  // Sync batch — read batchId from sessionStorage (written by header after sync).
  // Lazy initializer runs once on the client; returns null during SSR.
  const [syncBatchId] = useState<string | null>(() =>
    typeof window !== 'undefined'
      ? sessionStorage.getItem('emailflow:syncBatchId')
      : null
  )
  const [batchDismissed, setBatchDismissed] = useState(false)
  const [showBatchModal, setShowBatchModal] = useState(false)

  const { data: batchStatus } = useQuery<BatchStatus>({
    queryKey: ['syncBatch', syncBatchId],
    queryFn: async () => {
      const r = await fetch(`/api/sync/batch/${syncBatchId}`)
      const d = await r.json()
      return d.data as BatchStatus
    },
    enabled: !!syncBatchId && !batchDismissed,
    refetchInterval: (query) => {
      const data = query.state.data as BatchStatus | undefined
      if (!data || data.isComplete) return false
      return 3000
    },
    staleTime: 0,
  })

  // Derived: show the banner unless dismissed or the batch completed with no action emails.
  const batchBannerActive =
    !!syncBatchId &&
    !batchDismissed &&
    !(batchStatus?.isComplete && batchStatus.actionEmailCount === 0)

  // Side effect only: clean sessionStorage when a batch silently completes (no actions).
  useEffect(() => {
    if (batchStatus?.isComplete && batchStatus.actionEmailCount === 0) {
      sessionStorage.removeItem('emailflow:syncBatchId')
    }
  }, [batchStatus])

  useEffect(() => {
    if (!batchStatus) return
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
  }, [
    batchStatus,
    batchStatus?.pendingEmails,
    batchStatus?.classifiedEmails,
    batchStatus?.quotaSkippedEmails,
    batchStatus?.uncertainCount,
    batchStatus?.uncertainEmails,
    batchStatus?.isComplete,
    queryClient,
  ])

  const dismissBatchBanner = () => {
    sessionStorage.removeItem('emailflow:syncBatchId')
    setBatchDismissed(true)
    setShowBatchModal(false)
  }

  const handleDayClick = (day: Date) => {
    if (selectingStep === 'from') {
      const newTo = dateRange?.to && dateRange.to >= day ? dateRange.to : undefined
      setDateRange({ from: day, to: newTo })
      setSelectingStep('to')
    } else {
      if (!dateRange?.from || day < dateRange.from) {
        setDateRange({ from: day, to: undefined })
        setSelectingStep('to')
      } else {
        setDateRange({ from: dateRange.from, to: day })
        // Auto-close once both dates are selected
        setCalendarOpen(false)
        setSelectingStep('from')
      }
    }
  }

  const handleCalendarOpenChange = (open: boolean) => {
    setCalendarOpen(open)
    // Always start in 'from' mode when opening
    if (open) setSelectingStep('from')
  }

  const { data: res, isLoading } = useQuery({
    queryKey: ['emails', page, tab],
    queryFn: () =>
      fetch(`/api/emails?page=${page}&limit=2000&bucket=${tab}`).then((r) => r.json()),
    staleTime: CACHE_TIME.list,
    placeholderData: (previous) => previous,
  })

  // Authoritative unclassified count, shared with the Header chip. Driving the
  // Unclassified tab off this (instead of a client-side filter over the
  // current page) keeps the two consistent even if some matching email isn't
  // in the fetched page.
  const { data: unclassifiedRes } = useQuery<{ data: { count: number } }>({
    queryKey: ['emails', 'unclassified-count'],
    queryFn: () => fetch('/api/emails/unclassified-count').then((r) => r.json()),
    staleTime: 0,
  })

  const emails = useMemo(() => (res?.data || []) as EmailItem[], [res?.data])
  const meta = (res as QueryResponse<EmailItem[]>)?.meta

  // Discover unique email accounts
  const accounts = useMemo(() => {
    const set = new Set<string>()
    for (const e of emails) {
      if (e.accountEmail) set.add(e.accountEmail)
    }
    return Array.from(set)
  }, [emails])

  // Client-side filtering: tab -> account -> search
  const filtered = filterEmails({
    emails,
    tab,
    accountFilter,
    searchQuery,
    dateRange,
  })

  // Counts for tab badges
  const needsActionCount = emails.filter(isNeedsActionPageEmail).length
  const trackedCount = emails.filter(isTrackedEmail).length
  const infoCount = emails.filter(isFyiEmail).length
  const ignoredCount = emails.filter(isIgnoredEmail).length
  const unclassifiedCount = unclassifiedRes?.data?.count ?? 0
  const pendingCount = emails.filter((e) => e.processingStatus === 'pending').length

  const tabs: { key: Tab; label: string; count: number }[] = [
    // Unclassified leads when present — these are the emails the user needs
    // to act on most urgently (AI couldn't categorize them) and they don't
    // surface anywhere else in the inbox.
    ...(unclassifiedCount > 0 ? [{ key: 'unclassified' as Tab, label: 'Unclassified', count: unclassifiedCount }] : []),
    { key: 'needs_action', label: 'Needs Action', count: needsActionCount },
    { key: 'tracked', label: 'Tracked', count: trackedCount },
    { key: 'fyi', label: 'FYI', count: infoCount },
    { key: 'ignored', label: 'Ignored', count: ignoredCount },
  ]

  return (
    <div className="animate-in fade-in space-y-5 duration-200">
      <PageHeader
        title="Inbox"
        description="Review incoming emails, grouped by matter and linked tasks."
        meta={`${meta?.totalCount || 0} emails across ${accounts.length || 1} account${accounts.length !== 1 ? 's' : ''}`}
      />

      {unclassifiedCount > 0 && tab !== 'unclassified' && (
        <div className="animate-soft-enter flex items-start justify-between gap-3 rounded-xl border border-warning-100 bg-yellow-50/55 px-4 py-3 text-sm shadow-sm">
          <div className="min-w-0">
            <p className="font-medium text-warning-700">
              {unclassifiedCount} unclassified email{unclassifiedCount === 1 ? '' : 's'}
            </p>
            <p className="mt-0.5 text-xs text-warning">
              AI was either unsure or hit your free plan limit. Open any of them to classify manually, or upgrade to Pro.
            </p>
          </div>
          <Button
            size="sm"
            variant="warning"
            className="shrink-0"
            onClick={() => {
              clearSelection()
              setPage(1)
              updateEmailUrlFilter({ tab: 'unclassified' })
            }}
          >
            View
          </Button>
        </div>
      )}

      {!isLoading && tab === 'unclassified' && pendingCount > 0 && (
        <div className="animate-soft-enter flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/55 px-4 py-2.5 text-sm text-brand-700 shadow-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
          <span>
            <span className="font-medium">AI is classifying {pendingCount} email{pendingCount === 1 ? '' : 's'}...</span>
            {' '}Classified emails will move out of Unclassified automatically.
          </span>
        </div>
      )}

      {/* Tabs */}
      <div>
        <SegmentedControl
          value={tab}
          onChange={(nextTab) => {
            clearSelection()
            setPage(1)
            updateEmailUrlFilter({ tab: nextTab })
          }}
          options={tabs.map(({ key, label, count }) => ({
            value: key,
            label,
            badge: (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                tab === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {count}
              </span>
            ),
          }))}
        />
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-gray-200 bg-white pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date range picker */}
            <div className="inline-flex items-center gap-1">
              <Popover open={calendarOpen} onOpenChange={handleCalendarOpenChange}>
                <PopoverTrigger
                  className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs transition-all ${
                    dateRange?.from
                      ? 'border-brand-300 bg-brand-50 text-brand-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:bg-brand-50/70 hover:text-brand-700'
                  }`}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateRange?.from ? (
                    <span className="font-medium">
                      {format(dateRange.from, 'MMM d, yyyy')}
                      {dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
                        ? ` - ${format(dateRange.to, 'MMM d, yyyy')}`
                        : ''}
                    </span>
                  ) : (
                    <span>Date filter</span>
                  )}
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-auto overflow-hidden rounded-2xl border border-gray-200 p-0 shadow-lg"
                >
                  {/* Header: active date range display */}
                  <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 pb-2 pt-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectingStep('from')}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectingStep === 'from'
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                        }`}
                      >
                        {dateRange?.from ? format(dateRange.from, 'MMM d, yyyy') : 'Start date'}
                      </button>
                      <span className="text-sm text-gray-300">to</span>
                      <button
                        onClick={() => setSelectingStep('to')}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectingStep === 'to'
                            ? 'bg-brand-600 text-white shadow-sm'
                            : dateRange?.to
                              ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                              : 'bg-gray-50 text-gray-400'
                        }`}
                      >
                        {dateRange?.to ? format(dateRange.to, 'MMM d, yyyy') : 'End date'}
                      </button>
                    </div>
                    {dateRange?.from && (
                      <button
                        onClick={() => {
                          setDateRange(undefined)
                          setSelectingStep('from')
                        }}
                        className="ml-3 text-xs font-medium text-gray-400 transition-colors hover:text-critical"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <Calendar
                    captionLayout="dropdown"
                    modifiers={{
                      range_start: dateRange?.from,
                      range_end: dateRange?.to,
                      range_middle:
                        dateRange?.from && dateRange?.to &&
                        dateRange.from.getTime() !== dateRange.to.getTime()
                          ? { after: dateRange.from, before: dateRange.to }
                          : undefined,
                      selected:
                        dateRange?.from && !dateRange?.to
                          ? dateRange.from
                          : undefined,
                    }}
                    onDayClick={handleDayClick}
                    numberOfMonths={2}
                    disabled={{ after: new Date() }}
                    startMonth={new Date(2024, 0)}
                    endMonth={new Date()}
                  />
                  {/* Footer: only shown when from is selected but to is not yet */}
                  {dateRange?.from && !dateRange?.to && (
                    <div className="flex items-center justify-between border-t border-gray-100 bg-brand-50/40 px-4 py-2">
                      <p className="text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{format(dateRange.from, 'MMM d')}</span>
                        {' '}selected, now choose an end date
                      </p>
                      <button
                        onClick={() => setCalendarOpen(false)}
                        className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              {dateRange?.from && (
                <button
                  onClick={() => {
                    setDateRange(undefined)
                    setSelectingStep('from')
                  }}
                  className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  title="Clear date filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {accounts.length > 1 && (
              <SegmentedControl
                value={accountFilter}
                onChange={setAccountFilter}
                options={[
                  { value: 'all', label: 'All' },
                  ...accounts.map((acc) => ({
                    value: acc,
                    label: acc.split('@')[1] || acc,
                  })),
                ]}
              />
            )}

            {/* Review mode toggle */}
            <div className="group/review-toggle relative">
              <button
                onClick={handleReviewModeToggle}
                disabled={reviewModeMutation.isPending}
                title={
                  manualReviewMode
                    ? 'Manual Review is on. Switching to Auto will process Unclassified emails.'
                    : 'Auto is on. Click to switch new action emails into Manual Review.'
                }
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                  manualReviewMode
                    ? 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100'
                    : 'border-brand-200 bg-white text-brand-600 hover:border-brand-300 hover:bg-brand-50'
                }`}
              >
                {reviewModeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                {manualReviewMode ? 'Manual Review' : 'Auto'}
              </button>
              <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 translate-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600 opacity-0 shadow-lg transition-all duration-150 group-hover/review-toggle:translate-y-0 group-hover/review-toggle:opacity-100">
                {manualReviewMode
                  ? 'Manual Review is on. Switching to Auto will create tasks from emails waiting for review.'
                  : 'Auto is on. Click to send future action emails to Manual Review before tasks are created.'}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Sync batch banner */}
      {!isLoading && batchBannerActive && (() => {
        if (!batchStatus || !batchStatus.isComplete) {
          // Classification in progress
          const count = batchStatus?.totalEmails ?? pendingCount
          return (
            <div className="animate-soft-enter flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/55 px-4 py-2.5 text-sm text-brand-700 shadow-sm">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
              <span>
                {count > 0
                  ? <><span className="font-medium">{count} email{count === 1 ? '' : 's'}</span>{' '}being classified — tags appear once AI finishes.</>
                  : <>Classifying emails — tags appear once AI finishes.</>}
              </span>
            </div>
          )
        }
        if (batchStatus.actionEmailCount > 0) {
          return (
            <div className="animate-soft-enter flex items-center justify-between gap-3 rounded-xl border border-warning-100 bg-yellow-50/55 px-4 py-3 shadow-sm">
              <button
                onClick={() => setShowBatchModal(true)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-100/85 text-warning-700 ring-1 ring-warning-200">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-warning-700">
                    {batchStatus.actionEmailCount} action email{batchStatus.actionEmailCount === 1 ? '' : 's'} found in this sync
                  </p>
                  <p className="text-xs text-warning-700">Tap to review — see what needs your attention.</p>
                </div>
              </button>
              <button
                onClick={() => setShowBatchModal(true)}
                className="shrink-0 rounded-lg border border-warning-200 bg-yellow-50/80 px-3 py-1.5 text-xs font-semibold text-warning-700 shadow-sm transition-all hover:-translate-y-px hover:bg-warning-100/70 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/20"
              >
                Review
              </button>
              <button
                onClick={dismissBatchBanner}
                className="shrink-0 rounded-full p-1.5 text-warning transition-colors hover:bg-warning-100 hover:text-warning-700"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        }
        return null
      })()}

      {/* Fallback processing banner — shown when no active batch but pending emails exist */}
      {!isLoading && tab !== 'unclassified' && !batchBannerActive && pendingCount > 0 && (
        <div className="animate-soft-enter flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/55 px-4 py-2.5 text-sm text-brand-700 shadow-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
          <span>
            <span className="font-medium">{pendingCount} email{pendingCount === 1 ? '' : 's'}</span>
            {' '}being classified in Unclassified.
          </span>
        </div>
      )}

      {/* Unclassified banner - clicking switches to Needs Action tab where
          the user can triage with the same batch UI (Generate Tasks / Ignore /
          Change Project). The dedicated review modal was removed; the tab is
          now the single source of truth. */}
      {!isLoading && manualReviewMode && pendingReviewCount > 0 && !reviewBannerDismissed && (
        <div className="animate-soft-enter flex w-full items-center gap-3 rounded-xl border border-warning-100 bg-yellow-50/55 px-4 py-3 shadow-sm">
          <button
            onClick={() => {
              ackCurrentReviewBatch()
              if (tab !== 'needs_action') {
                clearSelection()
                setPage(1)
                updateEmailUrlFilter({ tab: 'needs_action' })
              }
            }}
            className="flex flex-1 items-center gap-3 text-left transition-colors hover:opacity-85"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-100/85 text-warning-700 ring-1 ring-warning-200">
              <Eye className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-warning-700">
                {pendingReviewCount} email{pendingReviewCount === 1 ? '' : 's'} ready for action review
              </p>
              <p className="text-xs text-warning-700">Tap to triage — generate tasks or ignore in bulk.</p>
            </div>
          </button>
          <button
            onClick={() => {
              ackCurrentReviewBatch()
              if (tab !== 'needs_action') {
                clearSelection()
                setPage(1)
                updateEmailUrlFilter({ tab: 'needs_action' })
              }
            }}
            className="shrink-0 rounded-lg border border-warning-200 bg-yellow-50/80 px-3 py-1.5 text-xs font-semibold text-warning-700 shadow-sm transition-all hover:-translate-y-px hover:bg-warning-100/70 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/20"
          >
            Review
          </button>
          <button
            onClick={ackCurrentReviewBatch}
            className="shrink-0 rounded-full p-1.5 text-warning transition-colors hover:bg-warning-100 hover:text-warning-700"
            title="Hide for this sync"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Batch action bar */}
      {selectedIds.size > 0 && (() => {
        // Generate Tasks operates on Needs Action and Unclassified emails.
        // Disable the button when none of the selected items qualify so the user
        // doesn't fire a request that's a 100% no-op.
        const selectedEmails = filtered.filter((e) => selectedIds.has(e.id))
        const eligibleForGenerate = selectedEmails.filter(canGenerateTaskFromEmail).length
        const generating = bulkGenerateTasksMutation.isPending
        const ignoring = bulkIgnoreMutation.isPending
        const classifying = bulkClassifyMutation.isPending
        const ids = [...selectedIds]
        const busy = generating || ignoring || classifying
        return (
          <div className="animate-soft-enter flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/75 px-4 py-2.5 shadow-sm">
            <span className="text-sm font-medium text-brand-700">{selectedIds.size} selected</span>
            {selectedIds.size < filtered.length && (
              <button onClick={selectAll} className="text-xs text-brand-500 hover:text-brand-700 hover:underline">
                Select all {filtered.length}
              </button>
            )}
            <div className="flex-1" />
            <Button
              size="sm"
              variant="warning"
              className="h-7 gap-1 text-xs"
              disabled={eligibleForGenerate === 0 || busy}
              onClick={() => bulkGenerateTasksMutation.mutate(ids)}
              title={eligibleForGenerate === 0 ? 'No Needs Action emails selected' : `Extract tasks from ${eligibleForGenerate} email${eligibleForGenerate === 1 ? '' : 's'}`}
            >
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Generate Tasks{eligibleForGenerate > 0 && eligibleForGenerate < selectedIds.size ? ` (${eligibleForGenerate})` : ''}
            </Button>
            <Button
              size="sm"
              variant="utility"
              className="h-7 gap-1 text-xs"
              disabled={busy}
              onClick={() => bulkIgnoreMutation.mutate(ids)}
            >
              {ignoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
              Ignore
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={busy}
                className="group/trigger inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 shadow-sm transition-all hover:-translate-y-px hover:border-brand-200 hover:bg-brand-50/70 hover:text-brand-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 aria-expanded:border-brand-300 aria-expanded:bg-brand-50 aria-expanded:text-brand-700 disabled:pointer-events-none disabled:opacity-50"
              >
                {classifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Tag className="h-3 w-3" />}
                Mark as
                <ChevronDown className="h-3 w-3 transition-transform duration-150 group-aria-expanded/trigger:rotate-180" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {(Object.keys(EMAIL_BUCKET_LABELS) as EmailBucket[]).map((bucket) => (
                  <DropdownMenuItem
                    key={bucket}
                    onClick={() => bulkClassifyMutation.mutate({ ids, bucket })}
                    className="cursor-pointer"
                  >
                    {EMAIL_BUCKET_LABELS[bucket]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant="utility"
              className="h-7 gap-1 text-xs"
              disabled={busy}
              onClick={() => setShowBatchReassign(true)}
            >
              <FolderOpen className="h-3 w-3" /> Change Project
            </Button>
            <button onClick={clearSelection} className="ml-1 rounded p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })()}

      {/* Reassign Project Modal */}
      <ReassignProjectModal
        open={!!reassignEmail}
        onOpenChange={(open) => { if (!open) setReassignEmail(null) }}
        threadId={reassignEmail?.threadId ?? undefined}
        currentProject={reassignEmail?.project}
        invalidateKeys={[['emails']]}
      />

      {/* Batch Reassign Modal */}
      <BatchReassignModal
        open={showBatchReassign}
        onOpenChange={setShowBatchReassign}
        ids={[...selectedIds]}
        batchApiEndpoint="/api/emails/batch"
        entityLabel="email"
        onSuccess={clearSelection}
      />

      {/* Sync batch modal */}
      {showBatchModal && batchStatus && (
        <SyncBatchModal
          batchStatus={batchStatus}
          onClose={() => setShowBatchModal(false)}
        />
      )}

      <Dialog open={showAutoModeConfirm} onOpenChange={setShowAutoModeConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Switch to Auto mode?</DialogTitle>
            <DialogDescription>
              Auto mode will process emails currently waiting for manual review and create tasks for action emails without asking you first. Future action emails will also be handled automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-warning-200 bg-warning-100/60 px-3 py-2 text-sm text-warning-700">
            This may create tasks from Unclassified emails in the background.
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAutoModeConfirm(false)}
              disabled={reviewModeMutation.isPending}
            >
              Keep Manual Review
            </Button>
            <Button
              onClick={() => reviewModeMutation.mutate(false)}
              disabled={reviewModeMutation.isPending}
              className="gap-2"
            >
              {reviewModeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Switch to Auto
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Content */}
      {isLoading ? (
        <StatePanel
          loading
          title="Loading emails"
          description="Gathering the latest messages and matter groupings."
        />
      ) : filtered.length === 0 ? (
        <StatePanel
          icon={<Mail className="h-5 w-5 text-gray-400" />}
          title={searchQuery ? 'No emails match your search' : 'No emails in this view'}
          description={searchQuery ? 'Try adjusting your keywords or filters.' : 'Change the current filters to see more mail.'}
        />
      ) : (
        <EmailMatterView
          key={`${tab}-${page}-${accountFilter}-${searchQuery}`}
          emails={filtered}
          focusIdentityId={focusIdentityId}
          onReassign={setReassignEmail}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onBulkToggle={bulkToggle}
        />
      )}

      {/* Pagination */}
      {meta && (meta.totalPages ?? 0) > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-500">Page {meta.page} of {meta.totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= (meta.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

/* ========== SYNC BATCH MODAL ========== */

function SyncBatchModal({
  batchStatus,
  onClose,
}: {
  batchStatus: BatchStatus
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-warning" />
            {batchStatus.actionEmailCount} Action Email{batchStatus.actionEmailCount === 1 ? '' : 's'} — Last Sync
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500">
          These emails were classified as <span className="font-medium text-gray-700">Action</span> during the latest sync.
          Emails with a linked task were handled automatically.
        </p>

        <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {batchStatus.actionEmails.map((email) => {
            const linkedTasks = email.taskLinks
              .map((l) => l.task)
              .filter((t): t is { id: string; title: string } => t != null)

            return (
              <Link
                key={email.id}
                href={`/dashboard/emails/${email.id}`}
                onClick={onClose}
                className="flex items-start gap-3 rounded-xl border border-gray-200/80 bg-white px-4 py-3 text-left transition-all hover:border-brand-200 hover:bg-brand-50/60 hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {email.subject || '(no subject)'}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-xs text-gray-500">
                      {email.sender?.split('<')[0]?.trim() || email.sender}
                    </p>
                    <span className="text-[10px] text-gray-300">&middot;</span>
                    <p className="shrink-0 text-xs text-gray-400">
                      {formatDate(email.receivedAt)}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  {linkedTasks.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                      <CheckSquare className="h-2.5 w-2.5" />
                      Task created
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md border border-warning-200 bg-warning-100/60 px-2 py-0.5 text-[10px] font-medium text-warning-700">
                      No task yet
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ========== 2-level collapsible: identity -> project ========== */

type EmailProjectGroup = { id: string; name: string; items: EmailItem[] }
type EmailIdentityGroup = { id: string; name: string; projects: EmailProjectGroup[] }

function EmailMatterView({ emails, focusIdentityId, onReassign, selectedIds, onToggleSelect, onBulkToggle }: {
  emails: EmailItem[]
  focusIdentityId?: string
  onReassign: (email: EmailItem) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onBulkToggle: (ids: string[], select: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [collapsedIdentities, setCollapsedIdentities] = useState<Set<string>>(new Set())
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [userHasToggled, setUserHasToggled] = useState(false)

  const renameProject = async (projectId: string, name: string) => {
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const renameIdentity = async (identityId: string, name: string) => {
    await fetch(`/api/identities/${identityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    queryClient.invalidateQueries({ queryKey: ['emails'] })
    queryClient.invalidateQueries({ queryKey: ['identities'] })
  }

  const toggleIdentity = (id: string) => {
    setUserHasToggled(true)
    setCollapsedIdentities((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleProject = (id: string) => {
    setUserHasToggled(true)
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { identityGroups, ungrouped } = useMemo(() => {
    const ungrouped: EmailItem[] = []
    const identityMap = new Map<string, { name: string; projectMap: Map<string, { name: string; items: EmailItem[] }> }>()

    for (const email of emails) {
      if (!email.project) { ungrouped.push(email); continue }
      const iId = email.project.identity?.id || '__unassigned__'
      const iName = email.project.identity?.name || 'Unassigned'
      const pId = email.project.id
      const pName = email.project.name
      if (!identityMap.has(iId)) identityMap.set(iId, { name: iName, projectMap: new Map() })
      const identity = identityMap.get(iId)!
      if (!identity.projectMap.has(pId)) identity.projectMap.set(pId, { name: pName, items: [] })
      identity.projectMap.get(pId)!.items.push(email)
    }

    const latestTime = (items: EmailItem[]) =>
      Math.max(...items.map((e) => new Date(e.receivedAt).getTime()))

    const identityGroups: EmailIdentityGroup[] = Array.from(identityMap.entries())
      .map(([id, { name, projectMap }]) => {
        const projects = Array.from(projectMap.entries())
          .map(([pid, { name, items }]) => ({ id: pid, name, items }))
          .sort((a, b) => latestTime(b.items) - latestTime(a.items))
        return { id, name, projects }
      })
      .sort((a, b) => latestTime(b.projects.flatMap((p) => p.items)) - latestTime(a.projects.flatMap((p) => p.items)))

    return { identityGroups, ungrouped }
  }, [emails])

  if (emails.length === 0) {
    return (
      <StatePanel
        icon={<Mail className="h-5 w-5 text-gray-400" />}
        title="No emails in this view"
        description="Change the current filters to see more mail."
      />
    )
  }

  const attentionCount = (list: EmailItem[]) => list.filter(isNeedsActionPageEmail).length

  const ungroupedIds = ungrouped.map((e) => e.id)
  const allUngroupedSel = ungroupedIds.length > 0 && ungroupedIds.every((id) => selectedIds.has(id))
  const someUngroupedSel = ungroupedIds.some((id) => selectedIds.has(id))

  return (
    <div className="space-y-2">
      {identityGroups.map((identity) => {
        const isIdentityCollapsed = !userHasToggled && focusIdentityId
          ? identity.id !== focusIdentityId
          : collapsedIdentities.has(identity.id)
        const totalCount = identity.projects.reduce((s, p) => s + p.items.length, 0)
        const totalAttention = identity.projects.reduce((s, p) => s + attentionCount(p.items), 0)
        const identityEmailIds = identity.projects.flatMap((p) => p.items.map((e) => e.id))
        const allIdentitySel = identityEmailIds.length > 0 && identityEmailIds.every((id) => selectedIds.has(id))
        const someIdentitySel = identityEmailIds.some((id) => selectedIds.has(id))
        return (
          <div key={identity.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            {/* Identity row */}
            <div className="group flex w-full items-center gap-2.5 px-4 py-3 transition-colors hover:bg-slate-50">
              <input
                type="checkbox"
                checked={allIdentitySel}
                ref={(el) => { if (el) el.indeterminate = someIdentitySel && !allIdentitySel }}
                onChange={() => onBulkToggle(identityEmailIds, !allIdentitySel)}
                onClick={(e) => e.stopPropagation()}
                className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${allIdentitySel || someIdentitySel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              />
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleIdentity(identity.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleIdentity(identity.id)
                  }
                }}
                className="flex flex-1 cursor-pointer items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${isIdentityCollapsed ? '-rotate-90' : ''}`} />
                <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {identity.id === '__unassigned__'
                  ? <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{identity.name}</span>
                  : <InlineEditableName name={identity.name} className="text-xs font-semibold uppercase tracking-widest text-slate-500" onSave={(n) => renameIdentity(identity.id, n)} />
                }
                {totalAttention > 0 && (
                  <span className="rounded-full bg-critical-50 px-2 py-0.5 text-[10px] font-semibold text-critical ring-1 ring-critical-100">
                    {totalAttention} need action
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">{totalCount} email{totalCount !== 1 ? 's' : ''} shown</span>
              </div>
            </div>

            {!isIdentityCollapsed && (
              <div className="animate-soft-enter divide-y divide-slate-100 border-t border-slate-100">
                {identity.projects.map((project) => {
                  const isProjectCollapsed = collapsedProjects.has(project.id)
                  const projectAttention = attentionCount(project.items)
                  const projectEmailIds = project.items.map((e) => e.id)
                  const allProjectSel = projectEmailIds.length > 0 && projectEmailIds.every((id) => selectedIds.has(id))
                  const someProjectSel = projectEmailIds.some((id) => selectedIds.has(id))
                  return (
                    <div key={project.id}>
                      {/* Project row */}
                      <div className="group flex w-full items-center gap-2.5 px-5 py-2.5 transition-colors hover:bg-slate-50/70">
                        <input
                          type="checkbox"
                          checked={allProjectSel}
                          ref={(el) => { if (el) el.indeterminate = someProjectSel && !allProjectSel }}
                          onChange={() => onBulkToggle(projectEmailIds, !allProjectSel)}
                          onClick={(e) => e.stopPropagation()}
                          className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${allProjectSel || someProjectSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        />
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleProject(project.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleProject(project.id)
                            }
                          }}
                          className="flex flex-1 cursor-pointer items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-150 ${isProjectCollapsed ? '-rotate-90' : ''}`} />
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <InlineEditableName name={project.name} className="text-sm font-medium text-slate-700" onSave={(n) => renameProject(project.id, n)} />
                          {projectAttention > 0 && (
                            <span className="rounded-full bg-critical-50 px-1.5 py-0.5 text-[10px] font-semibold text-critical">
                              {projectAttention}
                            </span>
                          )}
                          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{project.items.length} shown</span>
                        </div>
                      </div>

                      {!isProjectCollapsed && (
                        <div className="animate-soft-enter space-y-1.5 px-4 pb-3 pt-1">
                          {project.items.map((email) => (
                            <EmailRow key={email.id} email={email} onReassign={onReassign} isSelected={selectedIds.has(email.id)} onToggleSelect={onToggleSelect} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {ungrouped.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="group flex items-center gap-2.5 px-4 py-3">
            <input
              type="checkbox"
              checked={allUngroupedSel}
              ref={(el) => { if (el) el.indeterminate = someUngroupedSel && !allUngroupedSel }}
              onChange={() => onBulkToggle(ungroupedIds, !allUngroupedSel)}
              className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${allUngroupedSel || someUngroupedSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            />
            <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Uncategorized</span>
            <span className="ml-auto text-xs text-slate-400">{ungrouped.length} email{ungrouped.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1.5 border-t border-slate-100 px-4 pb-3 pt-2">
            {ungrouped.map((email) => (
              <EmailRow key={email.id} email={email} onReassign={onReassign} isSelected={selectedIds.has(email.id)} onToggleSelect={onToggleSelect} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


/* ========== EMAIL ROW - shows linked tasks as badges ========== */
function EmailRow({ email, compact, onReassign, isSelected, onToggleSelect }: {
  email: EmailItem
  compact?: boolean
  onReassign?: (email: EmailItem) => void
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const matter = email.matter ?? null
  const linkedTasks = email.taskLinks?.map((link) => link.task).filter((t): t is LinkedTask => t != null) || []
  const linkedTaskState = isTrackedEmail(email) ? getEmailLinkedTaskState(email.taskLinks) : null
  const isCompletedTrackedEmail = linkedTaskState === 'completed'
  // Left accent bar mirrors the bucket: red for action emails the user must
  // triage, amber for uncertain emails AI couldn't classify. Tracked / FYI /
  // ignored stay quiet (no bar) so the eye is drawn to the rows that matter.
  const attentionBar = isNeedsActionPageEmail(email)
    ? 'border-l-2 border-l-critical'
    : isUncertainEmail(email)
      ? 'border-l-2 border-l-warning'
      : ''

  return (
    <div className={`group flex items-center gap-3 rounded-xl border px-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:shadow-sm ${
      isSelected
        ? 'border-brand-300 bg-brand-50/50'
        : isCompletedTrackedEmail
          ? 'border-slate-100 bg-slate-50/55 hover:border-slate-200 hover:bg-slate-50/80'
          : `border-gray-200/80 bg-white hover:border-brand-200 hover:bg-brand-50/60 ${attentionBar}`
    } ${compact ? 'py-2 opacity-75' : 'py-3'}`}>
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => { e.stopPropagation(); onToggleSelect(email.id) }}
          onClick={(e) => e.stopPropagation()}
          className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-brand-600 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        />
      )}
      <Link
        href={`/dashboard/emails/${email.id}`}
        className="flex items-center gap-3 min-w-0 flex-1"
      >
        <ClassBadge
          classification={email.classification}
          actioned={email.actioned}
          processingStatus={email.processingStatus}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`truncate font-medium ${isCompletedTrackedEmail ? 'text-slate-500' : 'text-gray-900'} ${compact ? 'text-xs' : 'text-sm'}`}>{email.subject}</p>
            {email.hasAttachments && <Paperclip className="h-3 w-3 flex-shrink-0 text-gray-400" />}
            {isCompletedTrackedEmail && <CompleteBadge />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className={`truncate text-xs ${isCompletedTrackedEmail ? 'text-slate-400' : 'text-gray-500'}`}>{email.sender?.split('<')[0]?.trim()}</p>
            {email.accountEmail && <AccountBadge account={email.accountEmail} />}
            {matter ? (
              <>
                <span className="text-[10px] text-gray-300">&middot;</span>
                <span className={`truncate text-[11px] ${isCompletedTrackedEmail ? 'text-slate-300' : 'text-gray-400'}`}>{matter.title}</span>
              </>
            ) : null}
          </div>
        </div>
        <span className={`flex-shrink-0 text-xs ${isCompletedTrackedEmail ? 'text-slate-300' : 'text-gray-400'}`}>{formatDate(email.receivedAt)}</span>
      </Link>

      {/* Retention status badge */}
      <RetentionBadge status={email.retentionStatus} />

      {/* Linked task badges */}
      {linkedTasks.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          {linkedTasks.map((task) => (
            <Link
              key={task.id}
              href={`/dashboard/tasks/${task.id}`}
              onClick={(e) => e.stopPropagation()}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors max-w-[140px] ${
                task.status === 'completed'
                  ? 'border-success-100 bg-success-50/70 text-success hover:bg-success-100/70'
                  : 'border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100'
              }`}
              title={task.title}
            >
              {task.status === 'completed'
                ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                : <CheckSquare className="h-2.5 w-2.5 shrink-0" />}
              <span className="truncate">{task.title}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Change project button (hover) */}
      {onReassign && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReassign(email) }}
          title="Change project"
          className="hidden group-hover:flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600 transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function CompleteBadge() {
  return (
    <Badge variant="outline" className="shrink-0 gap-1 border-success-100 bg-success-50/70 py-0 text-[10px] text-success">
      <CheckCircle2 className="h-3 w-3" />
      Complete
    </Badge>
  )
}

function RetentionBadge({ status }: { status?: string | null }) {
  if (!status || status === 'ACTIVE') return null
  const cfg = {
    ARCHIVED:      { label: 'Archived',  className: 'border-gray-200 bg-gray-50 text-gray-500' },
    METADATA_ONLY: { label: 'Body only', className: 'border-warning-200 bg-warning-100/60 text-warning-700' },
    PURGED:        { label: 'Purged',    className: 'border-critical-100 bg-critical-50 text-critical' },
  }[status] ?? null
  if (!cfg) return null
  return (
    <Badge variant="outline" className={`shrink-0 text-[10px] py-0 ${cfg.className}`}>
      {cfg.label}
    </Badge>
  )
}

/* ========== SHARED COMPONENTS ========== */
function ClassBadge({
  classification,
  actioned,
  processingStatus,
}: {
  classification?: string | null
  actioned?: boolean | null
  processingStatus?: string | null
}) {
  if (!classification && processingStatus === 'pending') {
    return (
      <Badge variant="outline" className="w-[104px] justify-center gap-1 text-[10px] bg-gray-50 text-gray-400 border-gray-200">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </Badge>
    )
  }
  // Only the two "attention" buckets earn a chip — Needs Action (red) and
  // Unclassified. Tracked / FYI / Ignored rows stay clean: title aligns
  // straight after the checkbox with no phantom spacer column.
  const state = getEmailDisplayState({ classification, actioned })
  if (state !== 'needs_action' && state !== 'unclassified') {
    return null
  }
  const cfg = EMAIL_DISPLAY_CONFIG[state]
  const Icon = cfg.icon
  return (
    <Badge variant="outline" className={`w-[104px] justify-center gap-1 text-[10px] ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  )
}

function AccountBadge({ account }: { account: string }) {
  const domain = account.split('@')[1] || account
  const isWork = !['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com'].includes(domain)

  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
      isWork ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
    }`}>
      <Mail className="h-2.5 w-2.5" />
      {domain}
    </span>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)

  if (days === 0) {
    return d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })
  } else if (days === 1) {
    return 'Yesterday'
  } else if (days < 7) {
    return d.toLocaleDateString('en', { weekday: 'short' })
  }
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

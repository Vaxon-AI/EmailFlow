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
  CheckSquare, Paperclip, Mail,
  Search, CalendarIcon, X, ChevronDown, UserRound, FolderOpen, Loader2, Zap, Eye,
} from 'lucide-react'
import { Suspense, useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { getEmailClassConfig } from '@/lib/email-classification'
import { ReassignProjectModal } from '@/components/reassign-project-modal'
import { BatchReassignModal } from '@/components/batch-reassign-modal'
import { InlineEditableName } from '@/components/inline-editable-name'
import { EmailReviewModal } from '@/components/email-review-modal'
import { useAuth } from '@/lib/use-auth'
import { CACHE_TIME } from '@/lib/query-cache'

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
  actionEmailCount: number
  actionEmails: BatchActionEmail[]
}

type Tab = 'needs_action' | 'fyi' | 'uncertain' | 'all'
type EmailClassification = 'action' | 'awareness' | 'ignore' | 'uncertain'

type LinkedTask = {
  id: string
  title: string
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
  ignore: 1,
}

type FilterEmailsOptions = {
  emails: EmailItem[]
  tab: Tab
  classification: string
  accountFilter: string
  searchQuery: string
  dateRange?: DateRange
}

function filterEmails({
  emails,
  tab,
  classification,
  accountFilter,
  searchQuery,
  dateRange,
}: FilterEmailsOptions) {
  let result = emails

  if (tab === 'needs_action') {
    result = result.filter((email) =>
      email.classification === 'action' || (email.taskLinks?.length ?? 0) > 0
    )
  } else if (tab === 'fyi') {
    result = result.filter((email) => email.classification === 'awareness')
  } else if (tab === 'uncertain') {
    result = result.filter((email) => email.classification === 'uncertain')
  }

  if (classification !== 'all') {
    result = result.filter((email) => email.classification === classification)
  }

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

export default function EmailsPage() {
  return (
    <Suspense fallback={null}>
      <EmailsContent />
    </Suspense>
  )
}

function EmailsContent() {
  const searchParams = useSearchParams()
  const focusIdentityId = searchParams.get('identity') ?? undefined
  const [tab, setTab] = useState<Tab>('needs_action')
  const [classification, setClassification] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [selectingStep, setSelectingStep] = useState<'from' | 'to'>('from')
  const [page, setPage] = useState(1)
  const [reassignEmail, setReassignEmail] = useState<EmailItem | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchReassign, setShowBatchReassign] = useState(false)

  // Manual review mode
  const { user } = useAuth()
  const manualReviewMode = (user as (typeof user & { manualReviewMode?: boolean }) | null)?.manualReviewMode ?? true
  const queryClient = useQueryClient()
  const [reviewBannerDismissed, setReviewBannerDismissed] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showAutoModeConfirm, setShowAutoModeConfirm] = useState(false)

  const { data: pendingReviewData } = useQuery({
    queryKey: ['pending-review-count'],
    queryFn: async () => {
      const r = await fetch('/api/emails/pending-review')
      const d = await r.json()
      return d.count as number
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
      setReviewBannerDismissed(false)
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

  const bulkToggle = useCallback((ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (select) ids.forEach((id) => next.add(id))
      else ids.forEach((id) => next.delete(id))
      return next
    })
  }, [])

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
    queryKey: ['emails', page],
    queryFn: () =>
      fetch(`/api/emails?page=${page}&limit=50`).then((r) => r.json()),
    staleTime: CACHE_TIME.list,
    placeholderData: (previous) => previous,
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

  // Client-side filtering: tab -> classification -> account -> search
  const filtered = filterEmails({
    emails,
    tab,
    classification,
    accountFilter,
    searchQuery,
    dateRange,
  })

  // Kept for rollback; no longer used directly in render.
  // const { needsAttention, hasTaskEmails } = useMemo(() => { ... }, [filtered, tab])

  // Counts for tab badges
  const needsActionCount = emails.filter((e) =>
    e.classification === 'action' || (e.taskLinks?.length ?? 0) > 0
  ).length
  const infoCount = emails.filter((e) => e.classification === 'awareness').length
  const uncertainCount = emails.filter((e) => e.classification === 'uncertain').length
  const pendingCount = emails.filter((e) => e.processingStatus === 'pending').length

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'needs_action', label: 'Needs Action', count: needsActionCount },
    { key: 'fyi', label: 'FYI', count: infoCount },
    { key: 'uncertain', label: 'Uncertain', count: uncertainCount },
    { key: 'all', label: 'All Mail', count: emails.length },
  ]

  return (
    <div className="animate-in fade-in space-y-5 duration-200">
      <PageHeader
        title="Inbox"
        description="Review incoming emails, grouped by matter and linked tasks."
        meta={`${meta?.totalCount || 0} emails across ${accounts.length || 1} account${accounts.length !== 1 ? 's' : ''}`}
      />

      {/* Tabs */}
      <div>
        <SegmentedControl
          value={tab}
          onChange={(nextTab) => {
            setTab(nextTab)
            setClassification('all')
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
                      ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-700'
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
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        {dateRange?.from ? format(dateRange.from, 'MMM d, yyyy') : 'Start date'}
                      </button>
                      <span className="text-sm text-gray-300">to</span>
                      <button
                        onClick={() => setSelectingStep('to')}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectingStep === 'to'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : dateRange?.to
                              ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
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
                        className="ml-3 text-xs font-medium text-gray-400 transition-colors hover:text-red-500"
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
                    <div className="flex items-center justify-between border-t border-gray-100 bg-blue-50/40 px-4 py-2">
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

            {/* Classification filter — only meaningful on All Mail tab */}
            {tab === 'all' && (
              <SegmentedControl
                value={classification}
                onChange={setClassification}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'action', label: 'Needs Action' },
                  { value: 'awareness', label: 'FYI' },
                  { value: 'ignore', label: 'Ignored' },
                  { value: 'uncertain', label: 'Uncertain' },
                ]}
              />
            )}

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
                    ? 'Manual Review is on. Switching to Auto will process pending review emails.'
                    : 'Auto is on. Click to switch new action emails into Manual Review.'
                }
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                  manualReviewMode
                    ? 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {reviewModeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                {manualReviewMode ? 'Manual Review' : 'Auto'}
              </button>
              <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600 shadow-lg group-hover/review-toggle:block">
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
            <div className="flex items-center gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
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
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
              <button
                onClick={() => setShowBatchModal(true)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <Zap className="h-4 w-4 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    {batchStatus.actionEmailCount} action email{batchStatus.actionEmailCount === 1 ? '' : 's'} found in this sync
                  </p>
                  <p className="text-xs text-amber-700">Tap to review — see what needs your attention.</p>
                </div>
              </button>
              <button
                onClick={dismissBatchBanner}
                className="shrink-0 rounded-full p-1.5 text-amber-500 transition-colors hover:bg-amber-100 hover:text-amber-700"
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
      {!isLoading && !batchBannerActive && pendingCount > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
          <span>
            <span className="font-medium">{pendingCount} email{pendingCount === 1 ? '' : 's'}</span>
            {' '}being classified — visible now in All Mail, tags appear once AI finishes.
          </span>
        </div>
      )}

      {/* Pending review banner */}
      {!isLoading && manualReviewMode && pendingReviewCount > 0 && !reviewBannerDismissed && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <button
            onClick={() => setShowReviewModal(true)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <Eye className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {pendingReviewCount} email{pendingReviewCount === 1 ? '' : 's'} pending your review
              </p>
              <p className="text-xs text-amber-700">Tap to review — choose which emails should generate tasks.</p>
            </div>
          </button>
          <button
            onClick={() => setReviewBannerDismissed(true)}
            className="shrink-0 rounded-full p-1.5 text-amber-500 transition-colors hover:bg-amber-100 hover:text-amber-700"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Review modal */}
      <EmailReviewModal
        open={showReviewModal}
        onClose={() => {
          setShowReviewModal(false)
          setReviewBannerDismissed(true)
        }}
      />

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-blue-700">{selectedIds.size} selected</span>
          {selectedIds.size < filtered.length && (
            <button onClick={selectAll} className="text-xs text-blue-500 hover:text-blue-700 hover:underline">
              Select all {filtered.length}
            </button>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setShowBatchReassign(true)}>
            <FolderOpen className="h-3 w-3" /> Change Project
          </Button>
          <button onClick={clearSelection} className="ml-1 rounded p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This may create tasks from pending review emails in the background.
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
            <Zap className="h-4 w-4 text-amber-500" />
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
                className="flex items-start gap-3 rounded-xl border border-gray-200/80 bg-white px-4 py-3 text-left transition-all hover:border-blue-200 hover:bg-blue-50/60 hover:shadow-sm"
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
                    <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                      <CheckSquare className="h-2.5 w-2.5" />
                      Task created
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
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

  const attentionCount = (list: EmailItem[]) =>
    list.filter(
      (e) => (e.classification === 'action' || e.classification === 'uncertain') && !(e.taskLinks?.length ?? 0)
    ).length

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
                className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-blue-600 transition-opacity ${allIdentitySel || someIdentitySel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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
                className="flex flex-1 cursor-pointer items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${isIdentityCollapsed ? '-rotate-90' : ''}`} />
                <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {identity.id === '__unassigned__'
                  ? <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{identity.name}</span>
                  : <InlineEditableName name={identity.name} className="text-xs font-semibold uppercase tracking-widest text-slate-500" onSave={(n) => renameIdentity(identity.id, n)} />
                }
                {totalAttention > 0 && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-red-100">
                    {totalAttention} need action
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">{totalCount} email{totalCount !== 1 ? 's' : ''} shown</span>
              </div>
            </div>

            {!isIdentityCollapsed && (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
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
                          className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-blue-600 transition-opacity ${allProjectSel || someProjectSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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
                          className="flex flex-1 cursor-pointer items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-150 ${isProjectCollapsed ? '-rotate-90' : ''}`} />
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <InlineEditableName name={project.name} className="text-sm font-medium text-slate-700" onSave={(n) => renameProject(project.id, n)} />
                          {projectAttention > 0 && (
                            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                              {projectAttention}
                            </span>
                          )}
                          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{project.items.length} shown</span>
                        </div>
                      </div>

                      {!isProjectCollapsed && (
                        <div className="space-y-1.5 px-4 pb-3 pt-1">
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
              className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-blue-600 transition-opacity ${allUngroupedSel || someUngroupedSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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
  const needsAttention =
    (email.classification === 'action' || email.classification === 'uncertain') &&
    linkedTasks.length === 0

  return (
    <div className={`group flex items-center gap-3 rounded-xl border px-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:shadow-sm ${
      isSelected
        ? 'border-blue-300 bg-blue-50/50'
        : `border-gray-200/80 bg-white hover:border-blue-200 hover:bg-blue-50/60 ${needsAttention ? 'border-l-2 border-l-red-400' : ''}`
    } ${compact ? 'py-2 opacity-75' : 'py-3'}`}>
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => { e.stopPropagation(); onToggleSelect(email.id) }}
          onClick={(e) => e.stopPropagation()}
          className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-blue-600 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        />
      )}
      <Link
        href={`/dashboard/emails/${email.id}`}
        className="flex items-center gap-3 min-w-0 flex-1"
      >
        <ClassBadge classification={email.classification} processingStatus={email.processingStatus} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`truncate font-medium text-gray-900 ${compact ? 'text-xs' : 'text-sm'}`}>{email.subject}</p>
            {email.hasAttachments && <Paperclip className="h-3 w-3 flex-shrink-0 text-gray-400" />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="truncate text-xs text-gray-500">{email.sender?.split('<')[0]?.trim()}</p>
            {email.accountEmail && <AccountBadge account={email.accountEmail} />}
            {matter ? (
              <>
                <span className="text-[10px] text-gray-300">&middot;</span>
                <span className="truncate text-[11px] text-gray-400">{matter.title}</span>
              </>
            ) : null}
          </div>
        </div>
        <span className="flex-shrink-0 text-xs text-gray-400">{formatDate(email.receivedAt)}</span>
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
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100 transition-colors max-w-[140px]"
              title={task.title}
            >
              <CheckSquare className="h-2.5 w-2.5 shrink-0" />
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
          className="hidden group-hover:flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function RetentionBadge({ status }: { status?: string | null }) {
  if (!status || status === 'ACTIVE') return null
  const cfg = {
    ARCHIVED:      { label: 'Archived',  className: 'border-gray-200 bg-gray-50 text-gray-500' },
    METADATA_ONLY: { label: 'Body only', className: 'border-amber-200 bg-amber-50 text-amber-700' },
    PURGED:        { label: 'Purged',    className: 'border-red-200 bg-red-50 text-red-600' },
  }[status] ?? null
  if (!cfg) return null
  return (
    <Badge variant="outline" className={`shrink-0 text-[10px] py-0 ${cfg.className}`}>
      {cfg.label}
    </Badge>
  )
}

/* ========== SHARED COMPONENTS ========== */
function ClassBadge({ classification, processingStatus }: { classification?: string | null; processingStatus?: string | null }) {
  if (!classification && processingStatus === 'pending') {
    return (
      <Badge variant="outline" className="w-[104px] justify-center gap-1 text-[10px] bg-gray-50 text-gray-400 border-gray-200">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </Badge>
    )
  }
  const cfg = getEmailClassConfig(classification)
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

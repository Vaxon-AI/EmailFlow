'use client'

import { useQueryClient, useMutation } from '@tanstack/react-query'
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
  CheckSquare, Mail,
  Search, CalendarIcon, X, ChevronDown, FolderOpen, Loader2, Zap, Eye, EyeOff, Tag,
} from 'lucide-react'
import { Suspense, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { ReassignProjectModal } from '@/components/reassign-project-modal'
import { BatchReassignModal } from '@/components/batch-reassign-modal'
import { useAuth } from '@/lib/use-auth'
import { toast } from 'sonner'
import {
  EMAIL_BUCKET_LABELS,
  type BatchStatus,
  type EmailBucket,
  type EmailItem,
  formatEmailDate,
  parseEmailTab,
  renderEmailTabNewBadge,
  type Tab,
  canGenerateTaskFromEmail,
} from './email-page-types'
import { EmailMatterView } from './email-matter-view'
import { useEmailsPageData } from './use-emails-page-data'

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
      queryClient.invalidateQueries({ queryKey: ['emails', 'tab-states'] })
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
      queryClient.invalidateQueries({ queryKey: ['emails', 'tab-states'] })
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
        queryClient.invalidateQueries({ queryKey: ['emails', 'tab-states'] })
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
  const {
    pendingReviewCount,
    batchStatus,
    batchBannerActive,
    isLoading,
    meta,
    tabStateMap,
    accounts,
    filtered,
    unclassifiedCount,
    pendingCount,
    tabs,
  } = useEmailsPageData({
    tab,
    page,
    manualReviewMode,
    syncBatchId,
    batchDismissed,
    accountFilter,
    searchQuery,
    dateRange,
  })

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
              Uncertain emails need your judgment. Unclassified emails are not classified yet or were skipped by quota.
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
          options={tabs.map(({ key, label }) => ({
            value: key,
            label,
            badge: renderEmailTabNewBadge(tabStateMap.get(key)?.newCount ?? 0, key),
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
                      {formatEmailDate(email.receivedAt)}
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

'use client'

import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
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
  Mail,
  X, ChevronDown, FolderOpen, Loader2, Zap, EyeOff, Tag,
} from 'lucide-react'
import { Suspense, useState, useCallback, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { DateRange } from 'react-day-picker'
import { ReassignProjectModal } from '@/components/reassign-project-modal'
import { BatchReassignModal } from '@/components/batch-reassign-modal'
import { useAuth } from '@/lib/use-auth'
import { toast } from 'sonner'
import { mutateJson } from '@/lib/api-client'
import {
  EMAIL_BUCKET_LABELS,
  type EmailBucket,
  type EmailItem,
  parseEmailTab,
  renderEmailTabNewBadge,
  type Tab,
  canGenerateTaskFromEmail,
} from './email-page-types'
import { EmailFilterBar } from './email-filter-bar'
import { EmailMatterView } from './email-matter-view'
import { EmailStatusBanners } from './email-status-banners'
import { SyncBatchModal } from './sync-batch-modal'
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
  // tab is mirrored as local state so clicks flip the visual highlight in the
  // same frame instead of waiting for router.replace → URL sync → re-render.
  // The URL stays authoritative for back/forward and external links via the
  // effect below.
  const urlTab = parseEmailTab(searchParams.get('tab'), searchParams.get('classification'))
  const [tab, setTab] = useState<Tab>(urlTab)
  useEffect(() => {
    setTab(urlTab)
  }, [urlTab])
  const [, startTabTransition] = useTransition()
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
    mutationFn: (mode: boolean) =>
      mutateJson<{ data?: { manualReviewMode?: boolean } }>('/api/settings/review-mode', {
        body: { manualReviewMode: mode },
      }),
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
      const json = await mutateJson<{ data: { affected: number } }>('/api/emails/batch', {
        body: { ids, action: 'ignore' },
        fallbackMessage: 'Failed to ignore emails',
      })
      return json.data
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
      const json = await mutateJson<{ data: { affected: number; bucket: EmailBucket } }>(
        '/api/emails/batch',
        {
          body: { ids, action: 'classify', bucket },
          fallbackMessage: 'Failed to classify emails',
        },
      )
      return json.data
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
      const json = await mutateJson<{
        data: {
          queued: number
          skippedIneligible: number
          skippedQuota: number
          quotaExhausted: boolean
        }
      }>('/api/emails/batch', {
        body: { ids, action: 'generate_tasks' },
        fallbackMessage: 'Failed to queue tasks',
      })
      return json.data
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
    isListLoading,
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

      <EmailStatusBanners
        ackCurrentReviewBatch={ackCurrentReviewBatch}
        batchBannerActive={batchBannerActive}
        batchStatus={batchStatus}
        clearSelection={clearSelection}
        dismissBatchBanner={dismissBatchBanner}
        isLoading={isLoading}
        manualReviewMode={manualReviewMode}
        pendingCount={pendingCount}
        pendingReviewCount={pendingReviewCount}
        reviewBannerDismissed={reviewBannerDismissed}
        setPage={setPage}
        setShowBatchModal={setShowBatchModal}
        tab={tab}
        unclassifiedCount={unclassifiedCount}
        updateEmailUrlFilter={updateEmailUrlFilter}
      />

      {/* Tabs */}
      <div>
        <SegmentedControl
          value={tab}
          onChange={(nextTab) => {
            setTab(nextTab)
            clearSelection()
            setPage(1)
            startTabTransition(() => updateEmailUrlFilter({ tab: nextTab }))
          }}
          options={tabs.map(({ key, label }) => ({
            value: key,
            label,
            badge: renderEmailTabNewBadge(tabStateMap.get(key)?.newCount ?? 0, key),
          }))}
        />
      </div>

      <EmailFilterBar
        accountFilter={accountFilter}
        accounts={accounts}
        calendarOpen={calendarOpen}
        dateRange={dateRange}
        handleCalendarOpenChange={handleCalendarOpenChange}
        handleDayClick={handleDayClick}
        handleReviewModeToggle={handleReviewModeToggle}
        manualReviewMode={manualReviewMode}
        reviewModePending={reviewModeMutation.isPending}
        searchQuery={searchQuery}
        selectingStep={selectingStep}
        setAccountFilter={setAccountFilter}
        setCalendarOpen={setCalendarOpen}
        setDateRange={setDateRange}
        setSearchQuery={setSearchQuery}
        setSelectingStep={setSelectingStep}
      />

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
      {isListLoading ? (
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

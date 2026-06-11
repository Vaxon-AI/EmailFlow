'use client'

import { Button } from '@/components/ui/button'
import { Loader2, Eye, X, Zap } from 'lucide-react'
import { getUnhandledActionCount, type BatchStatus, type Tab } from './email-page-types'

export function EmailStatusBanners({
  ackCurrentReviewBatch,
  batchBannerActive,
  batchStatus,
  clearSelection,
  dismissBatchBanner,
  isLoading,
  manualReviewMode,
  pendingCount,
  pendingReviewCount,
  reviewBannerDismissed,
  setPage,
  setShowBatchModal,
  tab,
  unclassifiedCount,
  updateEmailUrlFilter,
}: {
  ackCurrentReviewBatch: () => void
  batchBannerActive: boolean
  batchStatus?: BatchStatus
  clearSelection: () => void
  dismissBatchBanner: () => void
  isLoading: boolean
  manualReviewMode: boolean
  pendingCount: number
  pendingReviewCount: number
  reviewBannerDismissed: boolean
  setPage: (page: number) => void
  setShowBatchModal: (open: boolean) => void
  tab: Tab
  unclassifiedCount: number
  updateEmailUrlFilter: (next: { tab?: Tab }) => void
}) {
  return (
    <>
      {unclassifiedCount > 0 && tab !== 'unclassified' && (
        <div className="animate-soft-enter flex items-start justify-between gap-3 rounded-xl border border-warning-100 bg-yellow-50/55 px-4 py-3 text-sm shadow-sm">
          <div className="min-w-0">
            <p className="font-medium text-warning-700">
              {unclassifiedCount} email{unclassifiedCount === 1 ? '' : 's'} need{unclassifiedCount === 1 ? 's' : ''} your review
            </p>
            <p className="mt-0.5 text-xs text-warning">
              These emails need your judgment to turn into tasks. Includes AI-uncertain and quota-skipped emails.
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
            {' '}Classified emails will move out of Needs Review automatically.
          </span>
        </div>
      )}

      {!isLoading && batchBannerActive && (() => {
        if (!batchStatus || !batchStatus.isComplete) {
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
        const unhandledCount = getUnhandledActionCount(batchStatus)
        if (unhandledCount > 0) {
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
                    {unhandledCount} action email{unhandledCount === 1 ? '' : 's'} found in this sync
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

      {!isLoading && tab !== 'unclassified' && !batchBannerActive && pendingCount > 0 && (
        <div className="animate-soft-enter flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/55 px-4 py-2.5 text-sm text-brand-700 shadow-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
          <span>
            <span className="font-medium">{pendingCount} email{pendingCount === 1 ? '' : 's'}</span>
            {' '}being classified in Needs Review.
          </span>
        </div>
      )}

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
    </>
  )
}

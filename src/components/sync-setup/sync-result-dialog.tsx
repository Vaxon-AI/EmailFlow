'use client'

import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { shouldShowQuotaWarning } from '@/lib/sync-quota-warning'
import { cn } from '@/lib/utils'

export interface SyncResultData {
  ok: boolean
  code?: string
  syncedCount: number
  skippedCount: number
  failedCount: number
  pendingFailedCount: number
  syncBatchId?: string
  /** True when new emails were stored — AI pipeline is running in the background. */
  processing: boolean
  /** True when this sync hit the free-plan classify quota cap. */
  quotaLimited?: boolean
  /** Remaining classify quota (null for paid plans). */
  quotaRemaining?: number | null
  quotaLimit?: number | null
  errorMessage?: string
  recoveryHint?: string
}

type SyncBatchStatus = {
  isComplete: boolean
  totalEmails: number
  pendingEmails: number
  needsActionCount?: number
  fyiCount?: number
  ignoredCount?: number
  uncertainCount?: number
  uncertainEmails?: number
  quotaSkippedEmails?: number
}

interface SyncResultDialogProps {
  open: boolean
  onClose: () => void
  onViewUnclassified: () => void
  result: SyncResultData | null
}

export function SyncResultDialog({
  open,
  onClose,
  onViewUnclassified,
  result,
}: SyncResultDialogProps) {
  const syncBatchId = result?.syncBatchId
  const { data: batchStatus } = useQuery<SyncBatchStatus>({
    queryKey: ['syncBatch', syncBatchId, 'dialog'],
    queryFn: async () => {
      const res = await fetch(`/api/sync/batch/${syncBatchId}`)
      const json = await res.json()
      return json.data as SyncBatchStatus
    },
    enabled: open && !!syncBatchId && result?.ok === true && result.processing,
    refetchInterval: (query) => {
      const data = query.state.data as SyncBatchStatus | undefined
      if (!data || data.isComplete) return false
      return 3000
    },
    staleTime: 0,
  })

  if (!result) return null

  const {
    ok,
    code,
    syncedCount,
    skippedCount,
    failedCount,
    pendingFailedCount,
    syncBatchId: resultSyncBatchId,
    processing,
    errorMessage,
    recoveryHint,
    quotaRemaining,
    quotaLimit,
  } = result

  const isPartial = ok && (failedCount > 0 || pendingFailedCount > 0)
  const showQuotaWarning = ok && shouldShowQuotaWarning(quotaRemaining, quotaLimit)
  const quotaExhausted = ok && quotaRemaining === 0
  const hasNewEmails = syncedCount > 0
  const isClassifying = processing && (!batchStatus || !batchStatus.isComplete)
  const showBatchSummary = ok && batchStatus?.isComplete && batchStatus.totalEmails > 0

  const statusIcon = !ok ? (
    <AlertCircle className="h-5 w-5 text-critical" />
  ) : isPartial ? (
    <AlertTriangle className="h-5 w-5 text-warning" />
  ) : (
    <CheckCircle2 className="h-5 w-5 text-success" />
  )

  const statusLabel = !ok
    ? 'Sync failed'
    : isPartial
      ? 'Partial success'
      : hasNewEmails
        ? 'Synced'
        : 'No new emails'
  const statusColor = !ok ? 'text-critical' : isPartial ? 'text-warning' : 'text-success'

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Sync Result</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
          {statusIcon}
          <span className={cn('text-sm font-medium', statusColor)}>{statusLabel}</span>
        </div>

        {ok ? (
          <ul className="space-y-1.5 text-sm text-gray-700">
            {syncedCount > 0 ? (
              <SyncLine
                label={
                  quotaExhausted
                    ? `Synced ${syncedCount} email${syncedCount === 1 ? '' : 's'} to Unclassified`
                    : `Synced ${syncedCount} email${syncedCount === 1 ? '' : 's'}`
                }
              />
            ) : (
              <SyncLine label="No new emails" muted />
            )}
            {skippedCount > 0 && <SyncLine label={`${skippedCount} already stored`} muted />}
            {failedCount > 0 && <SyncLine label={`${failedCount} failed to store`} warn />}
            {pendingFailedCount > 0 && (
              <SyncLine
                label={`${pendingFailedCount} failed email${pendingFailedCount === 1 ? '' : 's'} pending retry`}
                warn
              />
            )}
            {isClassifying && (
              <li className="flex items-center gap-2 text-brand-600 pt-0.5">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                <span>AI classification is running in the background...</span>
              </li>
            )}
            {showBatchSummary && (
              <li className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                <p className="mb-1 font-medium text-gray-900">This sync finished:</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <span>Needs Action: {batchStatus.needsActionCount ?? 0}</span>
                  <span>FYI: {batchStatus.fyiCount ?? 0}</span>
                  <span>Ignored: {batchStatus.ignoredCount ?? 0}</span>
                  <span>
                    Uncertain: {batchStatus.uncertainCount ?? batchStatus.uncertainEmails ?? 0}
                  </span>
                </div>
                {(batchStatus.quotaSkippedEmails ?? 0) > 0 && (
                  <p className="mt-1 text-warning-700">
                    Unclassified: {batchStatus.quotaSkippedEmails} not classified due to quota.
                  </p>
                )}
              </li>
            )}
            {showQuotaWarning && (
              <li className="mt-2 rounded-lg border border-warning-200 bg-warning-100/70 px-3 py-2 text-xs text-warning-700">
                <span className="font-medium">
                  {quotaExhausted
                    ? 'AI classification paused.'
                    : 'Free plan limit almost reached.'}
                </span>{' '}
                {quotaRemaining === 0
                  ? 'Your free plan classification limit is reached. New email is visible in Unclassified, or '
                  : `Only ${quotaRemaining} email${quotaRemaining === 1 ? '' : 's'} left to classify this month. `}
                <a
                  href="mailto:support@emailflow.ai?subject=Pro plan early access"
                  className="font-semibold underline hover:text-warning"
                >
                  upgrade to Pro
                </a>{' '}
                for unlimited classification.
              </li>
            )}
          </ul>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">{errorMessage}</p>
            {recoveryHint ? <p className="text-sm text-gray-500">{recoveryHint}</p> : null}
            {code ? (
              <p className="text-xs uppercase tracking-[0.14em] text-gray-400">{code}</p>
            ) : null}
          </div>
        )}

        <DialogFooter showCloseButton={false}>
          {ok && resultSyncBatchId && (
            <Button variant="outline" onClick={onViewUnclassified}>
              View Unclassified
            </Button>
          )}
          <Button onClick={onClose}>
            {isClassifying ? 'Close (continues in background)' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SyncLine({ label, muted, warn }: { label: string; muted?: boolean; warn?: boolean }) {
  return (
    <li
      className={cn(
        'flex items-center gap-2',
        muted && 'text-gray-400',
        warn && 'text-warning',
      )}
    >
      <span className="h-1 w-1 rounded-full bg-current opacity-60 shrink-0" />
      {label}
    </li>
  )
}

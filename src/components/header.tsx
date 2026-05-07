'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/use-auth'
import { ApiClientError, isSessionFailureCode } from '@/lib/api-client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RefreshCw, User, LogOut, ChevronRight, CheckCircle2, AlertCircle, AlertTriangle, Loader2, Menu } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { isWorkspaceQueryKey } from '@/lib/query-cache'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// How long to wait before doing a second refetch to pick up AI-created tasks.
// AI pipeline typically takes 5–30s depending on email volume.
const PROCESSING_REFETCH_DELAY_MS = 20_000

interface SyncResultData {
  ok: boolean
  code?: string
  syncedCount: number
  skippedCount: number
  failedCount: number
  pendingFailedCount: number
  // True when new emails were stored — AI pipeline is running in the background
  processing: boolean
  // True when this sync hit the free-plan classify quota cap
  quotaLimited?: boolean
  // Remaining classify quota (null for paid plans)
  quotaRemaining?: number | null
  errorMessage?: string
  recoveryHint?: string
}

export function Header({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { user, logout } = useAuth()
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const router = useRouter()
  const [syncResult, setSyncResult] = useState<SyncResultData | null>(null)
  const [syncResultOpen, setSyncResultOpen] = useState(false)
  const [checkingSyncState, setCheckingSyncState] = useState(false)

  const segments = pathname.split('/').filter(Boolean)
  const currentSection = segments[1] ? segments[1].replace(/-/g, ' ') : 'dashboard'
  const sectionLabel = currentSection.charAt(0).toUpperCase() + currentSection.slice(1)

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()

      if (!res.ok || !data.success) {
        if (!res.ok) {
          throw new ApiClientError(
            data?.error?.message || 'Sync failed',
            res.status,
            data?.error?.code,
          )
        }

        throw new Error(data?.error?.message || 'Sync failed')
      }

      return data
    },

    onSuccess: (data) => {
      // Invalidate immediately — emails are stored, they'll appear now.
      queryClient.invalidateQueries({
        predicate: (query) => isWorkspaceQueryKey(query.queryKey),
      })
      queryClient.refetchQueries({
        predicate: (query) => isWorkspaceQueryKey(query.queryKey),
        type: 'active',
      })

      const syncData = data?.data as {
        syncedCount: number
        skippedCount: number
        failedCount: number
        pendingFailedCount: number
        syncBatchId: string
        processing: boolean
        quotaLimited?: boolean
        quotaRemaining?: number | null
      } | undefined

      const processing = syncData?.processing ?? false

      // Store the batch ID so the Emails page can poll for action-email results.
      if (processing && syncData?.syncBatchId) {
        sessionStorage.setItem('emailflow:syncBatchId', syncData.syncBatchId)
      }

      setSyncResult({
        ok: true,
        syncedCount: syncData?.syncedCount ?? 0,
        skippedCount: syncData?.skippedCount ?? 0,
        failedCount: syncData?.failedCount ?? 0,
        pendingFailedCount: syncData?.pendingFailedCount ?? 0,
        processing,
        quotaLimited: syncData?.quotaLimited,
        quotaRemaining: syncData?.quotaRemaining,
      })
      setSyncResultOpen(true)

      // When AI is running in the background, do a second refetch after a delay
      // to pick up newly created tasks without the user having to manually refresh.
      if (processing) {
        setTimeout(() => {
          queryClient.invalidateQueries({
            predicate: (query) => isWorkspaceQueryKey(query.queryKey),
          })
          queryClient.refetchQueries({
            predicate: (query) => isWorkspaceQueryKey(query.queryKey),
            type: 'active',
          })
        }, PROCESSING_REFETCH_DELAY_MS)
      }
    },

    onError: (err) => {
      if (err instanceof ApiClientError && isSessionFailureCode(err.code)) {
        logout()
        return
      }

      console.error('Sync failed:', err)
      queryClient.invalidateQueries({
        predicate: (query) => isWorkspaceQueryKey(query.queryKey),
      })
      queryClient.refetchQueries({
        predicate: (query) => isWorkspaceQueryKey(query.queryKey),
        type: 'active',
      })
      setSyncResult({
        ok: false,
        code: err instanceof ApiClientError ? err.code : undefined,
        syncedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        pendingFailedCount: 0,
        processing: false,
        errorMessage: err instanceof Error ? err.message : 'Sync failed',
        recoveryHint:
          err instanceof ApiClientError && err.code === 'PROVIDER_REAUTH_REQUIRED'
            ? 'Reconnect your email provider in Settings, then run sync again.'
            : err instanceof ApiClientError && err.code === 'SYNC_TEMPORARY_ERROR'
              ? 'This looks temporary. Wait a moment and try again.'
              : undefined,
      })
      setSyncResultOpen(true)
    },
  })

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200/80 bg-white/85 px-4 backdrop-blur lg:px-6">
        <div className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open navigation"
            className="-ml-1 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-medium text-gray-900">Workspace</span>
          <ChevronRight className="hidden h-4 w-4 text-gray-300 sm:block" />
          <span className="truncate">{sectionLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (syncMutation.isPending || checkingSyncState) return
              setCheckingSyncState(true)
              try {
                const res = await fetch('/api/sync/state')
                if (!res.ok) {
                  // Fall back to firing the sync directly so the button still works
                  syncMutation.mutate()
                  return
                }
                const json = await res.json()
                const kind: 'never' | 'fresh' | 'stale' = json?.data?.state?.kind ?? 'never'
                if (kind === 'fresh') {
                  // Active user — incremental sync from lastSyncAt forward, no modal
                  syncMutation.mutate()
                } else {
                  // Stale or first-time — open the dashboard's setup modal so the
                  // user can pick a window before we sync
                  router.push('/dashboard?show_sync=stale')
                }
              } catch {
                syncMutation.mutate()
              } finally {
                setCheckingSyncState(false)
              }
            }}
            disabled={syncMutation.isPending || checkingSyncState}
            title={syncMutation.isPending ? 'Syncing...' : 'Sync emails'}
            className={cn(
              'rounded-full border border-transparent p-2 text-gray-400 transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40'
            )}
          >
            <RefreshCw className={cn('h-4 w-4', (syncMutation.isPending || checkingSyncState) && 'animate-spin')} />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white px-3 py-1.5 text-sm shadow-sm transition-colors hover:bg-gray-50">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <User className="h-4 w-4" />
              </div>
              <span className="max-w-28 truncate">{user?.name || 'User'}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <SyncResultDialog
        open={syncResultOpen}
        onClose={() => setSyncResultOpen(false)}
        result={syncResult}
      />
    </>
  )
}

// ============================================================
// Sync Result Dialog
// ============================================================

interface SyncResultDialogProps {
  open: boolean
  onClose: () => void
  result: SyncResultData | null
}

function SyncResultDialog({ open, onClose, result }: SyncResultDialogProps) {
  if (!result) return null

  const {
    ok, code, syncedCount, skippedCount, failedCount, pendingFailedCount,
    processing, errorMessage, recoveryHint, quotaLimited, quotaRemaining,
  } = result

  const isPartial = ok && (failedCount > 0 || pendingFailedCount > 0)

  const statusIcon = !ok
    ? <AlertCircle className="h-5 w-5 text-red-500" />
    : isPartial
    ? <AlertTriangle className="h-5 w-5 text-amber-500" />
    : <CheckCircle2 className="h-5 w-5 text-green-500" />

  const statusLabel = !ok ? 'Sync failed' : isPartial ? 'Partial success' : 'Success'
  const statusColor = !ok ? 'text-red-600' : isPartial ? 'text-amber-600' : 'text-green-600'

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
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
              <SyncLine label={`Synced ${syncedCount} email${syncedCount === 1 ? '' : 's'}`} />
            ) : skippedCount > 0 ? (
              <SyncLine label="No new emails" muted />
            ) : (
              <SyncLine label="No new emails" muted />
            )}
            {skippedCount > 0 && (
              <SyncLine label={`${skippedCount} already stored`} muted />
            )}
            {failedCount > 0 && (
              <SyncLine label={`${failedCount} failed to store`} warn />
            )}
            {pendingFailedCount > 0 && (
              <SyncLine label={`${pendingFailedCount} failed email${pendingFailedCount === 1 ? '' : 's'} pending retry`} warn />
            )}
            {processing && (
              <li className="flex items-center gap-2 text-blue-600 pt-0.5">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                <span>Classifying emails and extracting tasks...</span>
              </li>
            )}
            {quotaLimited && (
              <li className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
                <span className="font-medium">Free plan limit reached.</span>{' '}
                {quotaRemaining === 0
                  ? 'Newly synced emails are sitting in the Unclassified tab — open any of them to classify manually, or '
                  : `Only ${quotaRemaining} email${quotaRemaining === 1 ? '' : 's'} left to classify this month. `}
                <a href="mailto:support@emailflow.ai?subject=Pro plan early access" className="font-semibold underline hover:text-amber-900">
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
            {code ? <p className="text-xs uppercase tracking-[0.14em] text-gray-400">{code}</p> : null}
          </div>
        )}

        <DialogFooter showCloseButton={false}>
          <Button onClick={onClose}>
            {processing ? 'Close (continues in background)' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SyncLine({ label, muted, warn }: { label: string; muted?: boolean; warn?: boolean }) {
  return (
    <li className={cn(
      'flex items-center gap-2',
      muted && 'text-gray-400',
      warn && 'text-amber-600',
    )}>
      <span className="h-1 w-1 rounded-full bg-current opacity-60 shrink-0" />
      {label}
    </li>
  )
}

'use client'

// Provider that owns the sync surface end-to-end:
//   1. Two-step Sync Setup modal (personalisation → sync-range) with preview
//      per-window quota impact.
//   2. The shared syncMutation that actually hits /api/sync.
//   3. The Sync Result dialog shown after a sync run.
//   4. The Upgrade modal (opens from inside the setup flow on quota errors).
//
// Lives in the dashboard layout so Header can trigger it from any page —
// `/dashboard`, `/dashboard/tasks`, `/dashboard/emails`, etc. — without the
// user being bounced back to /dashboard mid-flow.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ApiClientError, isSessionFailureCode } from '@/lib/api-client'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useAuth } from '@/lib/use-auth'
import { isWorkspaceQueryKey } from '@/lib/query-cache'
import { SyncResultDialog, type SyncResultData } from './sync-result-dialog'
import { SyncSetupModal, type SyncSetupReason } from './sync-setup-modal'

// AI pipeline typically takes 5–30s; second refetch after this delay picks up
// newly classified emails / created tasks without a manual refresh.
const PROCESSING_REFETCH_DELAY_MS = 20_000

interface SyncSetupApi {
  /** Open the sync setup modal. `reason` shapes the default selection + which
   *  step we open on (header-sync goes straight to sync-range; first-time /
   *  gmail-connected keep the personalisation step). */
  openSyncSetup: (reason?: SyncSetupReason) => void
  /** Close the modal programmatically. */
  closeSyncSetup: () => void
  /** Run a sync immediately (skip modal). Used by Header when the user is fresh. */
  runSync: () => void
  /** True while the sync POST is in-flight — drives the header button spinner. */
  syncPending: boolean
  /** Open the Upgrade modal — used by the in-modal "upgrade" link. */
  openUpgrade: () => void
}

const SyncSetupContext = createContext<SyncSetupApi | null>(null)

export function useSyncSetup(): SyncSetupApi {
  const ctx = useContext(SyncSetupContext)
  if (!ctx) throw new Error('useSyncSetup must be used inside <SyncSetupProvider>')
  return ctx
}

export function SyncSetupProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { logout } = useAuth()

  const [modalOpen, setModalOpen] = useState(false)
  const [modalReason, setModalReason] = useState<SyncSetupReason>('first-time')
  const [syncResult, setSyncResult] = useState<SyncResultData | null>(null)
  const [syncResultOpen, setSyncResultOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

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
      queryClient.invalidateQueries({
        predicate: (query) => isWorkspaceQueryKey(query.queryKey),
      })
      queryClient.refetchQueries({
        predicate: (query) => isWorkspaceQueryKey(query.queryKey),
        type: 'active',
      })

      const syncData = data?.data as
        | {
            syncedCount: number
            skippedCount: number
            failedCount: number
            pendingFailedCount: number
            syncBatchId: string
            processing: boolean
            quotaLimited?: boolean
            quotaRemaining?: number | null
            quotaLimit?: number | null
          }
        | undefined

      const processing = syncData?.processing ?? false

      if (processing && syncData?.syncBatchId) {
        sessionStorage.setItem('emailflow:syncBatchId', syncData.syncBatchId)
      }

      setSyncResult({
        ok: true,
        syncedCount: syncData?.syncedCount ?? 0,
        skippedCount: syncData?.skippedCount ?? 0,
        failedCount: syncData?.failedCount ?? 0,
        pendingFailedCount: syncData?.pendingFailedCount ?? 0,
        syncBatchId: syncData?.syncBatchId,
        processing,
        quotaLimited: syncData?.quotaLimited,
        quotaRemaining: syncData?.quotaRemaining,
        quotaLimit: syncData?.quotaLimit,
      })
      setSyncResultOpen(true)

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

  const openSyncSetup = useCallback((reason: SyncSetupReason = 'header-sync') => {
    setModalReason(reason)
    setModalOpen(true)
  }, [])

  const closeSyncSetup = useCallback(() => {
    setModalOpen(false)
  }, [])

  const runSync = useCallback(() => {
    if (syncMutation.isPending) return
    syncMutation.mutate()
  }, [syncMutation])

  const openUpgrade = useCallback(() => setUpgradeOpen(true), [])

  const api: SyncSetupApi = {
    openSyncSetup,
    closeSyncSetup,
    runSync,
    syncPending: syncMutation.isPending,
    openUpgrade,
  }

  return (
    <SyncSetupContext.Provider value={api}>
      {children}
      <SyncSetupModal
        open={modalOpen}
        reason={modalReason}
        onOpenChange={setModalOpen}
        onSyncRangeSaved={() => syncMutation.mutate()}
      />
      <SyncResultDialog
        open={syncResultOpen}
        onClose={() => setSyncResultOpen(false)}
        onViewUnclassified={() => {
          setSyncResultOpen(false)
          router.push('/dashboard/emails?tab=unclassified')
        }}
        result={syncResult}
      />
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </SyncSetupContext.Provider>
  )
}

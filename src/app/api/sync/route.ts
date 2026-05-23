export const dynamic = "force-dynamic"
import { after } from 'next/server'
import { errorFromException, getAuthUser, success } from '@/lib/api-helpers'
import { syncEmailsPhase1, syncEmailsPhase2 } from '@/services/email-sync-service'

export async function POST() {
  try {
    const user = await getAuthUser()

    // Phase 1: provider fetch + email storage + updateLastSync.
    // Returns in seconds (provider API + DB writes, no AI).
    const phase1 = await syncEmailsPhase1(user.id)

    // Phase 2: AI classification, task extraction, retry work.
    // Scheduled to run after the HTTP response is sent so the user is
    // never blocked waiting for AI. Tasks will appear once phase 2 completes.
    after(() =>
      syncEmailsPhase2(user.id, phase1.storedEmails).catch((err) => {
        console.error('[sync] phase2 background task failed:', err)
      })
    )

    return success({
      totalFetched: phase1.totalFetched,
      syncedCount: phase1.syncedCount,
      skippedCount: phase1.skippedCount,
      failedCount: phase1.failedCount,
      pendingFailedCount: phase1.pendingFailedCount,
      syncBatchId: phase1.syncBatchId,
      quotaLimited: phase1.quotaLimited,
      quotaRemaining: phase1.quotaRemaining === Infinity ? null : phase1.quotaRemaining,
      // true when new emails were stored and AI will classify them in the background
      processing: phase1.storedEmails.length > 0,
    })
  } catch (err) {
    console.error('Sync failed:', err)
    return errorFromException(err, 'SYNC_FAILED', 'Email sync failed', 500)
  }
}

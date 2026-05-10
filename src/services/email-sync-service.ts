import { AppError } from '@/lib/app-errors'
import * as Sentry from '@sentry/nextjs'
import { gmailProvider } from '@/integrations'
import type { EmailMessage } from '@/integrations'
import { processEmail } from '@/workflows'
import * as emailRepo from '@/repositories/email-repo'
import * as userRepo from '@/repositories/user-repo'
import * as failedRepo from '@/repositories/failed-email-sync-repo'
import { getClassifyRemaining, incrementClassifyUsed } from '@/lib/quota'

// ============================================================
// Email Sync Service — two-phase architecture
//
// Phase 1 (syncEmailsPhase1):
//   Gmail fetch → email storage → updateLastSync
//   Returns quickly (Gmail API + DB writes only, no AI)
//
// Phase 2 (syncEmailsPhase2):
//   AI classification → task extraction → retry failed emails
//   Runs via next/server `after()` so phase 1 response is sent first
//
// Maximum number of previously-failed emails to retry per sync run.
// Caps retry overhead on syncs that have a large backlog.
// ============================================================

const RETRY_BATCH_SIZE = 10

// Internal type alias for emails returned by storeEmail, passed from phase1 to phase2.
type StoredEmail = NonNullable<Awaited<ReturnType<typeof emailRepo.storeEmail>>['email']>

export interface Phase1Result {
  totalFetched: number
  syncedCount: number
  skippedCount: number
  failedCount: number
  pendingFailedCount: number
  syncBatchId: string
  /** True when the Gmail fetch was capped by the user's remaining classify quota. */
  quotaLimited: boolean
  /** Remaining classify quota at the start of this sync (Infinity for paid plans). */
  quotaRemaining: number
  // Passed to syncEmailsPhase2 — not included in the HTTP response
  storedEmails: StoredEmail[]
}

// ============================================================
// Phase 1 — Gmail fetch + email storage
// Called by the route handler. Returns before AI runs.
// ============================================================

export async function syncEmailsPhase1(userId: string): Promise<Phase1Result> {
  try {
  const t0 = Date.now()
  const syncBatchId = `sync-${Date.now()}`

  const syncInfo = await userRepo.getUserSyncInfo(userId)
  if (!syncInfo) throw new Error('User not found')
  if (!syncInfo.gmailConnected) throw new AppError('SYNC_FAILED', 'Email not connected', 400)
  if (!syncInfo.syncEnabled) throw new Error('Email sync is disabled')
  if (syncInfo.emailProviderReauthRequired) {
    const enabledAccounts = await userRepo.listEnabledGmailAccounts(userId)
    if (enabledAccounts.length === 0) {
      throw new AppError(
        'PROVIDER_REAUTH_REQUIRED',
        'Your email provider connection needs to be reauthorized before sync can continue.',
        401,
        {
          provider: syncInfo.emailProviderReauthProvider || 'gmail',
          reason: syncInfo.emailProviderReauthReason || 'refresh_failed',
        },
      )
    }
  }

  // Cap Gmail fetch by the user's remaining classify quota. Without this cap,
  // a free user with quota=6 would still pull 100 messages from Gmail; the 94
  // that Phase 2 can't classify would sit in DB as 'pending' until fixStuckEmails
  // marks them failed — wasting storage and confusing the user.
  const quotaRemaining = await getClassifyRemaining(userId)
  const fetchCap = quotaRemaining === Infinity ? 100 : Math.min(quotaRemaining, 100)
  const quotaLimited = quotaRemaining !== Infinity && quotaRemaining < 100

  if (fetchCap === 0) {
    console.log(`[sync] phase1 quota=0, skipping Gmail fetch entirely`)
    await userRepo.updateLastSync(userId)
    const pendingFailedCount = await failedRepo.countPendingFailures(userId)
    return {
      totalFetched: 0,
      syncedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      pendingFailedCount,
      syncBatchId,
      quotaLimited: true,
      quotaRemaining: 0,
      storedEmails: [],
    }
  }

  const gmailAccounts = await userRepo.listEnabledGmailAccounts(userId)
  const accountsToSync = gmailAccounts.length > 0
    ? gmailAccounts
    : [{ id: undefined, email: null, reauthRequired: false }]

  if (accountsToSync.length === 0) {
    throw new AppError('SYNC_FAILED', 'Email not connected', 400)
  }

  // 1) Fetch new emails from Gmail
  const tFetch = Date.now()
  const messages: EmailMessage[] = []
  let remainingFetchBudget = fetchCap
  let lastFetchError: unknown = null
  let fetchedAccountCount = 0

  for (const account of accountsToSync) {
    if (account.reauthRequired) {
      console.warn(`[sync] skipping Gmail account ${account.email || account.id || 'legacy'}: reauth required`)
      continue
    }

    if (remainingFetchBudget !== Infinity && remainingFetchBudget <= 0) break

    const accountCap = remainingFetchBudget === Infinity ? 100 : Math.min(remainingFetchBudget, 100)
    try {
      const accountMessages = await gmailProvider.fetchNewEmails(userId, {
        maxResults: accountCap,
        accountId: account.id,
      })
      messages.push(...accountMessages)
      fetchedAccountCount++
      if (account.id) {
        await userRepo.updateAccountLastSync(account.id)
      }
      if (remainingFetchBudget !== Infinity) {
        remainingFetchBudget = Math.max(0, remainingFetchBudget - accountMessages.length)
      }
    } catch (err) {
      lastFetchError = err
      if (err instanceof AppError && err.code === 'PROVIDER_REAUTH_REQUIRED') {
        console.warn(`[sync] Gmail account ${account.email || account.id || 'legacy'} needs reauth`)
        continue
      }
      console.error(`[sync] fetch failed for Gmail account ${account.email || account.id || 'legacy'}:`, err)
      if (accountsToSync.length === 1) throw err
    }
  }

  if (fetchedAccountCount === 0 && lastFetchError) throw lastFetchError

  console.log(`[sync] fetchNewEmails: ${Date.now() - tFetch}ms, count=${messages.length}, cap=${fetchCap}, accounts=${fetchedAccountCount}`)

  // 2) Store emails one-by-one so a single failure cannot prevent
  //    updateLastSync from running.  Promise.all would reject on the
  //    first error while earlier upserts had already committed.
  const tStore = Date.now()
  const storedEmails: StoredEmail[] = []
  const newEmailIds: string[] = []
  let syncedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const message of messages) {
    try {
      const result = await emailRepo.storeEmail({ userId, message, syncBatchId })
      if (result.wasCreated) {
        // Only newly inserted emails feed Phase 2. Already-stored emails were
        // either classified by a previous sync (no need to redo) or are stuck
        // 'pending' from a crashed prior run (handled by fixStuckEmails). Re-running
        // the AI pipeline on them wastes quota and can cause the same email to
        // be re-classified multiple times.
        storedEmails.push(result.email)
        syncedCount++
        newEmailIds.push(result.email.id)
      } else {
        // skipped: existing duplicate OR tombstoned (previously deleted by retention)
        skippedCount++
      }
    } catch (err) {
      failedCount++
      const reason = err instanceof Error ? err.message : String(err)
      console.error(`Failed to store email gmailMessageId=${message.providerMessageId}: ${reason}`)
      try {
        await failedRepo.recordFailedEmail(userId, message, reason)
      } catch (recordErr) {
        console.error(`Failed to record failed email gmailMessageId=${message.providerMessageId}:`, recordErr)
      }
    }
  }
  console.log(`[sync] storeEmails: ${Date.now() - tStore}ms, synced=${syncedCount}, skipped=${skippedCount}, failed=${failedCount}`)

  // Tag newly stored emails as awaiting user review when manual mode is on.
  // Also update the in-memory objects so Phase 2 passes the correct flag to processEmail.
  if (syncInfo.manualReviewMode && newEmailIds.length > 0) {
    await emailRepo.markEmailsAwaitingReview(newEmailIds)
    const newIdSet = new Set(newEmailIds)
    for (const email of storedEmails) {
      if (newIdSet.has(email.id)) {
        ;(email as StoredEmail & { awaitingReview: boolean }).awaitingReview = true
      }
    }
  }

  // 3) Mark sync time — persisted before AI pipeline so it's recorded even
  //    if downstream processing is slow or never completes.
  const tUpdate = Date.now()
  await userRepo.updateLastSync(userId)
  console.log(`[sync] updateLastSync: ${Date.now() - tUpdate}ms`)

  // 4) Count pending failures for the response display
  const tCount = Date.now()
  const pendingFailedCount = await failedRepo.countPendingFailures(userId)
  console.log(`[sync] countPendingFailures: ${Date.now() - tCount}ms, pending=${pendingFailedCount}`)

  console.log(`[sync] phase1 total: ${Date.now() - t0}ms`)

  return {
    totalFetched: messages.length,
    syncedCount,
    skippedCount,
    failedCount,
    pendingFailedCount,
    syncBatchId,
    quotaLimited,
    quotaRemaining,
    storedEmails,
  }
  } catch (err) {
    console.error('[syncEmailsPhase1]', err)
    Sentry.captureException(err, { tags: { action: 'syncEmailsPhase1' }, extra: { userId } })
    throw err
  }
}

// ============================================================
// Phase 2 — AI pipeline + retry work
// Scheduled via next/server after() so it runs after the
// HTTP response is already sent. Never blocks the user.
// ============================================================

export async function syncEmailsPhase2(userId: string, storedEmails: StoredEmail[]): Promise<void> {
  try {
  const t0 = Date.now()

  // 0) Resolve any emails that have been stuck in 'pending' for > 2 minutes.
  //    This cleans up historical data and guards against future edge-case hangs.
  const tStuck = Date.now()
  const stuckFixed = await emailRepo.fixStuckEmails(userId)
  if (stuckFixed > 0) {
    console.log(`[sync] phase2 fixStuckEmails: ${Date.now() - tStuck}ms, fixed=${stuckFixed}`)
  }

  // 1) Run email processing pipeline on each newly stored email
  if (storedEmails.length > 0) {
    const tAI = Date.now()

    const remaining = await getClassifyRemaining(userId)
    const emailsToProcess = remaining === Infinity
      ? storedEmails
      : storedEmails.slice(0, remaining)

    if (emailsToProcess.length < storedEmails.length) {
      const skippedIds = storedEmails.slice(emailsToProcess.length).map((e) => e.id)
      console.log(`[sync] phase2 quota: ${skippedIds.length} email(s) skipped (free plan limit reached)`)
      // Mark them with a distinct status so:
      //   1. fixStuckEmails (filters by 'pending') won't sweep them to 'uncertain'
      //   2. UI can surface them in a dedicated banner / Unclassified tab
      // classification stays null until the user manually classifies or the
      // monthly quota frees up.
      await emailRepo.markQuotaSkipped(skippedIds)
    }

    for (const email of emailsToProcess) {
      try {
        const result = await processEmail(userId, {
          id: email.id,
          subject: email.subject,
          sender: email.sender,
          receivedAt: email.receivedAt,
          bodyPreview: email.bodyPreview,
          bodyFull: email.bodyFull,
          labels: email.labels,
          threadId: email.threadId,
          awaitingReview: (email as StoredEmail & { awaitingReview?: boolean }).awaitingReview ?? false,
        })

        // Only count emails that actually invoked the AI classifier. Rule-based
        // pre-filter skips (spam / promotions / body-too-short) never call the
        // model, so they shouldn't burn the user's monthly quota.
        if (!result.skippedByRule) {
          await incrementClassifyUsed(userId)
        }
      } catch (err) {
        console.error(`[sync] phase2 failed to process email ${email.id}:`, err)
      }
    }

    console.log(`[sync] phase2 aiPipeline: ${Date.now() - tAI}ms, processed=${storedEmails.length}`)
  }

  // 2) Retry previously failed emails (capped at RETRY_BATCH_SIZE per run)
  const tRetry = Date.now()
  const { retriedSuccessCount, retriedFailedCount } = await retryFailedEmails(userId)
  console.log(`[sync] phase2 retryFailedEmails: ${Date.now() - tRetry}ms, success=${retriedSuccessCount}, failed=${retriedFailedCount}`)

  console.log(`[sync] phase2 total: ${Date.now() - t0}ms`)
  } catch (err) {
    console.error('[syncEmailsPhase2]', err)
    Sentry.captureException(err, { tags: { action: 'syncEmailsPhase2' }, extra: { userId } })
    throw err
  }
}

// ============================================================
// Retry loop — runs in phase 2 after every sync run.
// Loads pending/retrying records, tries to store them again.
// If storeEmail returns wasCreated=false the email already
// exists (stored by another path) — treat that as resolved.
// ============================================================

async function retryFailedEmails(userId: string): Promise<{ retriedSuccessCount: number; retriedFailedCount: number }> {
  let retriedSuccessCount = 0
  let retriedFailedCount = 0

  let allPendingRecords: Awaited<ReturnType<typeof failedRepo.loadPendingFailures>>
  try {
    allPendingRecords = await failedRepo.loadPendingFailures(userId)
  } catch (err) {
    console.error('Failed to load pending retry records:', err)
    return { retriedSuccessCount, retriedFailedCount }
  }

  // Process only a bounded batch per run — keeps retry overhead predictable
  // even when the backlog is large.
  const pendingRecords = allPendingRecords.slice(0, RETRY_BATCH_SIZE)

  for (const record of pendingRecords) {
    try {
      const { wasCreated } = await emailRepo.storeEmail({
        userId,
        message: {
          providerMessageId: record.gmailMessageId,
          threadId: record.threadId ?? null,
          receivedAt: record.receivedAt ?? new Date(),
          subject: record.subject ?? '(no subject)',
          sender: record.sender ?? '',
          recipients: [],
          bodyPreview: '',
          bodyFull: '',
          labels: [],
          hasAttachments: false,
          providerCategories: [],
        },
      })

      retriedSuccessCount++
      await failedRepo.resolveFailedEmail(userId, record.gmailMessageId)
      console.log(`Retry resolved gmailMessageId=${record.gmailMessageId} wasCreated=${wasCreated}`)
    } catch (err) {
      retriedFailedCount++
      const reason = err instanceof Error ? err.message : String(err)
      console.error(`Retry failed gmailMessageId=${record.gmailMessageId}: ${reason}`)
      try {
        await failedRepo.recordRetryFailure(userId, record.gmailMessageId, reason)
      } catch (updateErr) {
        console.error(`Failed to update retry record gmailMessageId=${record.gmailMessageId}:`, updateErr)
      }
    }
  }

  return { retriedSuccessCount, retriedFailedCount }
}

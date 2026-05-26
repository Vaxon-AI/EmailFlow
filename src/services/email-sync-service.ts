import { AppError, errorMessage } from '@/lib/app-errors'
import * as Sentry from '@sentry/nextjs'
import { getEmailProvider } from '@/integrations/provider-registry'
import type { EmailMessage } from '@/integrations'
import { processEmail, processEmailRuleOnly } from '@/workflows'
import * as emailRepo from '@/repositories/email-repo'
import * as userRepo from '@/repositories/user-repo'
import * as failedRepo from '@/repositories/failed-email-sync-repo'
import { FREE_CLASSIFY_LIMIT, getClassifyRemaining, incrementClassifyUsed } from '@/lib/quota'

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
const PROVIDER_FETCH_CAP = 100

// Internal type alias for emails returned by storeEmail, passed from phase1 to phase2.
type StoredEmail = NonNullable<Awaited<ReturnType<typeof emailRepo.storeEmail>>['email']>

type SyncInfo = NonNullable<Awaited<ReturnType<typeof userRepo.getUserSyncInfo>>>
type EmailAccount = {
  id?: string
  provider: string
  email: string | null
  reauthRequired: boolean
}
type StoreLoopResult = {
  storedEmails: StoredEmail[]
  newEmailIds: string[]
  syncedCount: number
  skippedCount: number
  failedCount: number
}

export interface Phase1Result {
  totalFetched: number
  syncedCount: number
  skippedCount: number
  failedCount: number
  pendingFailedCount: number
  syncBatchId: string
  /** True when AI classification is limited by the user's remaining classify quota. */
  quotaLimited: boolean
  /** Remaining classify quota at the start of this sync (Infinity for paid plans). */
  quotaRemaining: number
  /** Monthly classify quota limit (null for paid plans). */
  quotaLimit: number | null
  // Passed to syncEmailsPhase2 — not included in the HTTP response
  storedEmails: StoredEmail[]
}

function assertSyncAllowed(syncInfo: SyncInfo) {
  if (!syncInfo.emailConnected) throw new AppError('SYNC_FAILED', 'Email not connected', 400)
  if (!syncInfo.syncEnabled) throw new Error('Email sync is disabled')
}

async function assertProviderReauthResolved(userId: string, syncInfo: SyncInfo) {
  if (!syncInfo.emailProviderReauthRequired) return

  const enabledAccounts = await userRepo.listEnabledEmailAccounts(userId)
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

async function getAccountsToSync(userId: string): Promise<EmailAccount[]> {
  const emailAccounts = await userRepo.listEnabledEmailAccounts(userId)
  if (emailAccounts.length > 0) return emailAccounts

  return [{ id: undefined, provider: 'google', email: null, reauthRequired: false }]
}

function getStoredEmailInput(email: StoredEmail) {
  return {
    id: email.id,
    subject: email.subject,
    sender: email.sender,
    receivedAt: email.receivedAt,
    bodyPreview: email.bodyPreview,
    bodyFull: email.bodyFull,
    labels: email.labels,
    threadId: email.threadId,
    awaitingReview: (email as StoredEmail & { awaitingReview?: boolean }).awaitingReview ?? false,
  }
}

async function storeFetchedEmails(
  userId: string,
  messages: EmailMessage[],
  syncBatchId: string
): Promise<StoreLoopResult> {
  const storedEmails: StoredEmail[] = []
  const newEmailIds: string[] = []
  let syncedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const message of messages) {
    try {
      const result = await emailRepo.storeEmail({ userId, message, syncBatchId })
      if (result.wasCreated) {
        storedEmails.push(result.email)
        syncedCount++
        newEmailIds.push(result.email.id)
      } else {
        skippedCount++
      }
    } catch (err) {
      failedCount++
      const reason = errorMessage(err)
      console.error(`Failed to store email providerMessageId=${message.providerMessageId}: ${reason}`)
      try {
        await failedRepo.recordFailedEmail(userId, message, reason)
      } catch (recordErr) {
        console.error(`Failed to record failed email providerMessageId=${message.providerMessageId}:`, recordErr)
      }
    }
  }

  return {
    storedEmails,
    newEmailIds,
    syncedCount,
    skippedCount,
    failedCount,
  }
}

async function markStoredEmailsAwaitingReview(newEmailIds: string[], storedEmails: StoredEmail[]) {
  if (newEmailIds.length === 0) return

  await emailRepo.markEmailsAwaitingReview(newEmailIds)
  const newIdSet = new Set(newEmailIds)
  for (const email of storedEmails) {
    if (newIdSet.has(email.id)) {
      ;(email as StoredEmail & { awaitingReview: boolean }).awaitingReview = true
    }
  }
}

function buildRetryMessage(record: {
  providerMessageId: string
  threadId: string | null
  receivedAt: Date | null
  subject: string | null
  sender: string | null
}): EmailMessage {
  return {
    providerMessageId: record.providerMessageId,
    threadId: record.threadId ?? null,
    receivedAt: record.receivedAt ?? new Date(),
    subject: record.subject ?? '(no subject)',
    sender: record.sender ?? '',
    recipients: [],
    bodyPreview: '',
    bodyFull: '',
    bodyHtml: null,
    labels: [],
    hasAttachments: false,
    providerCategories: [],
  }
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
  assertSyncAllowed(syncInfo)
  await assertProviderReauthResolved(userId, syncInfo)

  // Provider fetch is intentionally independent from classify quota. Sync's
  // promise is to bring new email into the product first; Phase 2 can classify
  // what quota allows and leave the rest visible in Unclassified.
  const quotaRemaining = await getClassifyRemaining(userId)
  const quotaLimited = quotaRemaining !== Infinity && quotaRemaining < 100
  const fetchCap = PROVIDER_FETCH_CAP

  const accountsToSync = await getAccountsToSync(userId)

  if (accountsToSync.length === 0) {
    throw new AppError('SYNC_FAILED', 'Email not connected', 400)
  }

  // 1) Fetch new emails from providers
  const tFetch = Date.now()
  const messages: EmailMessage[] = []
  let remainingFetchBudget = fetchCap
  let lastFetchError: unknown = null
  let fetchedAccountCount = 0

  for (const account of accountsToSync) {
    if (account.reauthRequired) {
      console.warn(`[sync] skipping email account ${account.email || account.id || 'legacy'}: reauth required`)
      continue
    }

    if (remainingFetchBudget <= 0) break

    const accountCap = Math.min(remainingFetchBudget, PROVIDER_FETCH_CAP)
    try {
      const provider = getEmailProvider(account.provider)
      const accountMessages = await provider.fetchNewEmails(userId, {
        maxResults: accountCap,
        accountId: account.id,
      })
      messages.push(...accountMessages)
      fetchedAccountCount++
      if (account.id) {
        await userRepo.updateAccountLastSync(account.id)
      }
      remainingFetchBudget = Math.max(0, remainingFetchBudget - accountMessages.length)
    } catch (err) {
      lastFetchError = err
      if (err instanceof AppError && err.code === 'PROVIDER_REAUTH_REQUIRED') {
        console.warn(`[sync] email account ${account.email || account.id || 'legacy'} needs reauth`)
        continue
      }
      console.error(`[sync] fetch failed for email account ${account.email || account.id || 'legacy'}:`, err)
      if (accountsToSync.length === 1) throw err
    }
  }

  if (fetchedAccountCount === 0 && lastFetchError) throw lastFetchError

  console.log(`[sync] fetchNewEmails: ${Date.now() - tFetch}ms, count=${messages.length}, cap=${fetchCap}, accounts=${fetchedAccountCount}`)

  // 2) Store emails one-by-one so a single failure cannot prevent
  //    updateLastSync from running.  Promise.all would reject on the
  //    first error while earlier upserts had already committed.
  const tStore = Date.now()
  const {
    storedEmails,
    newEmailIds,
    syncedCount,
    skippedCount,
    failedCount,
  } = await storeFetchedEmails(userId, messages, syncBatchId)
  console.log(`[sync] storeEmails: ${Date.now() - tStore}ms, synced=${syncedCount}, skipped=${skippedCount}, failed=${failedCount}`)

  // Tag newly stored emails as awaiting user review when manual mode is on.
  // Also update the in-memory objects so Phase 2 passes the correct flag to processEmail.
  if (syncInfo.manualReviewMode && newEmailIds.length > 0) {
    await markStoredEmailsAwaitingReview(newEmailIds, storedEmails)
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
    quotaLimit: quotaRemaining === Infinity ? null : FREE_CLASSIFY_LIMIT,
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

    let remaining = await getClassifyRemaining(userId)
    const quotaSkippedIds: string[] = []
    let processedCount = 0

    for (const email of storedEmails) {
      try {
        const input = getStoredEmailInput(email)

        if (remaining !== Infinity && remaining <= 0) {
          const ruleResult = await processEmailRuleOnly(input)
          if (ruleResult) {
            processedCount++
          } else {
            quotaSkippedIds.push(email.id)
          }
          continue
        }

        const result = await processEmail(userId, {
          ...input,
        })
        processedCount++

        // Only count emails that actually invoked the AI classifier. Rule-based
        // pre-filter skips (spam / promotions / body-too-short) never call the
        // model, so they shouldn't burn the user's monthly quota.
        if (!result.skippedByRule) {
          await incrementClassifyUsed(userId)
          if (remaining !== Infinity) remaining = Math.max(0, remaining - 1)
        }
      } catch (err) {
        console.error(`[sync] phase2 failed to process email ${email.id}:`, err)
      }
    }

    if (quotaSkippedIds.length > 0) {
      console.log(`[sync] phase2 quota: ${quotaSkippedIds.length} email(s) skipped (free plan limit reached)`)
      // Mark them with a distinct status so:
      //   1. fixStuckEmails (filters by 'pending') won't sweep them to 'uncertain'
      //   2. UI can surface them in a dedicated banner / Unclassified tab
      // classification stays null until the user manually classifies or the
      // monthly quota frees up.
      await emailRepo.markQuotaSkipped(quotaSkippedIds)
    }

    console.log(`[sync] phase2 aiPipeline: ${Date.now() - tAI}ms, processed=${processedCount}, quotaSkipped=${quotaSkippedIds.length}`)
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
    const providerMessageId = record.providerMessageId
    try {
      const { wasCreated } = await emailRepo.storeEmail({
        userId,
        message: buildRetryMessage(record),
      })

      retriedSuccessCount++
      await failedRepo.resolveFailedEmail(userId, providerMessageId)
      console.log(`Retry resolved providerMessageId=${providerMessageId} wasCreated=${wasCreated}`)
    } catch (err) {
      retriedFailedCount++
      const reason = errorMessage(err)
      console.error(`Retry failed providerMessageId=${providerMessageId}: ${reason}`)
      try {
        await failedRepo.recordRetryFailure(userId, providerMessageId, reason)
      } catch (updateErr) {
        console.error(`Failed to update retry record providerMessageId=${providerMessageId}:`, updateErr)
      }
    }
  }

  return { retriedSuccessCount, retriedFailedCount }
}

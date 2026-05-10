/**
 * Retention Service
 *
 * Orchestrates the retention workflow:
 *   previewRetention  — reads DB + runs engine, returns counts (no writes)
 *   executeRetention  — runs engine + applies DB changes + logs the job
 *   restoreEmail      — re-fetches bodyFull from Gmail, resets status to ACTIVE
 *
 * All mutation paths are guarded by ownership checks and never touch
 * emails that the engine classifies as 'none' (protected or within window).
 */

import { differenceInDays } from 'date-fns'
import { getRetentionAction } from '@/lib/retention-engine'
import type { EmailSnapshot, PolicySnapshot } from '@/lib/retention-engine'
import * as retentionRepo from '@/repositories/retention-repo'
import * as attachmentRepo from '@/repositories/attachment-repo'
import * as emailRepo from '@/repositories/email-repo'
import { cleanupTasksForUser } from '@/services/task-cleanup-service'
import { fetchGmailMessageBody } from '@/integrations/gmail/client'
import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RetentionPreview = {
  willArchive: number
  willBeMetadataOnly: number
  willPurge: number
  attachmentsAffected: number
  /** Estimated bytes freed from attachment records */
  estimatedBytesFreed: number
  protected: number
  alreadyProcessed: number
}

export type RetentionResult = {
  jobLogId: string
  emailsArchived: number
  emailsMetaOnly: number
  emailsPurged: number
  emailsDeleted: number
  attachmentsPurged: number
  staleReviewsDismissed: number
  tasksHardDeleted: number
  tasksSoftArchived: number
  tasksPurgedFromArchive: number
  bytesFreed: bigint
  errorCount: number
}

// ---------------------------------------------------------------------------
// Batch sizes — keeps individual DB transactions manageable
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100

// ---------------------------------------------------------------------------
// Preview (read-only)
// ---------------------------------------------------------------------------

/**
 * Computes what a retention run would do for a user without writing anything.
 * Safe to call repeatedly (e.g. for the cleanup preview page).
 */
export async function previewRetention(userId: string): Promise<RetentionPreview> {
  const [policy, rules, emails] = await Promise.all([
    retentionRepo.getOrCreatePolicy(userId),
    retentionRepo.getProtectionRules(userId),
    retentionRepo.getEmailsForRetentionCheck(userId),
  ])

  const now = new Date()
  const preview: RetentionPreview = {
    willArchive: 0,
    willBeMetadataOnly: 0,
    willPurge: 0,
    attachmentsAffected: 0,
    estimatedBytesFreed: 0,
    protected: 0,
    alreadyProcessed: 0,
  }

  const metaOnlyEmailIds: string[] = []
  const purgeEmailIds: string[] = []

  for (const email of emails) {
    const result = getRetentionAction(email, policy, rules, now)
    switch (result.action) {
      case 'archive':
        preview.willArchive++
        break
      case 'metadataOnly':
        preview.willBeMetadataOnly++
        metaOnlyEmailIds.push(email.id)
        break
      case 'purge':
        preview.willPurge++
        purgeEmailIds.push(email.id)
        break
      case 'none':
        if (email.retentionStatus !== 'ACTIVE') {
          preview.alreadyProcessed++
        } else {
          preview.protected++
        }
        break
    }
  }

  // Estimate attachment impact (emails moving to METADATA_ONLY or PURGED)
  const affectedEmailIds = [...metaOnlyEmailIds, ...purgeEmailIds]
  if (affectedEmailIds.length > 0) {
    // Also include emails that will hit attachment purge threshold
    const attachmentPurgeIds = getAttachmentPurgeCandidates(emails, policy, now)
    const allAttachmentIds = [...new Set([...affectedEmailIds, ...attachmentPurgeIds])]

    const totalSize = await attachmentRepo.getTotalUnpurgedSize(allAttachmentIds)
    const attachments = await attachmentRepo.getUnpurgedAttachmentsByEmailIds(allAttachmentIds)
    preview.attachmentsAffected = attachments.length
    preview.estimatedBytesFreed = totalSize
  }

  return preview
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

/**
 * Runs the full retention pass for a user.
 * Creates a job log, processes all non-PURGED emails, then marks the job done.
 *
 * Errors on individual emails are caught and counted — they do not abort
 * the whole run.
 */
export async function executeRetention(
  userId: string,
  triggeredBy: 'cron' | 'manual'
): Promise<RetentionResult> {
  const jobLog = await retentionRepo.createJobLog(userId, triggeredBy)

  let emailsArchived = 0
  let emailsMetaOnly = 0
  let emailsPurged = 0
  let emailsDeleted = 0
  let attachmentsPurged = 0
  let staleReviewsDismissed = 0
  let tasksHardDeleted = 0
  let tasksSoftArchived = 0
  let tasksPurgedFromArchive = 0
  let bytesFreed = BigInt(0)
  let errorCount = 0
  const errors: string[] = []

  try {
    const [policy, rules, emails] = await Promise.all([
      retentionRepo.getOrCreatePolicy(userId),
      retentionRepo.getProtectionRules(userId),
      retentionRepo.getEmailsForRetentionCheck(userId),
    ])

    const now = new Date()

    // Classify every email
    const toArchive: string[] = []
    const toMetaOnly: Array<{ id: string; restorableUntil: Date }> = []
    const toPurge: string[] = []

    for (const email of emails) {
      const result = getRetentionAction(email, policy, rules, now)
      switch (result.action) {
        case 'archive':
          toArchive.push(email.id)
          break
        case 'metadataOnly':
          toMetaOnly.push({ id: email.id, restorableUntil: result.restorableUntil })
          break
        case 'purge':
          toPurge.push(email.id)
          break
        case 'none':
          break
      }
    }

    // Apply: archive
    for (const batch of chunk(toArchive, BATCH_SIZE)) {
      try {
        await retentionRepo.archiveEmails(batch, 'retention policy')
        emailsArchived += batch.length
      } catch (err) {
        errorCount++
        errors.push(`archive batch failed: ${errorMessage(err)}`)
      }
    }

    // Apply: metadata-only (clears bodyFull)
    // Per-email errors don't abort the batch — setMetadataOnly returns counts.
    for (const batch of chunk(toMetaOnly, BATCH_SIZE)) {
      try {
        const { succeeded, failed } = await retentionRepo.setMetadataOnly(batch, 'retention policy')
        emailsMetaOnly += succeeded
        if (failed.length > 0) {
          errorCount += failed.length
          for (const f of failed) errors.push(`metadataOnly ${f.id}: ${f.error}`)
        }
      } catch (err) {
        errorCount++
        errors.push(`metadataOnly batch failed: ${errorMessage(err)}`)
      }
    }

    // Apply: purge
    for (const batch of chunk(toPurge, BATCH_SIZE)) {
      try {
        await retentionRepo.purgeEmails(batch, 'retention policy')
        emailsPurged += batch.length
      } catch (err) {
        errorCount++
        errors.push(`purge batch failed: ${errorMessage(err)}`)
      }
    }

    // Apply: attachment purge (independent of email status — own threshold)
    const attachmentPurgeCandidateIds = getAttachmentPurgeCandidates(emails, policy, now)
    if (attachmentPurgeCandidateIds.length > 0) {
      const attachments = await attachmentRepo.getUnpurgedAttachmentsByEmailIds(
        attachmentPurgeCandidateIds
      )
      if (attachments.length > 0) {
        const totalSize = attachments.reduce((sum, a) => sum + a.size, 0)
        for (const batch of chunk(attachments.map((a) => a.id), BATCH_SIZE)) {
          try {
            await attachmentRepo.markAttachmentsPurged(batch)
            attachmentsPurged += batch.length
          } catch (err) {
            errorCount++
            errors.push(`attachment purge batch failed: ${errorMessage(err)}`)
          }
        }
        bytesFreed += BigInt(totalSize)
      }
    }

    // Permanently DELETE PURGED rows past the grace period (writes tombstones first)
    try {
      emailsDeleted = await retentionRepo.deleteEmailRows(userId, policy.purgeGracePeriodDays)
    } catch (err) {
      errorCount++
      errors.push(`delete email rows failed: ${errorMessage(err)}`)
    }

    // Auto-dismiss pending review emails older than the user's threshold
    try {
      staleReviewsDismissed = await emailRepo.dismissStaleReviewEmails(
        userId,
        policy.staleReviewDismissAfterDays
      )
    } catch (err) {
      errorCount++
      errors.push(`stale review dismiss failed: ${errorMessage(err)}`)
    }

    // Task cleanup: hard-delete standalone, soft-archive email-linked,
    // and hard-delete previously-archived tasks whose source emails are gone.
    try {
      const taskResult = await cleanupTasksForUser(userId, policy.taskRetainAfterDays)
      tasksHardDeleted = taskResult.hardDeleted
      tasksSoftArchived = taskResult.softArchived
      tasksPurgedFromArchive = taskResult.purgedFromArchive
    } catch (err) {
      errorCount++
      errors.push(`task cleanup failed: ${errorMessage(err)}`)
    }
  } catch (err) {
    errorCount++
    errors.push(`retention run failed: ${errorMessage(err)}`)
  }

  await retentionRepo.completeJobLog(jobLog.id, {
    emailsArchived,
    emailsMetaOnly,
    emailsPurged,
    emailsDeleted,
    attachmentsPurged,
    staleReviewsDismissed,
    tasksHardDeleted,
    tasksSoftArchived,
    tasksPurgedFromArchive,
    bytesFreed,
    errorCount,
    errors: errors.length > 0 ? errors : undefined,
  })

  return {
    jobLogId: jobLog.id,
    emailsArchived,
    emailsMetaOnly,
    emailsPurged,
    emailsDeleted,
    attachmentsPurged,
    staleReviewsDismissed,
    tasksHardDeleted,
    tasksSoftArchived,
    tasksPurgedFromArchive,
    bytesFreed,
    errorCount,
  }
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Restores a METADATA_ONLY email to ACTIVE by re-fetching bodyFull from Gmail.
 *
 * Fails with a descriptive error if:
 *  - email doesn't belong to the user
 *  - email is not in METADATA_ONLY state
 *  - restore window has expired
 *  - Gmail API call fails (token expired, message deleted, etc.)
 */
export async function restoreEmail(
  userId: string,
  emailId: string
): Promise<{ success: true; emailId: string } | { success: false; reason: string }> {
  const email = await prisma.email.findFirst({
    where: { id: emailId, userId },
    select: {
      id: true,
      gmailMessageId: true,
      retentionStatus: true,
      restorableUntil: true,
    },
  })

  if (!email) {
    return { success: false, reason: 'Email not found' }
  }

  if (email.retentionStatus !== 'METADATA_ONLY') {
    return {
      success: false,
      reason: `Email is in status ${email.retentionStatus}, only METADATA_ONLY emails can be restored`,
    }
  }

  if (email.restorableUntil && new Date() > email.restorableUntil) {
    return {
      success: false,
      reason: `Restore window expired on ${email.restorableUntil.toISOString()}`,
    }
  }

  // Re-fetch body from Gmail
  let bodyFull: string
  try {
    bodyFull = await fetchGmailMessageBody(userId, email.gmailMessageId)
  } catch (err) {
    return {
      success: false,
      reason: `Could not fetch email from Gmail: ${errorMessage(err)}`,
    }
  }

  if (!bodyFull) {
    return {
      success: false,
      reason: 'Gmail returned an empty body — the message may have been deleted from Gmail',
    }
  }

  await retentionRepo.restoreEmailBody(emailId, bodyFull)
  return { success: true, emailId }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns email IDs whose attachments are past the attachment purge threshold.
 * Operates on the already-fetched email list to avoid a second DB query.
 */
function getAttachmentPurgeCandidates(
  emails: EmailSnapshot[],
  policy: PolicySnapshot,
  now: Date
): string[] {
  return emails
    .filter((e) => {
      // Skip already-purged emails (attachments already gone)
      if (e.retentionStatus === 'PURGED') return false
      const daysSinceReceived = differenceInDays(now, e.receivedAt)
      return daysSinceReceived >= policy.attachmentPurgeAfterDays
    })
    .map((e) => e.id)
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

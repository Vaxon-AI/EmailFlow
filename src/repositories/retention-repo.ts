/**
 * Retention Repository
 *
 * DB access for: RetentionPolicy, ProtectionRule, RetentionJobLog,
 * and the email query that feeds the cleanup engine.
 */

import { prisma } from '@/lib/prisma'
import type { ProtectionRuleType, Prisma } from '@prisma/client'
import type { EmailSnapshot, PolicySnapshot, ProtectionRuleSnapshot } from '@/lib/retention-engine'

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * Fetches the user's retention policy, creating one with defaults if absent.
 * Uses upsert so concurrent calls are safe.
 */
export async function getOrCreatePolicy(userId: string): Promise<PolicySnapshot> {
  const policy = await prisma.retentionPolicy.upsert({
    where: { userId },
    create: { userId },
    update: {},
  })
  return toPolicySnapshot(policy)
}

export async function updatePolicy(
  userId: string,
  data: Partial<Omit<PolicySnapshot, never>>
): Promise<PolicySnapshot> {
  const policy = await prisma.retentionPolicy.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })
  return toPolicySnapshot(policy)
}

/** Reads raw policy row (for Settings API responses that need all fields). */
export async function getRawPolicy(userId: string) {
  return prisma.retentionPolicy.upsert({
    where: { userId },
    create: { userId },
    update: {},
  })
}

function toPolicySnapshot(row: {
  metadataOnlyAfterDays: number
  purgeAfterDays: number
  taskDoneArchiveAfterDays: number
  taskDoneMetadataOnlyAfterDays: number
  taskDoneRestoreWindowDays: number
  attachmentPurgeAfterDays: number
  purgeGracePeriodDays: number
  staleReviewDismissAfterDays: number
  taskRetainAfterDays: number
}): PolicySnapshot {
  return {
    metadataOnlyAfterDays: row.metadataOnlyAfterDays,
    purgeAfterDays: row.purgeAfterDays,
    taskDoneArchiveAfterDays: row.taskDoneArchiveAfterDays,
    taskDoneMetadataOnlyAfterDays: row.taskDoneMetadataOnlyAfterDays,
    taskDoneRestoreWindowDays: row.taskDoneRestoreWindowDays,
    attachmentPurgeAfterDays: row.attachmentPurgeAfterDays,
    purgeGracePeriodDays: row.purgeGracePeriodDays,
    staleReviewDismissAfterDays: row.staleReviewDismissAfterDays,
    taskRetainAfterDays: row.taskRetainAfterDays,
  }
}

// ---------------------------------------------------------------------------
// Protection rules
// ---------------------------------------------------------------------------

export async function getProtectionRules(userId: string): Promise<ProtectionRuleSnapshot[]> {
  const rules = await prisma.protectionRule.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  return rules.map((r) => ({ ruleType: r.ruleType, value: r.value }))
}

/** Returns full rows (including id) for the settings API. */
export async function getProtectionRulesWithIds(userId: string) {
  return prisma.protectionRule.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, ruleType: true, value: true, createdAt: true },
  })
}

export async function addProtectionRule(
  userId: string,
  ruleType: ProtectionRuleType,
  value: string
) {
  return prisma.protectionRule.create({
    data: { userId, ruleType, value: value.toLowerCase().trim() },
  })
}

export async function removeProtectionRule(userId: string, ruleId: string) {
  // Verify ownership before deleting
  return prisma.protectionRule.deleteMany({
    where: { id: ruleId, userId },
  })
}

// ---------------------------------------------------------------------------
// Emails for retention engine
// ---------------------------------------------------------------------------

/**
 * Fetches all non-PURGED emails for a user together with the data needed
 * to compute completedTaskAt, so the engine can classify each one.
 *
 * Returns EmailSnapshot objects ready for getRetentionAction().
 */
export async function getEmailsForRetentionCheck(userId: string): Promise<EmailSnapshot[]> {
  const emails = await prisma.email.findMany({
    where: {
      userId,
      retentionStatus: { not: 'PURGED' },
    },
    select: {
      id: true,
      retentionStatus: true,
      receivedAt: true,
      sender: true,
      labels: true,
      archivedAt: true,
      metadataOnlyAt: true,
      restorableUntil: true,
      taskLinks: {
        select: {
          task: {
            select: { status: true, completedAt: true },
          },
        },
      },
    },
    orderBy: { receivedAt: 'asc' },
  })

  return emails.map((email) => {
    // Resolve completedTaskAt: earliest completedAt among completed tasks
    const completedDates = email.taskLinks
      .filter((tl) => tl.task.status === 'completed' && tl.task.completedAt !== null)
      .map((tl) => tl.task.completedAt as Date)

    const completedTaskAt =
      completedDates.length > 0
        ? completedDates.reduce((earliest, d) => (d < earliest ? d : earliest))
        : null

    return {
      id: email.id,
      retentionStatus: email.retentionStatus,
      receivedAt: email.receivedAt,
      sender: email.sender,
      labels: email.labels,
      archivedAt: email.archivedAt,
      metadataOnlyAt: email.metadataOnlyAt,
      restorableUntil: email.restorableUntil,
      completedTaskAt,
    }
  })
}

// ---------------------------------------------------------------------------
// Apply retention actions (bulk DB writes)
// ---------------------------------------------------------------------------

export async function archiveEmails(emailIds: string[], reason: string) {
  if (emailIds.length === 0) return
  await prisma.email.updateMany({
    where: { id: { in: emailIds } },
    data: {
      retentionStatus: 'ARCHIVED',
      archivedAt: new Date(),
      retentionReason: reason,
    },
  })
}

/**
 * Move emails to METADATA_ONLY (clear bodyFull, set restorableUntil).
 * Per-email updates run in parallel via allSettled — one failure does not abort the rest.
 * Returns counts so the caller can attribute errors at the email level.
 */
export async function setMetadataOnly(
  emails: Array<{ id: string; restorableUntil: Date }>,
  reason: string
): Promise<{ succeeded: number; failed: Array<{ id: string; error: string }> }> {
  if (emails.length === 0) return { succeeded: 0, failed: [] }
  const now = new Date()
  const results = await Promise.allSettled(
    emails.map(({ id, restorableUntil }) =>
      prisma.email.update({
        where: { id },
        data: {
          retentionStatus: 'METADATA_ONLY',
          metadataOnlyAt: now,
          restorableUntil,
          retentionReason: reason,
          bodyFull: null,
          bodyHtml: null,
        },
      })
    )
  )
  const failed: Array<{ id: string; error: string }> = []
  let succeeded = 0
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      succeeded++
    } else {
      const err = r.reason
      failed.push({ id: emails[i].id, error: err instanceof Error ? err.message : String(err) })
    }
  })
  return { succeeded, failed }
}

export async function purgeEmails(emailIds: string[], reason: string) {
  if (emailIds.length === 0) return
  await prisma.email.updateMany({
    where: { id: { in: emailIds } },
    data: {
      retentionStatus: 'PURGED',
      purgedAt: new Date(),
      retentionReason: reason,
      // Clear all body content; providerMessageId + threadId + subject + sender stay
      bodyFull: null,
      bodyHtml: null,
      bodyPreview: '',
      classReasoning: null,
    },
  })
}

/**
 * Permanently DELETE Email rows that have been PURGED for at least gracePeriodDays.
 * Writes a DeletedEmailMarker tombstone first so future syncs skip these messages.
 * TaskEmail and Attachment rows cascade via FK onDelete.
 *
 * Returns the number of email rows deleted.
 */
export async function deleteEmailRows(userId: string, gracePeriodDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000)
  const candidates = await prisma.email.findMany({
    where: {
      userId,
      retentionStatus: 'PURGED',
      purgedAt: { lt: cutoff },
    },
    select: { id: true, accountId: true, providerMessageId: true },
  })
  if (candidates.length === 0) return 0

  await prisma.deletedEmailMarker.createMany({
    data: candidates.map((e) => ({
      userId,
      accountId: e.accountId,
      providerMessageId: e.providerMessageId,
    })),
    skipDuplicates: true,
  })

  const { count } = await prisma.email.deleteMany({
    where: { id: { in: candidates.map((e) => e.id) } },
  })
  return count
}

/**
 * Restore a METADATA_ONLY email: refetch bodyFull from Gmail and reset status.
 * The actual Gmail fetch is handled by the service layer; this only handles
 * the DB write for a successful restore.
 */
export async function restoreEmailBody(
  emailId: string,
  bodyFull: string,
  bodyHtml: string | null
) {
  return prisma.email.update({
    where: { id: emailId },
    data: {
      retentionStatus: 'ACTIVE',
      bodyFull,
      bodyHtml,
      metadataOnlyAt: null,
      restorableUntil: null,
      retentionReason: 'restored by user',
    },
  })
}

// ---------------------------------------------------------------------------
// Job logs
// ---------------------------------------------------------------------------

export async function createJobLog(userId: string, triggeredBy: 'cron' | 'manual') {
  return prisma.retentionJobLog.create({
    data: { userId, triggeredBy },
  })
}

export async function completeJobLog(
  id: string,
  stats: {
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
    errors?: Prisma.InputJsonValue
  }
) {
  return prisma.retentionJobLog.update({
    where: { id },
    data: { ...stats, completedAt: new Date() },
  })
}

export async function getRecentJobLogs(userId: string, limit = 10) {
  return prisma.retentionJobLog.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      triggeredBy: true,
      startedAt: true,
      completedAt: true,
      emailsArchived: true,
      emailsMetaOnly: true,
      emailsPurged: true,
      emailsDeleted: true,
      attachmentsPurged: true,
      staleReviewsDismissed: true,
      tasksHardDeleted: true,
      tasksSoftArchived: true,
      tasksPurgedFromArchive: true,
      bytesFreed: true,
      errorCount: true,
    },
  })
}

import { prisma } from '@/lib/prisma'
import type { EmailMessage } from '@/integrations'

// ============================================================
// Failed Email Sync Repository
// Persist, load, and resolve failed per-email store attempts
// so they can be retried in subsequent sync runs.
// ============================================================

export const MAX_RETRY_COUNT = 5
const RETRYABLE_STATUSES = ['pending', 'retrying'] as const

export interface FailedEmailRecord {
  providerMessageId: string
  threadId: string | null
  receivedAt: Date | null
  subject: string | null
  sender: string | null
}

function failedEmailSyncKey(userId: string, providerMessageId: string) {
  return { userId_providerMessageId: { userId, providerMessageId } }
}

function retryableStatusWhere(userId: string) {
  return {
    userId,
    status: { in: [...RETRYABLE_STATUSES] },
  }
}

function buildFailedEmailCreateData(
  userId: string,
  message: Pick<EmailMessage, 'providerMessageId' | 'threadId' | 'receivedAt' | 'subject' | 'sender'>,
  errorReason: string,
  now: Date,
) {
  return {
    userId,
    providerMessageId: message.providerMessageId,
    threadId: message.threadId ?? null,
    receivedAt: message.receivedAt ?? null,
    subject: message.subject ?? null,
    sender: message.sender ?? null,
    errorReason,
    retryCount: 0,
    status: 'pending' as const,
    firstFailedAt: now,
    lastFailedAt: now,
  }
}

/**
 * Record (or increment) a failed store attempt for a single email.
 * Uses upsert so the same providerMessageId is never duplicated per user.
 */
export async function recordFailedEmail(
  userId: string,
  message: Pick<EmailMessage, 'providerMessageId' | 'threadId' | 'receivedAt' | 'subject' | 'sender'>,
  errorReason: string
) {
  const now = new Date()
  await prisma.failedEmailSync.upsert({
    where: failedEmailSyncKey(userId, message.providerMessageId),
    create: buildFailedEmailCreateData(userId, message, errorReason, now),
    update: {
      errorReason,
      lastFailedAt: now,
      // Reset to pending so the next retry loop picks it up
      status: 'pending',
    },
  })
}

/**
 * Load all pending/retrying failed records for a user.
 */
export async function loadPendingFailures(userId: string) {
  return prisma.failedEmailSync.findMany({
    where: retryableStatusWhere(userId),
    orderBy: { firstFailedAt: 'asc' },
  })
}

/**
 * Mark a failed record as resolved after a successful retry.
 */
export async function resolveFailedEmail(userId: string, providerMessageId: string) {
  await prisma.failedEmailSync.update({
    where: failedEmailSyncKey(userId, providerMessageId),
    data: { status: 'resolved', resolvedAt: new Date() },
  })
}

/**
 * Record another retry failure. Advances retryCount and flips to
 * permanent_failed if the limit is reached.
 */
export async function recordRetryFailure(userId: string, providerMessageId: string, errorReason: string) {
  const record = await prisma.failedEmailSync.findUnique({
    where: failedEmailSyncKey(userId, providerMessageId),
    select: { retryCount: true },
  })
  if (!record) return

  const newRetryCount = record.retryCount + 1
  const isPermanent = newRetryCount >= MAX_RETRY_COUNT

  await prisma.failedEmailSync.update({
    where: failedEmailSyncKey(userId, providerMessageId),
    data: {
      retryCount: newRetryCount,
      errorReason,
      lastFailedAt: new Date(),
      status: isPermanent ? 'permanent_failed' : 'retrying',
    },
  })
}

/**
 * Count how many records for this user are still pending/retrying
 * (used to populate pendingFailedCount in the sync response).
 */
export async function countPendingFailures(userId: string): Promise<number> {
  return prisma.failedEmailSync.count({
    where: retryableStatusWhere(userId),
  })
}

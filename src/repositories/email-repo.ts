import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { EmailMessage } from '@/integrations'

// ============================================================
// Email Repository — all email database operations
// ============================================================

export interface StoreEmailData {
  userId: string
  message: EmailMessage
  syncBatchId?: string
}

type StoredEmailRow = NonNullable<Awaited<ReturnType<typeof prisma.email.findFirst>>>

export type StoreEmailResult =
  | { email: StoredEmailRow; wasCreated: true; tombstoned?: false }
  | { email: StoredEmailRow; wasCreated: false; tombstoned?: false }
  | { email: null; wasCreated: false; tombstoned: true }

export async function storeEmail(data: StoreEmailData): Promise<StoreEmailResult> {
  // Tombstone check: if this message was previously deleted by retention,
  // do not re-create the row. Sync paths should treat this as a skip.
  // findFirst (not findUnique) so the nullable accountId comparison works
  // — Prisma's compound unique-key generator types accountId as non-null.
  const tombstone = await prisma.deletedEmailMarker.findFirst({
    where: {
      userId: data.userId,
      accountId: data.message.accountId ?? null,
      providerMessageId: data.message.providerMessageId,
    },
    select: { id: true },
  })
  if (tombstone) {
    return { email: null, wasCreated: false, tombstoned: true }
  }

  const fields = {
    userId: data.userId,
    accountId: data.message.accountId ?? undefined,
    providerMessageId: data.message.providerMessageId,
    threadId: data.message.threadId,
    accountEmail: data.message.accountEmail ?? '',
    subject: data.message.subject,
    sender: data.message.sender,
    recipients: JSON.stringify(data.message.recipients),
    bodyPreview: data.message.bodyPreview,
    bodyFull: data.message.bodyFull,
    receivedAt: data.message.receivedAt,
    labels: JSON.stringify(data.message.labels),
    hasAttachments: data.message.hasAttachments,
    processingStatus: 'pending',
    syncBatchId: data.syncBatchId,
  }
  const existing = await prisma.email.findFirst({
    where: {
      userId: data.userId,
      accountId: data.message.accountId ?? null,
      providerMessageId: data.message.providerMessageId,
    },
  })
  if (existing) {
    return { email: existing, wasCreated: false }
  }
  const email = await prisma.email.create({ data: fields })
  return { email, wasCreated: true }
}

export async function storeEmails(userId: string, messages: EmailMessage[]) {
  const results = []
  for (const message of messages) {
    results.push(await storeEmail({ userId, message }))
  }
  return results
}

export async function updateClassification(
  emailId: string,
  classification: {
    category: string
    confidence: number
    reasoning: string
    isWorkRelated: boolean
  }
) {
  return prisma.email.update({
    where: { id: emailId },
    data: {
      classification: classification.category,
      classConfidence: classification.confidence,
      classReasoning: classification.reasoning,
      isWorkRelated: classification.isWorkRelated,
      processedAt: new Date(),
      processingStatus: 'done',
    },
  })
}

// Saves classification fields while keeping awaitingReview untouched.
// Used when an email is in manual review mode — classified, no longer pending,
// but still waiting for the user to approve task extraction.
export async function saveClassificationFields(
  emailId: string,
  classification: {
    category: string
    confidence: number
    reasoning: string
    isWorkRelated: boolean
  }
) {
  return prisma.email.update({
    where: { id: emailId },
    data: {
      classification: classification.category,
      classConfidence: classification.confidence,
      classReasoning: classification.reasoning,
      isWorkRelated: classification.isWorkRelated,
      processedAt: new Date(),
      processingStatus: 'done',
    },
  })
}

export async function markEmailsAwaitingReview(emailIds: string[]) {
  if (emailIds.length === 0) return
  return prisma.email.updateMany({
    where: { id: { in: emailIds } },
    data: { awaitingReview: true },
  })
}

export async function approveReviewEmails(emailIds: string[]) {
  if (emailIds.length === 0) return
  return prisma.email.updateMany({
    where: { id: { in: emailIds } },
    data: { awaitingReview: false },
  })
}

// User-driven "I don't want to deal with this" — equivalent to soft-delete.
// Collapses the email into the ignore bucket: classification flips to 'ignore'
// and actioned=true marks it user-handled (so dashboard counts and the
// Needs Action tab stops surfacing it). The DB row stays intact so the next
// email sync still sees the provider message ID and won't re-pull it.
export async function dismissReviewEmails(emailIds: string[]) {
  if (emailIds.length === 0) return
  return prisma.email.updateMany({
    where: { id: { in: emailIds } },
    data: {
      classification: 'ignore',
      actioned: true,
      awaitingReview: false,
    },
  })
}

// Bulk soft-delete used by the emails page batch toolbar. Same semantics as
// dismissReviewEmails but scoped by userId for safety, since this is callable
// from the batch API on arbitrary email IDs.
export async function bulkIgnoreEmails(userId: string, emailIds: string[]) {
  if (emailIds.length === 0) return { count: 0 }
  return prisma.email.updateMany({
    where: { id: { in: emailIds }, userId },
    data: {
      classification: 'ignore',
      actioned: true,
      awaitingReview: false,
    },
  })
}

// Marks one email as actioned. Called from the pipeline after a task is
// successfully created and from the manual extract-task flow.
export async function markActioned(emailId: string) {
  return prisma.email.updateMany({
    where: { id: emailId },
    data: { actioned: true },
  })
}

export async function bulkMarkActioned(userId: string, emailIds: string[]) {
  if (emailIds.length === 0) return { count: 0 }
  return prisma.email.updateMany({
    where: { id: { in: emailIds }, userId },
    data: { actioned: true },
  })
}

// User-facing bucket → (classification, actioned) translation.
// The picker on the email detail page exposes 4 buckets; each maps to a
// deterministic DB state so round-trips are predictable. `tracked` forces
// classification='action' because tracking only makes sense for actionable
// emails — if you wanted FYI, you'd pick FYI directly.
export type EmailBucket = 'needs_action' | 'tracked' | 'fyi' | 'ignored'
export type EmailTabBucket = EmailBucket | 'unclassified'
export const EMAIL_TAB_BUCKETS: EmailTabBucket[] = ['unclassified', 'needs_action', 'tracked', 'fyi', 'ignored']

function emailBucketData(bucket: EmailBucket) {
  switch (bucket) {
    case 'needs_action':
      return { classification: 'action', actioned: false, awaitingReview: false }
    case 'tracked':
      return { classification: 'action', actioned: true, awaitingReview: false }
    case 'fyi':
      return { classification: 'awareness', actioned: false, awaitingReview: false }
    case 'ignored':
      return { classification: 'ignore', actioned: false, awaitingReview: false }
  }
}

export function emailBucketWhere(bucket: EmailTabBucket): Prisma.EmailWhereInput {
  switch (bucket) {
    case 'tracked':
      return {
        OR: [
          { taskLinks: { some: {} } },
          { classification: 'action', actioned: true },
        ],
      }
    case 'needs_action':
      return {
        classification: 'action',
        actioned: false,
        taskLinks: { none: {} },
      }
    case 'fyi':
      return {
        classification: 'awareness',
        taskLinks: { none: {} },
      }
    case 'ignored':
      return {
        classification: 'ignore',
        taskLinks: { none: {} },
      }
    case 'unclassified':
      return {
        actioned: false,
        taskLinks: { none: {} },
        OR: [
          { classification: 'uncertain' },
          { classification: null },
        ],
      }
  }
}

export type EmailTabState = {
  bucket: EmailTabBucket
  totalCount: number
  newCount: number
  lastSeenAt: Date | null
}

export async function findEmailTabStates(userId: string): Promise<EmailTabState[]> {
  const seenStates = await prisma.userSurfaceSeenState.findMany({
    where: { userId, surface: 'emails', bucket: { in: EMAIL_TAB_BUCKETS } },
    select: { bucket: true, lastSeenAt: true },
  })
  const seenByBucket = new Map(seenStates.map((state) => [state.bucket, state.lastSeenAt]))

  return Promise.all(
    EMAIL_TAB_BUCKETS.map(async (bucket) => {
      const where = { userId, ...emailBucketWhere(bucket) }
      const lastSeenAt = seenByBucket.get(bucket) ?? null
      const [totalCount, newCount] = await Promise.all([
        prisma.email.count({ where }),
        bucket === 'ignored'
          ? Promise.resolve(0)
          : prisma.email.count({
              where: lastSeenAt
                ? {
                    AND: [
                      where,
                      {
                        OR: [
                          { createdAt: { gt: lastSeenAt } },
                          { updatedAt: { gt: lastSeenAt } },
                        ],
                      },
                    ],
                  }
                : where,
            }),
      ])
      return { bucket, totalCount, newCount, lastSeenAt }
    })
  )
}

export async function markEmailTabSeen(userId: string, bucket: EmailTabBucket) {
  return prisma.userSurfaceSeenState.upsert({
    where: {
      userId_surface_bucket: {
        userId,
        surface: 'emails',
        bucket,
      },
    },
    create: {
      userId,
      surface: 'emails',
      bucket,
      lastSeenAt: new Date(),
    },
    update: { lastSeenAt: new Date() },
  })
}

export async function setEmailBucket(emailId: string, bucket: EmailBucket) {
  const data = emailBucketData(bucket)
  return prisma.email.update({
    where: { id: emailId },
    data: {
      ...data,
      classConfidence: null,
      classReasoning: null,
      processingStatus: 'done',
    },
  })
}

export async function bulkSetEmailBucket(userId: string, emailIds: string[], bucket: EmailBucket) {
  if (emailIds.length === 0) return { count: 0 }
  return prisma.email.updateMany({
    where: { id: { in: emailIds }, userId },
    data: {
      ...emailBucketData(bucket),
      classConfidence: null,
      classReasoning: null,
      processingStatus: 'done',
    },
  })
}

export async function findPendingReviewEmails(userId: string) {
  return prisma.email.findMany({
    where: { userId, awaitingReview: true, classification: 'action' },
    select: {
      id: true,
      subject: true,
      sender: true,
      receivedAt: true,
      classification: true,
      classConfidence: true,
    },
    orderBy: { receivedAt: 'desc' },
  })
}

// Auto-dismisses review emails that have been sitting in the queue too long.
// Same collapse-into-ignore semantics as user-driven dismiss.
// Scoped per-user so each user's RetentionPolicy threshold applies independently;
// classification='action' filter matches getStaleReviewEmails above.
export async function dismissStaleReviewEmails(userId: string, olderThanDays: number) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
  const { count } = await prisma.email.updateMany({
    where: {
      userId,
      awaitingReview: true,
      classification: 'action',
      receivedAt: { lt: cutoff },
    },
    data: {
      classification: 'ignore',
      actioned: true,
      awaitingReview: false,
    },
  })
  return count
}

// Marks an email as having failed classification.
// Defensive guard: only updates emails whose processingStatus is still 'pending',
// so a later pipeline-step failure can never overwrite an already-saved
// classification. (Without this, a Gemini 429 in extractTask would regress
// an already-classified action email back to "uncertain — Classification failed".)
export async function markClassificationFailed(emailId: string) {
  return prisma.email.updateMany({
    where: { id: emailId, processingStatus: 'pending' },
    data: {
      classification: 'uncertain',
      classConfidence: 0,
      classReasoning: 'Classification failed - needs manual review',
      processedAt: new Date(),
      processingStatus: 'failed',
    },
  })
}

// Marks the given emails with processingStatus='quota_skipped' so the UI can
// surface them and fixStuckEmails (which filters status='pending') won't sweep
// them. classification stays null — the user can classify manually, or the
// next sync after a quota refresh can reclassify them.
export async function markQuotaSkipped(emailIds: string[]): Promise<number> {
  if (emailIds.length === 0) return 0
  const { count } = await prisma.email.updateMany({
    where: { id: { in: emailIds } },
    data: { processingStatus: 'quota_skipped' },
  })
  return count
}

// Counts emails that the AI pipeline couldn't classify because the user's
// classify quota was exhausted. Used for the Emails-page banner / tab.
export async function countQuotaSkipped(userId: string): Promise<number> {
  return prisma.email.count({
    where: { userId, processingStatus: 'quota_skipped', classification: null },
  })
}

// Counts everything the user needs to look at manually — emails that the AI
// either couldn't run on (quota_skipped) OR ran on but wasn't confident
// about (uncertain). actioned=true emails are excluded so once a user takes
// action (or links a task), they're out of this bucket. This is the count
// that drives the global header chip and the unified "Needs Review" tab.
export async function countAwaitingReview(userId: string): Promise<number> {
  return prisma.email.count({
    where: {
      userId,
      ...emailBucketWhere('unclassified'),
    },
  })
}

// Finds emails stuck in 'pending' for longer than staleAfterMs and marks them failed.
// Returns the number of emails fixed.
export async function fixStuckEmails(userId: string | null, staleAfterMs = 2 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs)
  const where = {
    processingStatus: 'pending',
    awaitingReview: false,
    createdAt: { lt: cutoff },
    ...(userId ? { userId } : {}),
  }
  const { count } = await prisma.email.updateMany({
    where,
    data: {
      classification: 'uncertain',
      classConfidence: 0,
      classReasoning: 'Classification timed out - auto-resolved',
      processedAt: new Date(),
      processingStatus: 'failed',
    },
  })
  return count
}

export async function findEmailsByClassification(
  userId: string,
  classification: string,
  dateRange: { start: Date; end: Date },
  options: { actioned?: boolean } = {}
) {
  return prisma.email.findMany({
    where: {
      userId,
      classification,
      ...(options.actioned === undefined ? {} : { actioned: options.actioned }),
      receivedAt: { gte: dateRange.start, lt: dateRange.end },
    },
    select: { subject: true, sender: true },
  })
}

export async function findActionedEmails(
  userId: string,
  dateRange: { start: Date; end: Date }
) {
  return prisma.email.findMany({
    where: {
      userId,
      actioned: true,
      receivedAt: { gte: dateRange.start, lt: dateRange.end },
    },
    select: { subject: true, sender: true },
  })
}

export async function findEmailsPaginated(
  userId: string,
  options: { page: number; limit: number; classification?: string; bucket?: EmailTabBucket }
) {
  const where: Prisma.EmailWhereInput = { userId }
  if (options.bucket) Object.assign(where, emailBucketWhere(options.bucket))
  else if (options.classification) where.classification = options.classification

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      select: {
        id: true,
        providerMessageId: true,
        subject: true,
        sender: true,
        bodyPreview: true,
        receivedAt: true,
        classification: true,
        processingStatus: true,
        actioned: true,
        accountEmail: true,
        hasAttachments: true,
        threadId: true,
        retentionStatus: true,
        restorableUntil: true,
        taskLinks: {
          select: {
            id: true,
            task: { select: { id: true, title: true, status: true, completedAt: true } },
          },
        },
      },
    }),
    prisma.email.count({ where }),
  ])

  // Enrich with project + matter from ThreadMemory (best-effort)
  try {
    const threadIds = emails.map((e) => e.threadId).filter((id): id is string => !!id)
    const ctxMap = threadIds.length
      ? await buildThreadContextMap(userId, threadIds)
      : new Map<string, { project: ProjectContext; matter: MatterTag }>()

    const enriched = emails.map((email) => {
      const ctx = email.threadId ? ctxMap.get(email.threadId) : null
      return { ...email, project: ctx?.project ?? null, matter: ctx?.matter ?? null }
    })

    return { emails: enriched, total }
  } catch (err) {
    console.error('[email-repo] enrichment failed, returning emails without project context:', err)
    return { emails, total }
  }
}

type ProjectContext = {
  id: string
  name: string
  identity: { id: string; name: string } | null
} | null

type MatterTag = { id: string; title: string } | null

async function buildThreadContextMap(userId: string, threadIds: string[]) {
  const threads = await prisma.threadMemory.findMany({
    where: { userId, threadId: { in: threadIds } },
    include: {
      matter: {
        include: {
          projectContext: { include: { identity: true } },
        },
      },
    },
  })

  return new Map(
    threads.map((t) => [
      t.threadId,
      {
        matter: t.matter ? { id: t.matter.id, title: t.matter.title } : null,
        project: t.matter?.projectContext
          ? {
              id: t.matter.projectContext.id,
              name: t.matter.projectContext.name,
              identity: t.matter.projectContext.identity
                ? { id: t.matter.projectContext.identity.id, name: t.matter.projectContext.identity.name }
                : null,
            }
          : null,
      },
    ])
  )
}

export async function findEmailById(userId: string, emailId: string) {
  const email = await prisma.email.findFirst({
    where: { id: emailId, userId },
    include: {
      taskLinks: {
        include: {
          task: {
            select: {
              id: true,
              title: true,
              summary: true,
              actionItems: true,
              checkedActionItems: true,
              status: true,
              completedAt: true,
              archivedAt: true,
              priorityScore: true,
              startDate: true,
              explicitDeadline: true,
              inferredDeadline: true,
              userSetDeadline: true,
              userNotes: true,
            },
          },
        },
      },
    },
  })

  if (!email?.threadId) return email

  try {
    const ctxMap = await buildThreadContextMap(userId, [email.threadId])
    const ctx = ctxMap.get(email.threadId)
    return { ...email, project: ctx?.project ?? null, matter: ctx?.matter ?? null }
  } catch (err) {
    console.error('[email-repo] detail enrichment failed:', err)
    return email
  }
}

export async function updateReplyDraft(userId: string, emailId: string, draft: string, generated = false) {
  const now = new Date()
  return prisma.email.updateMany({
    where: { id: emailId, userId },
    data: {
      aiReplyDraft: draft,
      aiReplyEditedAt: now,
      ...(generated ? { aiReplyGeneratedAt: now } : {}),
    },
  })
}

export async function findBatchStatus(userId: string, batchId: string) {
  const emails = await prisma.email.findMany({
    where: { userId, syncBatchId: batchId },
    select: {
      id: true,
      providerMessageId: true,
      subject: true,
      sender: true,
      receivedAt: true,
      processingStatus: true,
      classification: true,
      taskLinks: {
        select: {
          task: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { receivedAt: 'desc' },
  })

  const totalEmails = emails.length
  const pendingEmails = emails.filter((e) => e.processingStatus === 'pending').length
  const quotaSkippedEmails = emails.filter((e) => e.processingStatus === 'quota_skipped').length
  const needsActionCount = emails.filter((e) => e.classification === 'action').length
  const fyiCount = emails.filter((e) => e.classification === 'awareness').length
  const ignoredCount = emails.filter((e) => e.classification === 'ignore').length
  const uncertainCount = emails.filter((e) => e.classification === 'uncertain').length
  const classifiedEmails = emails.filter((e) =>
    e.processingStatus !== 'pending' &&
    (e.classification !== null || e.processingStatus === 'quota_skipped')
  ).length
  // A batch with 0 emails means all were skipped (already stored) — treat as complete.
  const isComplete = totalEmails === 0 || pendingEmails === 0
  const actionEmails = emails.filter((e) => e.classification === 'action')

  return {
    isComplete,
    totalEmails,
    pendingEmails,
    classifiedEmails,
    needsActionCount,
    fyiCount,
    ignoredCount,
    quotaSkippedEmails,
    uncertainCount,
    uncertainEmails: uncertainCount,
    actionEmailCount: actionEmails.length,
    // Only include email details when complete so the modal has stable data.
    actionEmails: isComplete ? actionEmails : [],
  }
}


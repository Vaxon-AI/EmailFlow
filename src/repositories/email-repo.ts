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

export async function storeEmail(data: StoreEmailData) {
  const fields = {
    userId: data.userId,
    gmailMessageId: data.message.providerMessageId,
    threadId: data.message.threadId,
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
  const existing = await prisma.email.findUnique({
    where: { gmailMessageId: data.message.providerMessageId },
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

// Saves classification fields without changing processingStatus or awaitingReview.
// Used when an email is in manual review mode — classified but not yet approved by user.
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
// Needs Review tab stop surfacing it). The DB row stays intact so the next
// Gmail sync still sees the message ID and won't re-pull it.
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
export async function dismissStaleReviewEmails(olderThanDays = 15) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
  const { count } = await prisma.email.updateMany({
    where: {
      awaitingReview: true,
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
  dateRange: { start: Date; end: Date }
) {
  return prisma.email.findMany({
    where: {
      userId,
      classification,
      receivedAt: { gte: dateRange.start, lt: dateRange.end },
    },
    select: { subject: true, sender: true },
  })
}

export async function findEmailsPaginated(
  userId: string,
  options: { page: number; limit: number; classification?: string }
) {
  const where: Prisma.EmailWhereInput = { userId }
  if (options.classification) where.classification = options.classification

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      select: {
        id: true,
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
            task: { select: { id: true, title: true, status: true } },
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
  // A batch with 0 emails means all were skipped (already stored) — treat as complete.
  const isComplete = totalEmails === 0 || pendingEmails === 0
  const actionEmails = emails.filter((e) => e.classification === 'action')

  return {
    isComplete,
    totalEmails,
    pendingEmails,
    actionEmailCount: actionEmails.length,
    // Only include email details when complete so the modal has stable data.
    actionEmails: isComplete ? actionEmails : [],
  }
}


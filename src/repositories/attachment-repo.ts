/**
 * Attachment Repository
 *
 * Manages the Attachment model for retention tracking.
 * Actual attachment files live with the email provider; purgedAt marks that this
 * local tracking record has been cleared.
 */

import { prisma } from '@/lib/prisma'

export type AttachmentInput = {
  filename: string
  mimeType: string
  size: number
  providerAttachmentId?: string
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Bulk-creates attachment records for an email.
 * Safe to call multiple times — skips existing records via skipDuplicates.
 */
export async function upsertAttachmentsForEmail(
  emailId: string,
  attachments: AttachmentInput[]
) {
  if (attachments.length === 0) return
  await prisma.attachment.createMany({
    data: attachments.map((a) => ({
      emailId,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      providerAttachmentId: a.providerAttachmentId ?? null,
    })),
    skipDuplicates: true,
  })
}

/**
 * Mark a set of attachment records as purged.
 * This signals that the user can no longer fetch them via the provider API.
 */
export async function markAttachmentsPurged(attachmentIds: string[]) {
  if (attachmentIds.length === 0) return
  await prisma.attachment.updateMany({
    where: { id: { in: attachmentIds } },
    data: { purgedAt: new Date() },
  })
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Returns un-purged attachments for a set of emails (for cleanup executor). */
export async function getUnpurgedAttachmentsByEmailIds(emailIds: string[]) {
  if (emailIds.length === 0) return []
  return prisma.attachment.findMany({
    where: {
      emailId: { in: emailIds },
      purgedAt: null,
    },
    select: { id: true, emailId: true, filename: true, size: true },
  })
}

/** Returns all attachment records (including purged) for a single email. */
export async function getAttachmentsByEmailId(emailId: string) {
  return prisma.attachment.findMany({
    where: { emailId },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      providerAttachmentId: true,
      purgedAt: true,
    },
  })
}

/**
 * Sums the size of un-purged attachments for a set of emails.
 * Used by the preview API to estimate bytes freed.
 */
export async function getTotalUnpurgedSize(emailIds: string[]): Promise<number> {
  if (emailIds.length === 0) return 0
  const result = await prisma.attachment.aggregate({
    where: {
      emailId: { in: emailIds },
      purgedAt: null,
    },
    _sum: { size: true },
  })
  return result._sum.size ?? 0
}

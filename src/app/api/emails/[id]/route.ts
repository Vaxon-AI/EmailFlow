export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { sanitizeEmailHtml } from '@/lib/sanitize-email-html'

export const GET = defineRoute(
  { tag: 'api/emails/[id] GET', message: 'Failed to load email' },
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getAuthUser()
    const { id } = await params
    const email = await emailRepo.findEmailById(user.id, id)
    if (!email) return error('NOT_FOUND', 'Email not found', 404)
    const safeEmail = email.bodyHtml
      ? { ...email, bodyHtml: sanitizeEmailHtml(email.bodyHtml) }
      : email
    return success(safeEmail)
  },
)

export const PATCH = defineRoute(
  { tag: 'api/emails/[id] PATCH', message: 'Failed to update email' },
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getAuthUser()
    const { id } = await params
    const body = await req.json()

    const existing = await emailRepo.findEmailById(user.id, id)
    if (!existing) return error('NOT_FOUND', 'Email not found', 404)

    // Bucket is the new user-facing field — preferred over raw classification.
    // Each bucket atomically sets (classification, actioned, awaitingReview)
    // so the email moves cleanly between tabs. Falls back to classification
    // for legacy callers.
    if (body.bucket) {
      const valid: emailRepo.EmailBucket[] = ['needs_action', 'tracked', 'fyi', 'ignored']
      if (!valid.includes(body.bucket)) {
        return error('BAD_REQUEST', `Invalid bucket: ${body.bucket}`, 400)
      }
      const updated = await emailRepo.setEmailBucket(id, body.bucket)
      return success(updated)
    }

    if (body.classification) {
      const legacyBucketMap: Record<string, emailRepo.EmailBucket> = {
        action: 'needs_action',
        awareness: 'fyi',
        ignore: 'ignored',
      }
      const bucket = legacyBucketMap[body.classification]
      if (!bucket) {
        return error('BAD_REQUEST', `Invalid classification: ${body.classification}`, 400)
      }
      const updated = await emailRepo.setEmailBucket(id, bucket)
      return success(updated)
    }

    return error('BAD_REQUEST', 'No valid fields to update', 400)
  },
)

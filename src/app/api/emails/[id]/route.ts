export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { defineRoute, error, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'
import { sanitizeEmailHtml } from '@/lib/sanitize-email-html'

const patchEmailBodySchema = z.object({}).catchall(z.unknown())
const EMAIL_BUCKETS: emailRepo.EmailBucket[] = ['needs_action', 'tracked', 'fyi', 'ignored']
const LEGACY_BUCKET_MAP: Record<string, emailRepo.EmailBucket> = {
  action: 'needs_action',
  awareness: 'fyi',
  ignore: 'ignored',
}

function resolveEmailBucket(body: Record<string, unknown>) {
  // Bucket is the new user-facing field — preferred over raw classification.
  // Each bucket atomically sets (classification, actioned, awaitingReview)
  // so the email moves cleanly between tabs. Falls back to classification
  // for legacy callers.
  if (typeof body.bucket === 'string' && body.bucket.length > 0) {
    if (!EMAIL_BUCKETS.includes(body.bucket as emailRepo.EmailBucket)) {
      return { errorResponse: error('BAD_REQUEST', `Invalid bucket: ${body.bucket}`, 400) }
    }
    return { bucket: body.bucket as emailRepo.EmailBucket }
  }

  if (typeof body.classification === 'string' && body.classification.length > 0) {
    const bucket = LEGACY_BUCKET_MAP[body.classification]
    if (!bucket) {
      return { errorResponse: error('BAD_REQUEST', `Invalid classification: ${body.classification}`, 400) }
    }
    return { bucket }
  }

  return { errorResponse: error('BAD_REQUEST', 'No valid fields to update', 400) }
}

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
    const body = await parseJsonBody(req, patchEmailBodySchema, {
      code: 'BAD_REQUEST',
      message: 'Invalid request body',
      status: 400,
    })

    const existing = await emailRepo.findEmailById(user.id, id)
    if (!existing) return error('NOT_FOUND', 'Email not found', 404)

    const resolution = resolveEmailBucket(body)
    if (resolution.errorResponse) return resolution.errorResponse

    const updated = await emailRepo.setEmailBucket(id, resolution.bucket)
    return success(updated)
  },
)

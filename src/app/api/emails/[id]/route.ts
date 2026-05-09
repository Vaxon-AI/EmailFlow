export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error } from '@/lib/api-helpers'
import * as emailRepo from '@/repositories/email-repo'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id } = await params
    const email = await emailRepo.findEmailById(user.id, id)
    if (!email) return error('NOT_FOUND', 'Email not found', 404)
    return success(email)
  } catch (err) {
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to load email', 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
  } catch (err) {
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to update email', 500)
  }
}

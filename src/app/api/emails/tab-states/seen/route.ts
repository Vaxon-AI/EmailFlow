export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { error, getAuthUser, success } from '@/lib/api-helpers'
import { EMAIL_TAB_BUCKETS, markEmailTabSeen, type EmailTabBucket } from '@/repositories/email-repo'

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return success({ ok: true })

  const body = await req.json().catch(() => null) as { bucket?: unknown } | null
  const bucket = typeof body?.bucket === 'string' ? body.bucket : ''
  if (!EMAIL_TAB_BUCKETS.includes(bucket as EmailTabBucket)) {
    return error('BAD_REQUEST', 'Invalid email tab bucket', 400)
  }

  await markEmailTabSeen(user.id, bucket as EmailTabBucket)
  return success({ ok: true })
}

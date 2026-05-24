export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { error, getAuthUser, success } from '@/lib/api-helpers'
import { markTaskTabSeen, TASK_TAB_BUCKETS, type TaskTabBucket } from '@/repositories/task-repo'

export async function POST(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return success({ ok: true })

  const body = await req.json().catch(() => null) as { bucket?: unknown } | null
  const bucket = typeof body?.bucket === 'string' ? body.bucket : ''
  if (!TASK_TAB_BUCKETS.includes(bucket as TaskTabBucket)) {
    return error('BAD_REQUEST', 'Invalid task tab bucket', 400)
  }

  await markTaskTabSeen(user.id, bucket as TaskTabBucket)
  return success({ ok: true })
}

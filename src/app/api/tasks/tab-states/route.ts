export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAuthUser, success } from '@/lib/api-helpers'
import { findTaskTabStates, TASK_TAB_BUCKETS } from '@/repositories/task-repo'

const EMPTY_STATES = TASK_TAB_BUCKETS.map((bucket) => ({
  bucket,
  totalCount: 0,
  newCount: 0,
  lastSeenAt: null,
}))

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ success: true, data: EMPTY_STATES })

    return success(await findTaskTabStates(user.id))
  } catch (err) {
    console.error('[api/tasks/tab-states GET]', err)
    return NextResponse.json({ success: true, data: EMPTY_STATES })
  }
}

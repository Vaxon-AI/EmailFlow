export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAuthUser, success } from '@/lib/api-helpers'
import { EMAIL_TAB_BUCKETS, findEmailTabStates } from '@/repositories/email-repo'

const EMPTY_STATES = EMAIL_TAB_BUCKETS.map((bucket) => ({
  bucket,
  totalCount: 0,
  newCount: 0,
  lastSeenAt: null,
}))

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ success: true, data: EMPTY_STATES })

    return success(await findEmailTabStates(user.id))
  } catch (err) {
    console.error('[api/emails/tab-states GET]', err)
    return NextResponse.json({ success: true, data: EMPTY_STATES })
  }
}

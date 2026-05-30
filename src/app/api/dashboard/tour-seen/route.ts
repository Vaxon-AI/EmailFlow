import { defineRoute, getAuthUser, success } from '@/lib/api-helpers'
import { hasSeen, markSeen } from '@/repositories/user-surface-seen-repo'

export const dynamic = 'force-dynamic'

export const GET = defineRoute(
  { tag: 'api/dashboard/tour-seen GET', message: 'Failed to check tour status' },
  async () => {
    const user = await getAuthUser()
    const seen = await hasSeen(user.id, 'dashboard', 'tour')
    return success({ seen })
  },
)

export const POST = defineRoute(
  { tag: 'api/dashboard/tour-seen POST', message: 'Failed to mark tour as seen' },
  async () => {
    const user = await getAuthUser()
    await markSeen(user.id, 'dashboard', 'tour')
    return success({ success: true })
  },
)

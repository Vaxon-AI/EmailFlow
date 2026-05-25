import { defineRoute, success } from '@/lib/api-helpers'
import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { revokeOtherSessions } from '@/lib/auth-sessions'

export const POST = defineRoute(
  { tag: 'api/auth/sessions/revoke-others', code: 'SYNC_FAILED', message: 'Failed to revoke sessions' },
  async () => {
    const context = await requireCurrentSessionContext()

    const count = await revokeOtherSessions(context.user.id, context.session.id)

    return success({ revokedCount: count })
  },
)

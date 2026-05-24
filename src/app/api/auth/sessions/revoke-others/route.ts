import { errorFromException, success } from '@/lib/api-helpers'
import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { revokeOtherSessions } from '@/lib/auth-sessions'

export async function POST() {
  try {
    const context = await requireCurrentSessionContext()

    const count = await revokeOtherSessions(context.user.id, context.session.id)

    return success({ revokedCount: count })
  } catch (err) {
    console.error('[api/auth/sessions/revoke-others]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to revoke sessions', 500)
  }
}

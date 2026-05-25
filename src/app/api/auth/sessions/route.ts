import { defineRoute, success } from '@/lib/api-helpers'
import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { listActiveSessions } from '@/lib/auth-sessions'

export const GET = defineRoute(
  { tag: 'api/auth/sessions', code: 'SYNC_FAILED', message: 'Failed to load sessions' },
  async () => {
    const context = await requireCurrentSessionContext()

    const sessions = await listActiveSessions(context.user.id)

    return success({
      sessions: sessions.map((session) => ({
        ...session,
        isCurrent: session.id === context.session.id,
      })),
    })
  },
)

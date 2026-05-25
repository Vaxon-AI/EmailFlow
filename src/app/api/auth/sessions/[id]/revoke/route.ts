import { defineRoute, error, success } from '@/lib/api-helpers'
import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { revokeSessionById } from '@/lib/auth-sessions'

export const POST = defineRoute(
  { tag: 'api/auth/sessions/[id]/revoke', code: 'SYNC_FAILED', message: 'Failed to revoke session' },
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const context = await requireCurrentSessionContext()

    const { id } = await params
    const revoked = await revokeSessionById(id, context.user.id)

    if (!revoked) {
      return error('NOT_FOUND', 'Session not found', 404)
    }

    return success(undefined)
  },
)

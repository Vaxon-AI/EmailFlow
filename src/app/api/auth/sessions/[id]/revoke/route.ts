import { errorFromException, success, error } from '@/lib/api-helpers'
import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { revokeSessionById } from '@/lib/auth-sessions'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await requireCurrentSessionContext()

    const { id } = await params
    const revoked = await revokeSessionById(id, context.user.id)

    if (!revoked) {
      return error('NOT_FOUND', 'Session not found', 404)
    }

    return success(undefined)
  } catch (err) {
    console.error('[api/auth/sessions/[id]/revoke]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to revoke session', 500)
  }
}

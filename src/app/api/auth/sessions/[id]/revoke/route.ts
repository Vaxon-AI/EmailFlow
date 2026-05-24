import { NextResponse } from 'next/server'

import { errorFromException } from '@/lib/api-helpers'
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
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/auth/sessions/[id]/revoke]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to revoke session', 500)
  }
}

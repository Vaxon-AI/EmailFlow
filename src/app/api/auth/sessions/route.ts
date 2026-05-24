import { NextResponse } from 'next/server'

import { errorFromException } from '@/lib/api-helpers'
import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { listActiveSessions } from '@/lib/auth-sessions'

export async function GET() {
  try {
    const context = await requireCurrentSessionContext()

    const sessions = await listActiveSessions(context.user.id)

    return NextResponse.json({
      success: true,
      data: {
        sessions: sessions.map((session) => ({
          ...session,
          isCurrent: session.id === context.session.id,
        })),
      },
    })
  } catch (err) {
    console.error('[api/auth/sessions]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to load sessions', 500)
  }
}

import { NextResponse } from 'next/server'

import { verifyToken } from '@/lib/auth-token'
import { revokeSessionById } from '@/lib/auth-sessions'

export async function POST(req: Request) {
  try {
    const { token, sessionId } = await req.json()

    if (!token || !sessionId) {
      return NextResponse.json(
        { success: false, error: 'Device limit token and session are required' },
        { status: 400 }
      )
    }

    const payload = verifyToken(token)
    if (!payload || payload.purpose !== 'device-limit') {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired device limit token' },
        { status: 401 }
      )
    }

    const revoked = await revokeSessionById(sessionId, payload.userId)
    if (!revoked) {
      return NextResponse.json(
        { success: false, error: 'Device not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/auth/device-limit/revoke]', err)
    return NextResponse.json(
      { success: false, error: 'Failed to sign out device' },
      { status: 500 }
    )
  }
}

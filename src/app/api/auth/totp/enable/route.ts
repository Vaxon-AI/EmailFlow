import { NextResponse } from 'next/server'
import { errorFromException } from '@/lib/api-helpers'
import { requireCurrentUser } from '@/lib/auth-sessions'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser()

    const { secret } = await req.json()

    if (!secret) {
      return NextResponse.json({ success: false, error: 'Missing secret' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: true,
        totpSecret: secret,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/auth/totp/enable]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to enable 2FA', 500)
  }
}

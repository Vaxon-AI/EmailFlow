import { NextRequest, NextResponse } from 'next/server'
import { errorFromException } from '@/lib/api-helpers'
import { gmailProvider } from '@/integrations'
import { requireCurrentUser } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser()
    const { accountId } = await req.json().catch(() => ({ accountId: undefined }))

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    })

    if (!fullUser?.passwordHash) {
      return NextResponse.json(
        { success: false, error: 'Please set a password before disconnecting Google' },
        { status: 400 }
      )
    }

    if (accountId && typeof accountId !== 'string') {
      return NextResponse.json({ success: false, error: 'Invalid accountId' }, { status: 400 })
    }

    await gmailProvider.disconnect(user.id, accountId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[google disconnect]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to disconnect Gmail', 500)
  }
}

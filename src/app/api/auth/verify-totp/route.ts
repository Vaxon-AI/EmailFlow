import { NextResponse } from 'next/server'
import { verify } from 'otplib'

import { verifyToken, setSessionCookie } from '@/lib/auth-token'
import { prisma } from '@/lib/prisma'
import { createUserSession } from '@/lib/auth-sessions'

export async function POST(req: Request) {
  try {
    const { tempToken, totpCode } = await req.json()

    if (!tempToken || !totpCode) {
      return NextResponse.json(
        { success: false, error: 'Verification token and code are required' },
        { status: 400 }
      )
    }

    const payload = verifyToken(tempToken)
    if (!payload || payload.purpose !== 'pre-2fa') {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired verification token' },
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        totpEnabled: true,
        totpSecret: true,
      },
    })

    if (!user || !user.totpEnabled || !user.totpSecret) {
      return NextResponse.json(
        { success: false, error: 'Two-factor authentication is not configured' },
        { status: 400 }
      )
    }

    const isValid = await verify({
      token: String(totpCode),
      secret: user.totpSecret,
    })

    if (!isValid.valid) {
      return NextResponse.json(
        { success: false, error: 'Invalid authenticator code' },
        { status: 401 }
      )
    }

    const remember = Boolean(payload.remember)
    const { rawToken, isNewDevice } = await createUserSession({
      userId: user.id,
      userEmail: user.email,
      remember,
      request: req,
    })

    await setSessionCookie(rawToken, remember)

    return NextResponse.json({
      success: true,
      isNewDevice,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (err) {
    console.error('[api/auth/verify-totp]', err)
    return NextResponse.json(
      { success: false, error: 'Verification failed' },
      { status: 500 }
    )
  }
}

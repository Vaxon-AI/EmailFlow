import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/auth-password'
import { createToken, setSessionCookie } from '@/lib/auth-token'
import { createUserSession } from '@/lib/auth-sessions'
import { isAppError } from '@/lib/app-errors'

export async function POST(req: Request) {
  try {
    const { email, password, rememberMe } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const valid = await verifyPassword(password, user.passwordHash)

    if (!valid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    if (user.totpEnabled) {
      const tempToken = createToken({
        userId: user.id,
        purpose: 'pre-2fa',
        remember: !!rememberMe,
      })

      return NextResponse.json({
        success: true,
        requiresTwoFactor: true,
        tempToken,
      })
    }

    const { rawToken, isNewDevice } = await createUserSession({
      userId: user.id,
      userEmail: user.email,
      remember: !!rememberMe,
      request: req,
    })

    await setSessionCookie(rawToken, !!rememberMe)

    return NextResponse.json({
      success: true,
      requiresTwoFactor: false,
      isNewDevice,
      data: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin },
    })
  } catch (err) {
    if (isAppError(err) && err.code === 'DEVICE_LIMIT_REACHED') {
      return NextResponse.json(
        {
          success: false,
          error: err.message,
          code: err.code,
          deviceLimitToken: createToken({
            userId: err.details?.userId as string,
            purpose: 'device-limit',
            remember: Boolean(err.details?.remember),
          }),
          data: err.details,
        },
        { status: 409 }
      )
    }
    console.error('[api/auth/login]', err)
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 }
    )
  }
}

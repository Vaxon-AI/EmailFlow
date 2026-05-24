import { NextResponse } from 'next/server'
import { findByEmail } from '@/repositories/user-repo'
import { verifyPassword } from '@/lib/auth-password'
import { createToken, setSessionCookie } from '@/lib/auth-token'
import { createUserSession } from '@/lib/auth-sessions'
import { isAppError } from '@/lib/app-errors'
import { error } from '@/lib/api-helpers'

export async function POST(req: Request) {
  try {
    const { email, password, rememberMe } = await req.json()

    if (!email || !password) {
      return error('VALIDATION_ERROR', 'Email and password are required', 400)
    }

    const user = await findByEmail(email)

    if (!user || !user.passwordHash) {
      return error('INVALID_CREDENTIALS', 'Invalid email or password', 401)
    }

    const valid = await verifyPassword(password, user.passwordHash)

    if (!valid) {
      return error('INVALID_CREDENTIALS', 'Invalid email or password', 401)
    }

    if (user.totpEnabled) {
      const tempToken = createToken({
        userId: user.id,
        purpose: 'pre-2fa',
        remember: !!rememberMe,
      })

      // Non-standard shape: requiresTwoFactor/tempToken at top level (frontend reads them directly).
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

    // Non-standard shape: requiresTwoFactor/isNewDevice at top level (frontend reads them directly).
    return NextResponse.json({
      success: true,
      requiresTwoFactor: false,
      isNewDevice,
      data: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin },
    })
  } catch (err) {
    if (isAppError(err) && err.code === 'DEVICE_LIMIT_REACHED') {
      // Non-standard shape: deviceLimitToken/code at top level (frontend reads them directly).
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
    return error('LOGIN_FAILED', 'Login failed', 500)
  }
}

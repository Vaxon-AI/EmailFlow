import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findByEmail } from '@/repositories/user-repo'
import { verifyPassword } from '@/lib/auth-password'
import { createToken, setSessionCookie } from '@/lib/auth-token'
import { createUserSession } from '@/lib/auth-sessions'
import { deviceLimitErrorResponse } from '@/lib/auth-api'
import { error, errorFromException, parseJsonBody } from '@/lib/api-helpers'

const loginSchema = z.object({
  email: z.string().min(1, 'Email and password are required'),
  password: z.string().min(1, 'Email and password are required'),
  rememberMe: z.boolean().optional(),
})

export async function POST(req: Request) {
  try {
    const { email, password, rememberMe } = await parseJsonBody(req, loginSchema, {
      code: 'VALIDATION_ERROR',
      message: 'Email and password are required',
      status: 400,
    })

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
    const deviceLimitResponse = deviceLimitErrorResponse(err)
    if (deviceLimitResponse) return deviceLimitResponse
    console.error('[api/auth/login]', err)
    return errorFromException(err, 'LOGIN_FAILED', 'Login failed', 500)
  }
}

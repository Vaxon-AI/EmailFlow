import { NextResponse } from 'next/server'
import { findByEmail, createUser } from '@/repositories/user-repo'
import { hashPassword } from '@/lib/auth-password'
import { createToken, setSessionCookie } from '@/lib/auth-token'
import { createUserSession } from '@/lib/auth-sessions'
import { isAppError } from '@/lib/app-errors'
import { getInheritedQuotaForEmail } from '@/repositories/quota-ledger-repo'
import { success, error } from '@/lib/api-helpers'

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json()

    if (!email || !password) {
      return error('VALIDATION_ERROR', 'Email and password are required', 400)
    }

    if (password.length < 8) {
      return error('VALIDATION_ERROR', 'Password must be at least 8 characters', 400)
    }

    const existing = await findByEmail(email)
    if (existing) {
      return error('EMAIL_EXISTS', 'An account with this email already exists', 409)
    }

    const passwordHash = await hashPassword(password)
    const inherited = await getInheritedQuotaForEmail(email, 'email')
    const user = await createUser({
      email,
      name: name || email.split('@')[0],
      passwordHash,
      classifyUsed: inherited.classifyUsed,
      extractUsed: inherited.extractUsed,
      pasteTextUsed: inherited.pasteTextUsed,
      quotaResetAt: inherited.quotaResetAt,
    })

    const { rawToken } = await createUserSession({
      userId: user.id,
      userEmail: user.email,
      remember: true,
      request: req,
      sendNewDeviceAlert: false,
    })
    await setSessionCookie(rawToken, true)

    return success({ id: user.id, email: user.email, name: user.name })
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
    console.error('[api/auth/register]', err)
    return error('REGISTER_FAILED', 'Registration failed', 500)
  }
}

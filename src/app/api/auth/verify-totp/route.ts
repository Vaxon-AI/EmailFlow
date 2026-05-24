import { NextResponse } from 'next/server'
import { verify } from 'otplib'

import { verifyToken, setSessionCookie, createToken } from '@/lib/auth-token'
import { createUserSession } from '@/lib/auth-sessions'
import { isAppError } from '@/lib/app-errors'
import { findForTotpVerify } from '@/repositories/user-repo'
import { error } from '@/lib/api-helpers'

export async function POST(req: Request) {
  try {
    const { tempToken, totpCode } = await req.json()

    if (!tempToken || !totpCode) {
      return error('VALIDATION_ERROR', 'Verification token and code are required', 400)
    }

    const payload = verifyToken(tempToken)
    if (!payload || payload.purpose !== 'pre-2fa') {
      return error('INVALID_TOKEN', 'Invalid or expired verification token', 401)
    }

    const user = await findForTotpVerify(payload.userId)

    if (!user || !user.totpEnabled || !user.totpSecret) {
      return error('VALIDATION_ERROR', 'Two-factor authentication is not configured', 400)
    }

    const isValid = await verify({
      token: String(totpCode),
      secret: user.totpSecret,
    })

    if (!isValid.valid) {
      return error('INVALID_CREDENTIALS', 'Invalid authenticator code', 401)
    }

    const remember = Boolean(payload.remember)
    const { rawToken, isNewDevice } = await createUserSession({
      userId: user.id,
      userEmail: user.email,
      remember,
      request: req,
    })

    await setSessionCookie(rawToken, remember)

    // Non-standard shape: isNewDevice at top level (frontend reads it directly).
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
    console.error('[api/auth/verify-totp]', err)
    return error('SYNC_FAILED', 'Verification failed', 500)
  }
}

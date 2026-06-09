import { NextResponse } from 'next/server'
import { verify } from 'otplib'
import { z } from 'zod'

import { verifyToken, setSessionCookie } from '@/lib/auth-token'
import { createUserSession } from '@/lib/auth-sessions'
import { deviceLimitErrorResponse } from '@/lib/auth-api'
import { error, errorFromException, parseJsonBody } from '@/lib/api-helpers'
import { findForTotpVerify } from '@/repositories/user-repo'

const verifyTotpSchema = z.object({
  tempToken: z.string().min(1, 'Verification token and code are required'),
  totpCode: z.union([z.string(), z.number()]),
})

export async function POST(req: Request) {
  try {
    const { tempToken, totpCode } = await parseJsonBody(req, verifyTotpSchema, {
      code: 'VALIDATION_ERROR',
      message: 'Verification token and code are required',
      status: 400,
    })

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
        isAdmin: user.isAdmin,
      },
    })
  } catch (err) {
    const deviceLimitResponse = deviceLimitErrorResponse(err)
    if (deviceLimitResponse) return deviceLimitResponse
    console.error('[api/auth/verify-totp]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Verification failed', 500)
  }
}

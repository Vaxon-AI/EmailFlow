import { NextResponse } from 'next/server'
import { createToken } from '@/lib/auth-token'
import { isAppError } from '@/lib/app-errors'

export function deviceLimitErrorResponse(err: unknown): NextResponse | null {
  if (!isAppError(err) || err.code !== 'DEVICE_LIMIT_REACHED') {
    return null
  }

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
    { status: 409 },
  )
}

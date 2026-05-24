import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/auth-session'
import { AppError, isAppError } from '@/lib/app-errors'
import type { ApiResponse } from '@/types'
import type { AppErrorCode } from '@/lib/app-errors'
import type { ZodType } from 'zod'
import { ZodError } from 'zod'

export function success<T>(data: T, meta?: ApiResponse['meta']): NextResponse {
  return NextResponse.json({ success: true, data, meta })
}

export function error(code: string, message: string, status: number = 400): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

export async function getAuthUser() {
  return requireCurrentUser()
}

export async function parseJsonBody<T>(
  req: Request,
  schema: ZodType<T>,
  options: {
    code?: AppErrorCode
    message?: string
    status?: number
  } = {},
): Promise<T> {
  const {
    code = 'BAD_REQUEST',
    message = 'Invalid request body',
    status = 400,
  } = options

  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new AppError(code, message, status)
  }

  try {
    return schema.parse(body)
  } catch (err) {
    if (err instanceof ZodError) {
      const firstIssue = err.issues[0]
      throw new AppError(code, firstIssue?.message || message, status)
    }
    throw err
  }
}

export function errorFromException(
  err: unknown,
  fallbackCode: string = 'SYNC_FAILED',
  fallbackMessage: string = 'Request failed',
  fallbackStatus: number = 500,
) {
  if (isAppError(err)) {
    return error(err.code, err.message, err.status)
  }

  if (err instanceof AppError) {
    return error(err.code, err.message, err.status)
  }

  return error(fallbackCode, fallbackMessage, fallbackStatus)
}

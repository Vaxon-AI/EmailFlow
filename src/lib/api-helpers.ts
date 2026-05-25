import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/auth-sessions'
import { AppError, isAppError } from '@/lib/app-errors'
import type { ApiResponse } from '@/types'
import type { AppErrorCode } from '@/lib/app-errors'
import type { ZodType } from 'zod'
import { ZodError } from 'zod'

type ParseJsonBodyOptions = {
  code?: AppErrorCode
  message?: string
  status?: number
}

function resolveParseOptions(options: ParseJsonBodyOptions) {
  return {
    code: options.code ?? 'BAD_REQUEST',
    message: options.message ?? 'Invalid request body',
    status: options.status ?? 400,
  }
}

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
  options: ParseJsonBodyOptions = {},
): Promise<T> {
  const { code, message, status } = resolveParseOptions(options)

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

export function requireCronAuth(req: Request): NextResponse | null {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return error('UNAUTHORIZED', 'Unauthorized', 401)
  }
  return null
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

  return error(fallbackCode, fallbackMessage, fallbackStatus)
}

type DefineRouteOptions = {
  tag: string
  code?: string
  message?: string
  status?: number
}

// Wraps a route handler with the standard try/catch + console.error +
// errorFromException pattern used across the API. `tag` is the log prefix
// (e.g. 'api/tasks GET'); `code`/`message`/`status` are the fallback error
// values when the thrown error is not an AppError.
export function defineRoute<TArgs extends unknown[]>(
  options: DefineRouteOptions,
  handler: (...args: TArgs) => Promise<NextResponse>,
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args)
    } catch (err) {
      console.error(`[${options.tag}]`, err)
      return errorFromException(
        err,
        options.code ?? 'INTERNAL_ERROR',
        options.message ?? 'Request failed',
        options.status ?? 500,
      )
    }
  }
}

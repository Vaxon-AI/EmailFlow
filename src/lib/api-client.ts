'use client'

export class ApiClientError extends Error {
  readonly code?: string
  readonly status: number

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
  }
}

export const SESSION_FAILURE_CODES = new Set([
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'SESSION_INACTIVE_EXPIRED',
])

export function isSessionFailureCode(code?: string | null) {
  return Boolean(code && SESSION_FAILURE_CODES.has(code))
}

/**
 * Extracts a user-facing error message from an API response payload, handling
 * both the legacy `{ error: 'string' }` shape and the new `{ error: { code, message } }`
 * shape from `success()`/`error()` helpers in `src/lib/api-helpers.ts`.
 */
export function getErrorMessage(payload: unknown, fallback = 'Request failed'): string {
  if (!payload || typeof payload !== 'object') return fallback
  const errorField = (payload as { error?: unknown }).error
  if (typeof errorField === 'string') return errorField || fallback
  if (errorField && typeof errorField === 'object') {
    const message = (errorField as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

export async function readApiClientError(response: Response): Promise<ApiClientError> {
  let payload: unknown = null

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  const wrapped = payload as
    | { error?: { code?: string; message?: string } | string; message?: string }
    | null
    | undefined
  const errorCode = typeof wrapped?.error === 'object' ? wrapped.error?.code : undefined
  const errorMessage =
    (typeof wrapped?.error === 'object' && wrapped.error?.message) ||
    (typeof wrapped?.error === 'string' ? wrapped.error : undefined) ||
    wrapped?.message ||
    'Request failed'

  return new ApiClientError(errorMessage, response.status, errorCode)
}

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

type MutateJsonOptions = {
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  fallbackMessage?: string
}

// Wraps the standard mutation fetch pattern:
//   - serialise body as JSON when present
//   - parse response as JSON
//   - throw a user-facing Error built from getErrorMessage on !res.ok
// Returns the raw response JSON; callers can pick `.data` themselves if needed.
export async function mutateJson<T = unknown>(
  url: string,
  options: MutateJsonOptions = {},
): Promise<T> {
  const hasBody = options.body !== undefined
  const res = await fetch(url, {
    method: options.method ?? 'POST',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(getErrorMessage(json, options.fallbackMessage ?? 'Request failed'))
  }
  return json as T
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

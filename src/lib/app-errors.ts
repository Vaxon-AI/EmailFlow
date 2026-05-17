export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'SESSION_INACTIVE_EXPIRED'
  | 'DEVICE_LIMIT_REACHED'
  | 'PROVIDER_REAUTH_REQUIRED'
  | 'OAUTH_REFRESH_FAILED'
  | 'LINK_EXPIRED'
  | 'CODE_EXPIRED'
  | 'VALIDATION_ERROR'
  | 'SYNC_TEMPORARY_ERROR'
  | 'SYNC_FAILED'
  | 'EMAIL_SEND_FAILED'

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: AppErrorCode, message: string, status = 400, details?: Record<string, unknown>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

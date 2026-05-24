/**
 * Client-side helpers for the step-up authentication flow.
 *
 * Usage:
 *   1. const { method } = await requestStepUp('change_password')
 *   2. Show UI for TOTP or email OTP input
 *   3. const { stepUpToken } = await verifyStepUp('change_password', code)
 *   4. Pass stepUpToken to the guarded endpoint
 */

export type StepUpAction = 'change_password' | 'disable_totp' | 'delete_account' | 'run_cleanup'

type ApiSuccessResponse<T> = {
  success: true
  data: T
}

type ApiFailureResponse = {
  success: false
  error: unknown
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailureResponse

/**
 * Extracts a human-readable message from an API error payload.
 * Handles both shapes the API can return:
 *   - a plain string (validation errors)
 *   - an object { code, message } (errorFromException)
 * Never returns "[object Object]".
 */
function apiErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string }
    return e.message ?? e.code ?? fallback
  }
  return fallback
}

async function postStepUpRequest<T>(
  url: string,
  body: Record<string, string>,
  fallbackMessage: string,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json() as ApiResponse<T>
  if (!json.success) throw new Error(apiErrorMessage(json.error, fallbackMessage))
  return json.data
}

export async function requestStepUp(action: StepUpAction): Promise<{ method: 'totp' | 'email' }> {
  return postStepUpRequest<{ method: 'totp' | 'email' }>(
    '/api/auth/step-up/request',
    { action },
    'Failed to start verification',
  )
}

export async function verifyStepUp(action: StepUpAction, code: string): Promise<string> {
  const data = await postStepUpRequest<{ stepUpToken: string }>(
    '/api/auth/step-up/verify',
    { action, code },
    'Verification failed',
  )
  return data.stepUpToken
}

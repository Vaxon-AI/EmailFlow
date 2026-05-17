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

export async function requestStepUp(action: StepUpAction): Promise<{ method: 'totp' | 'email' }> {
  const res = await fetch('/api/auth/step-up/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(apiErrorMessage(json.error, 'Failed to start verification'))
  return json.data as { method: 'totp' | 'email' }
}

export async function verifyStepUp(action: StepUpAction, code: string): Promise<string> {
  const res = await fetch('/api/auth/step-up/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, code }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(apiErrorMessage(json.error, 'Verification failed'))
  return (json.data as { stepUpToken: string }).stepUpToken
}

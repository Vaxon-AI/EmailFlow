import { requireCurrentUser } from '@/lib/auth-sessions'
import { errorFromException, error as apiError, success } from '@/lib/api-helpers'
import { verifyStepUp, type StepUpAction } from '@/lib/step-up-auth'

const VALID_ACTIONS: StepUpAction[] = ['change_password', 'disable_totp', 'delete_account']

/**
 * POST /api/auth/step-up/verify
 * Body: { action: StepUpAction, code: string }
 *
 * Verifies the TOTP code or email OTP and returns a short-lived step-up token.
 * The client must include this token in the subsequent sensitive operation request.
 */
export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser()

    const body = await req.json()
    const { action, code } = body as { action: StepUpAction; code: string }

    if (!action || !VALID_ACTIONS.includes(action)) {
      return apiError('VALIDATION_ERROR', 'Invalid action', 400)
    }

    if (!code || typeof code !== 'string') {
      return apiError('VALIDATION_ERROR', 'Verification code is required', 400)
    }

    const stepUpToken = await verifyStepUp(user.id, code.trim(), action)

    return success({ stepUpToken })
  } catch (err) {
    console.error('[api/auth/step-up/verify]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Verification failed', 500)
  }
}

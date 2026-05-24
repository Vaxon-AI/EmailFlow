import { errorFromException, error as apiError, success } from '@/lib/api-helpers'
import { requireCurrentUser } from '@/lib/auth-sessions'
import { requestStepUp, type StepUpAction } from '@/lib/step-up-auth'

const VALID_ACTIONS: StepUpAction[] = ['change_password', 'disable_totp', 'delete_account']

/**
 * POST /api/auth/step-up/request
 * Body: { action: StepUpAction }
 *
 * Returns { method: 'totp' | 'email' }.
 * For 'email', an OTP is sent to the user's address.
 */
export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser()

    const body = await req.json()
    const action = body?.action as StepUpAction

    if (!action || !VALID_ACTIONS.includes(action)) {
      return apiError('VALIDATION_ERROR', 'Invalid action', 400)
    }

    const { method } = await requestStepUp(user.id, action)

    return success({ method })
  } catch (err) {
    console.error('[api/auth/step-up/request]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to initiate verification', 500)
  }
}

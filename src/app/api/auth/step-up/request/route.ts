import { z } from 'zod'
import { errorFromException, success, parseJsonBody } from '@/lib/api-helpers'
import { requireCurrentUser } from '@/lib/auth-sessions'
import { requestStepUp } from '@/lib/step-up-auth'

const stepUpRequestSchema = z.object({
  action: z.enum(['change_password', 'disable_totp', 'delete_account'], 'Invalid action'),
})

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

    const { action } = await parseJsonBody(req, stepUpRequestSchema, {
      code: 'VALIDATION_ERROR',
    })

    const { method } = await requestStepUp(user.id, action)

    return success({ method })
  } catch (err) {
    console.error('[api/auth/step-up/request]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to initiate verification', 500)
  }
}

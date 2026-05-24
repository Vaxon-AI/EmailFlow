import { z } from 'zod'
import { requireCurrentUser } from '@/lib/auth-sessions'
import { errorFromException, success, parseJsonBody } from '@/lib/api-helpers'
import { verifyStepUp } from '@/lib/step-up-auth'

const stepUpVerifySchema = z.object({
  action: z.enum(['change_password', 'disable_totp', 'delete_account'], 'Invalid action'),
  code: z.string().min(1, 'Verification code is required'),
})

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

    const { action, code } = await parseJsonBody(req, stepUpVerifySchema, {
      code: 'VALIDATION_ERROR',
    })

    const stepUpToken = await verifyStepUp(user.id, code.trim(), action)

    return success({ stepUpToken })
  } catch (err) {
    console.error('[api/auth/step-up/verify]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Verification failed', 500)
  }
}

import { z } from 'zod'
import { requireCurrentUser } from '@/lib/auth-sessions'
import { defineRoute, parseJsonBody, success } from '@/lib/api-helpers'
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
export const POST = defineRoute(
  { tag: 'api/auth/step-up/verify', code: 'SYNC_FAILED', message: 'Verification failed' },
  async (req: Request) => {
    const user = await requireCurrentUser()

    const { action, code } = await parseJsonBody(req, stepUpVerifySchema, {
      code: 'VALIDATION_ERROR',
    })

    const stepUpToken = await verifyStepUp(user.id, code.trim(), action)

    return success({ stepUpToken })
  },
)

import { z } from 'zod'
import { defineRoute, parseJsonBody, success } from '@/lib/api-helpers'
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
export const POST = defineRoute(
  { tag: 'api/auth/step-up/request', code: 'SYNC_FAILED', message: 'Failed to initiate verification' },
  async (req: Request) => {
    const user = await requireCurrentUser()

    const { action } = await parseJsonBody(req, stepUpRequestSchema, {
      code: 'VALIDATION_ERROR',
    })

    const { method } = await requestStepUp(user.id, action)

    return success({ method })
  },
)

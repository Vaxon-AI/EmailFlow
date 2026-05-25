import { z } from 'zod'
import { defineRoute, error, parseJsonBody, success } from '@/lib/api-helpers'
import { requireCurrentUser } from '@/lib/auth-sessions'
import { findTotpEnabled, disableTotp } from '@/repositories/user-repo'
import { consumeStepUpToken } from '@/lib/step-up-auth'

const disableTotpSchema = z.object({
  stepUpToken: z.string().min(1, 'stepUpToken is required'),
})

/**
 * POST /api/auth/totp/disable
 * Body: { stepUpToken: string }
 *
 * Disables TOTP / 2FA on the user's account.
 * Requires a step-up token with action='disable_totp'.
 *
 * Note: because the user already has TOTP enabled, the step-up challenge
 * will ask for a TOTP code — this confirms the user still has access to
 * their authenticator app before removing it.
 */
export const POST = defineRoute(
  { tag: 'api/auth/totp/disable', code: 'SYNC_FAILED', message: 'Failed to disable 2FA' },
  async (req: Request) => {
    const user = await requireCurrentUser()

    const { stepUpToken } = await parseJsonBody(req, disableTotpSchema, {
      code: 'VALIDATION_ERROR',
    })

    await consumeStepUpToken(user.id, stepUpToken, 'disable_totp')

    const dbUser = await findTotpEnabled(user.id)

    if (!dbUser?.totpEnabled) {
      return error('VALIDATION_ERROR', '2FA is not currently enabled', 400)
    }

    await disableTotp(user.id)

    return success(undefined)
  },
)

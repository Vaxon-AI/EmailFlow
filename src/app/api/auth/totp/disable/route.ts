import { z } from 'zod'
import { errorFromException, success, error, parseJsonBody } from '@/lib/api-helpers'
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
export async function POST(req: Request) {
  try {
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
  } catch (err) {
    console.error('[api/auth/totp/disable]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to disable 2FA', 500)
  }
}

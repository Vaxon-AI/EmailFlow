import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { errorFromException, success, error } from '@/lib/api-helpers'
import { findPasswordHash, setPasswordHash } from '@/repositories/user-repo'
import { hashPassword, verifyPassword } from '@/lib/auth-password'
import { consumeStepUpToken } from '@/lib/step-up-auth'
import { revokeOtherSessions } from '@/lib/auth-sessions'

/**
 * POST /api/auth/change-password
 * Body: { currentPassword: string, newPassword: string, stepUpToken: string }
 *
 * Requirements:
 *  - Authenticated session
 *  - Valid step-up token (obtained via /api/auth/step-up/verify with action='change_password')
 *  - currentPassword must match the stored hash
 *  - newPassword must be >= 8 characters and different from the current password
 *
 * On success: updates the password and revokes all OTHER active sessions
 * (the current session stays active so the user is not immediately logged out).
 */
export async function POST(req: Request) {
  try {
    const context = await requireCurrentSessionContext()

    const { userId } = context.session
    const body = await req.json()
    const { currentPassword, newPassword, stepUpToken } = body as {
      currentPassword?: string
      newPassword?: string
      stepUpToken?: string
    }

    if (!currentPassword || !newPassword || !stepUpToken) {
      return error('VALIDATION_ERROR', 'currentPassword, newPassword, and stepUpToken are required', 400)
    }

    // Validate step-up token first
    await consumeStepUpToken(userId, stepUpToken, 'change_password')

    const user = await findPasswordHash(userId)

    if (!user?.passwordHash) {
      return error('VALIDATION_ERROR', 'This account does not use a password', 400)
    }

    const currentValid = await verifyPassword(currentPassword, user.passwordHash)
    if (!currentValid) {
      return error('VALIDATION_ERROR', 'Current password is incorrect', 401)
    }

    if (newPassword.length < 8) {
      return error('VALIDATION_ERROR', 'New password must be at least 8 characters', 400)
    }

    const sameAsOld = await verifyPassword(newPassword, user.passwordHash)
    if (sameAsOld) {
      return error('VALIDATION_ERROR', 'New password must be different from the current password', 400)
    }

    const newHash = await hashPassword(newPassword)

    await setPasswordHash(userId, newHash)

    // Revoke all other sessions so stolen sessions are invalidated after a password change
    await revokeOtherSessions(userId, context.session.id)

    return success(undefined)
  } catch (err) {
    console.error('[api/auth/change-password]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to change password', 500)
  }
}

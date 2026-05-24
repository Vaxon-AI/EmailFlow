import { AppError } from '@/lib/app-errors'
import { getSessionToken, setSessionCookie } from '@/lib/auth-token'
import { rotateSessionToken, requireSessionToken } from '@/lib/auth-sessions'
import { errorFromException, success } from '@/lib/api-helpers'

/**
 * POST /api/auth/refresh
 *
 * Rotates the current session token:
 *  - Reads the session cookie
 *  - Validates it
 *  - Generates a new token, stores oldHash in `previousTokenHash`
 *  - Sets the new token as the session cookie
 *
 * The old token remains valid for ROTATION_GRACE_PERIOD_MS (30 s) so that
 * in-flight concurrent requests don't get logged out during rotation.
 *
 * If the old token is replayed after the grace window, auth-sessions.ts treats
 * it as a possible session hijack: revokes all sessions and sends an alert email.
 */
export async function POST() {
  try {
    const oldToken = await getSessionToken()
    if (!oldToken) {
      throw new AppError('UNAUTHORIZED', 'Authentication required.', 401)
    }
    const context = await requireSessionToken(oldToken)

    const result = await rotateSessionToken(oldToken)

    if (!result) {
      // Either already rotated concurrently (ok) or session became invalid mid-flight
      // Return 200 so the client doesn't retry aggressively
      return success({ rotated: false })
    }

    await setSessionCookie(result.newRawToken, context.session.remember)

    return success({ rotated: true })
  } catch (err) {
    console.error('[api/auth/refresh]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Refresh failed', 500)
  }
}

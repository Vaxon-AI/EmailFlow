import { z } from 'zod'
import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { defineRoute, error as apiError, parseJsonBody, success } from '@/lib/api-helpers'
import { clearSessionCookie } from '@/lib/auth-token'
import { deleteUserWithQuotaSnapshot } from '@/repositories/user-repo'

const CONFIRMATION_PHRASE = 'delete my account'

const deleteAccountSchema = z.object({
  confirmation: z.string().optional(),
})

/**
 * DELETE /api/auth/account
 * Body: { confirmation: string }
 *
 * Permanently deletes the authenticated user's account and all associated data.
 * The caller must type the exact phrase "delete my account" to confirm — this is
 * a destructive-action confirmation, not re-authentication. The session itself is
 * the auth boundary (requireCurrentSessionContext); userId is taken from the
 * session and the body userId is ignored (IDOR-safe).
 *
 * Cascade deletes are configured on the User model in the Prisma schema,
 * so all related records (sessions, emails, tasks, memories, etc.) are removed
 * automatically.
 */
export const DELETE = defineRoute(
  { tag: 'api/auth/account', code: 'SYNC_FAILED', message: 'Failed to delete account' },
  async (req: Request) => {
    const context = await requireCurrentSessionContext()

    const { userId } = context.session
    const { confirmation } = await parseJsonBody(req, deleteAccountSchema)

    if (
      typeof confirmation !== 'string' ||
      confirmation.trim().toLowerCase() !== CONFIRMATION_PHRASE
    ) {
      return apiError(
        'VALIDATION_ERROR',
        'Please type "delete my account" to confirm.',
        400,
      )
    }

    // Snapshot quota usage into the persistent ledger so that re-registering
    // with the same email (or rebinding the same Gmail OAuth address) does not
    // reset the free-tier limits. Snapshot and delete share a transaction so
    // we never end up with one without the other.
    await deleteUserWithQuotaSnapshot(userId)

    // Clear the session cookie so the browser doesn't hold a dangling token
    await clearSessionCookie()

    return success(undefined)
  },
)

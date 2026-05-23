import { NextResponse } from 'next/server'
import { requireCurrentSessionContext } from '@/lib/auth-session'
import { errorFromException, error as apiError } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { clearSessionCookie } from '@/lib/auth-token'
import { snapshotForUser } from '@/repositories/quota-ledger-repo'

const CONFIRMATION_PHRASE = 'delete my account'

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
export async function DELETE(req: Request) {
  try {
    const context = await requireCurrentSessionContext()

    const { userId } = context.session
    const body = await req.json()
    const { confirmation } = body as { confirmation?: string }

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
    await prisma.$transaction(async (tx) => {
      await snapshotForUser(userId, tx)
      // cascade removes sessions, emails, tasks, digests, and per-user memory
      // tables (see schema onDelete: Cascade).
      await tx.user.delete({ where: { id: userId } })
    })

    // Clear the session cookie so the browser doesn't hold a dangling token
    await clearSessionCookie()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/auth/account]', err)
    return errorFromException(err, 'SYNC_FAILED', 'Failed to delete account', 500)
  }
}

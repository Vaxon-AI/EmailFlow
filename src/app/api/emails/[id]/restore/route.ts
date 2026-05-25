/**
 * POST /api/emails/[id]/restore
 *
 * Restores the body of a METADATA_ONLY email by re-fetching it from the email provider.
 * Fails if:
 *  - Email doesn't belong to the authenticated user
 *  - Email is not in METADATA_ONLY status
 *  - The restore window has expired
 *  - The email provider cannot return the message (deleted, token invalid, etc.)
 */

import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import { restoreEmail } from '@/services/retention-service'

export const dynamic = 'force-dynamic'

export const POST = defineRoute(
  { tag: 'api/emails/[id]/restore POST', code: 'RESTORE_FAILED', message: 'Failed to restore email' },
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getAuthUser()
    const { id: emailId } = await params

    const result = await restoreEmail(user.id, emailId)

    if (!result.success) {
      return error('RESTORE_FAILED', result.reason, 400)
    }

    return success({ restored: true, emailId: result.emailId })
  },
)

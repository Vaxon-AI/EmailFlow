/**
 * GET /api/cleanup/preview
 *
 * Returns a dry-run summary of what the next retention pass would do for
 * the authenticated user. Read-only — no emails are modified.
 */

import { defineRoute, getAuthUser, success } from '@/lib/api-helpers'
import { previewRetention } from '@/services/retention-service'

export const dynamic = 'force-dynamic'

export const GET = defineRoute(
  { tag: 'api/cleanup/preview GET', code: 'PREVIEW_FAILED', message: 'Failed to compute cleanup preview' },
  async () => {
    const user = await getAuthUser()
    const preview = await previewRetention(user.id)
    return success(preview)
  },
)

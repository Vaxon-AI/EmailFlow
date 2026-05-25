export const dynamic = 'force-dynamic'

import { defineRoute, getAuthUser, success } from '@/lib/api-helpers'
import { countAwaitingReview } from '@/repositories/email-repo'

// Returns the combined count of emails the user needs to look at manually:
// quota_skipped (AI never ran) + uncertain (AI wasn't confident) — both
// scoped to actioned=false. Powers the global header chip.
export const GET = defineRoute(
  { tag: 'api/emails/unclassified-count GET', message: 'Failed to load unclassified count' },
  async () => {
    const user = await getAuthUser()
    const count = await countAwaitingReview(user.id)
    return success({ count })
  },
)

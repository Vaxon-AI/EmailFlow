export const dynamic = 'force-dynamic'

import { errorFromException, getAuthUser, success } from '@/lib/api-helpers'
import { countAwaitingReview } from '@/repositories/email-repo'

// Returns the combined count of emails the user needs to look at manually:
// quota_skipped (AI never ran) + uncertain (AI wasn't confident) — both
// scoped to actioned=false. Powers the global header chip.
export async function GET() {
  try {
    const user = await getAuthUser()
    const count = await countAwaitingReview(user.id)
    return success({ count })
  } catch (err) {
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to load unclassified count', 500)
  }
}

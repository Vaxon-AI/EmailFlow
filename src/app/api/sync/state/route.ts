export const dynamic = 'force-dynamic'

import { errorFromException, getAuthUser, success } from '@/lib/api-helpers'
import { findSyncStateFields } from '@/repositories/user-repo'
import { classifySyncState } from '@/lib/sync-state'

// Returns the user's sync recency state so the Header sync button can decide:
//   fresh  → skip modal, run incremental sync directly
//   stale  → open the "welcome back" modal with stale-aware presets
//   never  → first-time setup modal
export async function GET() {
  try {
    const user = await getAuthUser()
    const u = await findSyncStateFields(user.id)

    return success({
      state: classifySyncState(u?.lastSyncAt ?? null),
      syncStartDate: u?.syncStartDate?.toISOString() ?? null,
    })
  } catch (err) {
    console.error('[api/sync/state GET]', err)
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to load sync state', 500)
  }
}

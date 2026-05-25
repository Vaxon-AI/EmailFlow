export const dynamic = 'force-dynamic'

import { defineRoute, getAuthUser, success } from '@/lib/api-helpers'
import { findSyncStateFields } from '@/repositories/user-repo'
import { classifySyncState } from '@/lib/sync-state'

// Returns the user's sync recency state so the Header sync button can decide:
//   fresh  → skip modal, run incremental sync directly
//   stale  → open the "welcome back" modal with stale-aware presets
//   never  → first-time setup modal
export const GET = defineRoute(
  { tag: 'api/sync/state GET', message: 'Failed to load sync state' },
  async () => {
    const user = await getAuthUser()
    const u = await findSyncStateFields(user.id)

    return success({
      state: classifySyncState(u?.lastSyncAt ?? null),
      syncStartDate: u?.syncStartDate?.toISOString() ?? null,
    })
  },
)

import { defineRoute, getAuthUser, success } from '@/lib/api-helpers'
import { setHasSeenSyncSetup } from '@/repositories/user-repo'

// Marks the current user as having seen the first-time sync setup dialog.
// After this, the Google OAuth callback stops appending ?gmail_connected=1
// to subsequent dashboard redirects, so the dialog won't pop up on every login.
export const POST = defineRoute(
  { tag: 'api/settings/sync-setup-seen POST', code: 'UPDATE_FAILED', message: 'Failed to mark sync setup seen' },
  async () => {
    const user = await getAuthUser()
    await setHasSeenSyncSetup(user.id)
    return success({ hasSeenSyncSetup: true })
  },
)

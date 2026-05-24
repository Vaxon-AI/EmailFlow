import { getAuthUser, errorFromException, success } from '@/lib/api-helpers'
import { setHasSeenSyncSetup } from '@/repositories/user-repo'

// Marks the current user as having seen the first-time sync setup dialog.
// After this, the Google OAuth callback stops appending ?gmail_connected=1
// to subsequent dashboard redirects, so the dialog won't pop up on every login.
export async function POST() {
  try {
    const user = await getAuthUser()
    await setHasSeenSyncSetup(user.id)
    return success({ hasSeenSyncSetup: true })
  } catch (err) {
    return errorFromException(err, 'UPDATE_FAILED', 'Failed to mark sync setup seen', 500)
  }
}

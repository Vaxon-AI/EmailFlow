import { success } from '@/lib/api-helpers'
import { clearSessionCookie, getSessionToken } from '@/lib/auth-token'
import { revokeSessionByToken } from '@/lib/auth-sessions'

export async function POST() {
  try {
    const token = await getSessionToken()
    await revokeSessionByToken(token)
    await clearSessionCookie()
    return success(undefined)
  } catch (err) {
    console.error('[api/auth/logout]', err)
    return success(undefined)
  }
}

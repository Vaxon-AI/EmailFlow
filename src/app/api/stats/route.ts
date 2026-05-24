export const dynamic = "force-dynamic"
import { getAuthUser, success } from '@/lib/api-helpers'
import * as statsRepo from '@/repositories/stats-repo'

const EMPTY_STATS = {
  emails: { total: 0, action: 0, awareness: 0, ignore: 0, uncertain: 0, unclassified: 0 },
  tasks: { total: 0, pending: 0, active: 0, completed: 0 },
  sync: {
    lastSyncAt: null,
    emailConnected: false,
    syncEnabled: false,
    providerReauthRequired: false,
    providerReauthReason: null,
    providerReauthAt: null,
    providerReauthProvider: null,
  },
}

export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return success(EMPTY_STATS)

    const stats = await statsRepo.getDashboardStats(user.id)
    return success(stats)
  } catch (err) {
    console.error('[api/stats GET]', err)
    return success(EMPTY_STATS)
  }
}

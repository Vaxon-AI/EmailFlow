export const dynamic = "force-dynamic"
import { defineRoute, getAuthUser, success } from '@/lib/api-helpers'
import { getQuotaStatus } from '@/lib/quota'

export const GET = defineRoute(
  { tag: 'api/settings/quota GET', message: 'Failed to fetch quota' },
  async () => {
    const user = await getAuthUser()
    const quota = await getQuotaStatus(user.id)
    return success(quota)
  },
)

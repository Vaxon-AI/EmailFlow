export const dynamic = "force-dynamic"
import { errorFromException, getAuthUser, success } from '@/lib/api-helpers'
import { getQuotaStatus } from '@/lib/quota'

export async function GET() {
  try {
    const user = await getAuthUser()
    const quota = await getQuotaStatus(user.id)
    return success(quota)
  } catch (err) {
    return errorFromException(err, 'INTERNAL_ERROR', 'Failed to fetch quota', 500)
  }
}

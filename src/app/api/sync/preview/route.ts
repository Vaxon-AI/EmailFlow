export const dynamic = 'force-dynamic'

import { error, errorFromException, getAuthUser, success } from '@/lib/api-helpers'
import { gmailProvider } from '@/integrations'
import { getClassifyRemaining } from '@/lib/quota'

// Read-only preview of how many emails a sync window would consume from the
// user's monthly classification quota. The dashboard's first-login dialog calls
// this for each preset (7/15/30 days) plus any custom date the user picks, so
// they can pick a window that fits the free-plan cap instead of guessing.
//
// Accepts ?days=N (preset) or ?since=ISO_DATE (custom). Single Gmail API call
// (resultSizeEstimate, no body fetch). The actual fetch behavior is unchanged
// — non-Primary mail still gets stored but skipped by pre-filter, so this
// number is the AI quota burn estimate, not the total mail count.
export async function GET(req: Request) {
  try {
    const user = await getAuthUser()
    const url = new URL(req.url)
    const daysParam = url.searchParams.get('days')
    const sinceParam = url.searchParams.get('since')

    let since: Date
    if (sinceParam) {
      since = new Date(sinceParam)
      if (Number.isNaN(since.getTime()) || since.getTime() > Date.now()) {
        return error('INVALID_INPUT', 'since must be a valid past date (ISO 8601)', 400)
      }
    } else {
      const days = Number(daysParam ?? 7)
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return error('INVALID_INPUT', 'days must be an integer between 1 and 365', 400)
      }
      since = new Date(Date.now() - days * 86_400_000)
    }

    const [{ quotaImpactCount }, quotaRemaining] = await Promise.all([
      gmailProvider.previewCount(user.id, { since }),
      getClassifyRemaining(user.id),
    ])

    const remaining = quotaRemaining === Infinity ? null : quotaRemaining

    return success({
      since: since.toISOString(),
      quotaImpactCount,
      quotaRemaining: remaining,
      wouldExceedQuota: remaining !== null && quotaImpactCount > remaining,
    })
  } catch (err) {
    return errorFromException(err, 'SYNC_PREVIEW_FAILED', 'Failed to preview sync window', 500)
  }
}

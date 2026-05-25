/**
 * GET /api/cleanup/logs
 *
 * Returns recent retention job logs for the authenticated user.
 * Query param: ?limit=10 (default 10, max 50)
 */

import { defineRoute, getAuthUser, success } from '@/lib/api-helpers'
import * as retentionRepo from '@/repositories/retention-repo'

export const dynamic = 'force-dynamic'

export const GET = defineRoute(
  { tag: 'api/cleanup/logs GET', code: 'FETCH_FAILED', message: 'Failed to fetch cleanup logs' },
  async (req: Request) => {
    const user = await getAuthUser()
    const { searchParams } = new URL(req.url)
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '10')))
    const logs = await retentionRepo.getRecentJobLogs(user.id, limit)
    // Convert BigInt to string for JSON serialisation
    const serialisable = logs.map((log) => ({
      ...log,
      bytesFreed: log.bytesFreed.toString(),
    }))
    return success(serialisable)
  },
)

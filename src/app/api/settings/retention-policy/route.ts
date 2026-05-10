/**
 * GET  /api/settings/retention-policy  — fetch current policy (auto-creates defaults)
 * POST /api/settings/retention-policy  — update one or more policy fields
 */

import { getAuthUser, success, error, errorFromException } from '@/lib/api-helpers'
import * as retentionRepo from '@/repositories/retention-repo'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getAuthUser()
    const policy = await retentionRepo.getRawPolicy(user.id)
    return success(policy)
  } catch (err) {
    return errorFromException(err, 'FETCH_FAILED', 'Failed to fetch retention policy', 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const body = await req.json()

    const allowed = [
      'metadataOnlyAfterDays',
      'purgeAfterDays',
      'purgeGracePeriodDays',
      'taskDoneArchiveAfterDays',
      'taskDoneMetadataOnlyAfterDays',
      'taskDoneRestoreWindowDays',
      'attachmentPurgeAfterDays',
      'staleReviewDismissAfterDays',
      'taskRetainAfterDays',
    ] as const

    const TASK_RETAIN_OPTIONS = [7, 14, 30, 60]

    // Validate: only allow known fields, all must be positive integers
    const updates: Record<string, number> = {}
    for (const key of allowed) {
      if (key in body) {
        const val = Number(body[key])
        if (!Number.isInteger(val) || val < 0) {
          return error('INVALID_INPUT', `${key} must be a non-negative integer`, 400)
        }
        if (key === 'taskRetainAfterDays' && !TASK_RETAIN_OPTIONS.includes(val)) {
          return error('INVALID_INPUT', `taskRetainAfterDays must be one of ${TASK_RETAIN_OPTIONS.join(', ')}`, 400)
        }
        updates[key] = val
      }
    }

    if (Object.keys(updates).length === 0) {
      return error('INVALID_INPUT', 'No valid fields provided', 400)
    }

    const policy = await retentionRepo.updatePolicy(user.id, updates)
    return success(policy)
  } catch (err) {
    return errorFromException(err, 'UPDATE_FAILED', 'Failed to update retention policy', 500)
  }
}

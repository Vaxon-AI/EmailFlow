/**
 * GET  /api/settings/retention-policy  — fetch current policy (auto-creates defaults)
 * POST /api/settings/retention-policy  — update one or more policy fields
 */

import { getAuthUser, success, error, errorFromException, parseJsonBody } from '@/lib/api-helpers'
import * as retentionRepo from '@/repositories/retention-repo'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const TASK_RETAIN_OPTIONS = [7, 14, 30, 60] as const
const nonNegativeInt = (field: string) =>
  z.number({ message: `${field} must be a non-negative integer` })
    .int(`${field} must be a non-negative integer`)
    .min(0, `${field} must be a non-negative integer`)

const retentionPolicySchema = z.object({
  metadataOnlyAfterDays: nonNegativeInt('metadataOnlyAfterDays').optional(),
  purgeAfterDays: nonNegativeInt('purgeAfterDays').optional(),
  purgeGracePeriodDays: nonNegativeInt('purgeGracePeriodDays').optional(),
  taskDoneArchiveAfterDays: nonNegativeInt('taskDoneArchiveAfterDays').optional(),
  taskDoneMetadataOnlyAfterDays: nonNegativeInt('taskDoneMetadataOnlyAfterDays').optional(),
  taskDoneRestoreWindowDays: nonNegativeInt('taskDoneRestoreWindowDays').optional(),
  attachmentPurgeAfterDays: nonNegativeInt('attachmentPurgeAfterDays').optional(),
  staleReviewDismissAfterDays: nonNegativeInt('staleReviewDismissAfterDays').optional(),
  taskRetainAfterDays: nonNegativeInt('taskRetainAfterDays')
    .refine(
      (value) => TASK_RETAIN_OPTIONS.includes(value as (typeof TASK_RETAIN_OPTIONS)[number]),
      `taskRetainAfterDays must be one of ${TASK_RETAIN_OPTIONS.join(', ')}`,
    )
    .optional(),
})

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
    const updates = await parseJsonBody(req, retentionPolicySchema, {
      code: 'INVALID_INPUT',
    })

    if (Object.keys(updates).length === 0) {
      return error('INVALID_INPUT', 'No valid fields provided', 400)
    }

    const policy = await retentionRepo.updatePolicy(user.id, updates)
    return success(policy)
  } catch (err) {
    return errorFromException(err, 'UPDATE_FAILED', 'Failed to update retention policy', 500)
  }
}

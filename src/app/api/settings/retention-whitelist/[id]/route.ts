/**
 * DELETE /api/settings/retention-whitelist/[id]  — remove a protection rule
 */

import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import * as retentionRepo from '@/repositories/retention-repo'

export const dynamic = 'force-dynamic'

export const DELETE = defineRoute(
  { tag: 'api/settings/retention-whitelist/[id] DELETE', code: 'DELETE_FAILED', message: 'Failed to delete whitelist rule' },
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getAuthUser()
    const { id } = await params
    const result = await retentionRepo.removeProtectionRule(user.id, id)
    if (result.count === 0) {
      return error('NOT_FOUND', 'Rule not found', 404)
    }
    return success({ deleted: true })
  },
)

export const dynamic = "force-dynamic"
import { NextRequest } from 'next/server'
import { defineRoute, getAuthUser, success } from '@/lib/api-helpers'
import { findBatchStatus } from '@/repositories/email-repo'

export const GET = defineRoute(
  { tag: 'api/sync/batch GET failed', code: 'BATCH_STATUS_FAILED', message: 'Failed to get batch status' },
  async (_req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) => {
    const user = await getAuthUser()
    const { batchId } = await params
    const status = await findBatchStatus(user.id, batchId)
    return success(status)
  },
)

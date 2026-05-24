export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { errorFromException, getAuthUser, success, error, parseJsonBody } from '@/lib/api-helpers'
import * as identityRepo from '@/repositories/identity-repo'
import { z } from 'zod'

const renameIdentitySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser()
    const { id } = await params
    const { name } = await parseJsonBody(req, renameIdentitySchema)

    const existing = await identityRepo.findById(id)
    if (!existing || existing.userId !== user.id) return error('NOT_FOUND', 'Identity not found', 404)

    const updated = await identityRepo.confirmIdentity(id, { name })
    return success(updated)
  } catch (err) {
    console.error('[api/identities/[id] PATCH]', err)
    return errorFromException(err, 'INTERNAL', 'Failed to rename identity', 500)
  }
}

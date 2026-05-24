import { errorFromException, getAuthUser, success, parseJsonBody } from '@/lib/api-helpers'
import * as identityRepo from '@/repositories/identity-repo'
import { z } from 'zod'

const createIdentitySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().optional(),
})

export async function GET() {
  try {
    const user = await getAuthUser()

    const identities = await identityRepo.findAllForUser(user.id)
    return success(identities)
  } catch (err) {
    console.error('[api/identities GET]', err)
    return errorFromException(err, 'INTERNAL', 'Failed to load identities', 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const { name, description } = await parseJsonBody(req, createIdentitySchema)

    const identity = await identityRepo.createSuggestion(user.id, {
      name,
      description: description?.trim() || null,
    })
    return success(identity)
  } catch (err) {
    console.error('[api/identities POST]', err)
    return errorFromException(err, 'INTERNAL', 'Failed to create identity', 500)
  }
}

import { defineRoute, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
import * as identityRepo from '@/repositories/identity-repo'
import { z } from 'zod'

const createIdentitySchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().optional(),
})

export const GET = defineRoute(
  { tag: 'api/identities GET', code: 'INTERNAL', message: 'Failed to load identities' },
  async () => {
    const user = await getAuthUser()

    const identities = await identityRepo.findAllForUser(user.id)
    return success(identities)
  },
)

export const POST = defineRoute(
  { tag: 'api/identities POST', code: 'INTERNAL', message: 'Failed to create identity' },
  async (req: Request) => {
    const user = await getAuthUser()
    const { name, description } = await parseJsonBody(req, createIdentitySchema)

    const identity = await identityRepo.createSuggestion(user.id, {
      name,
      description: description?.trim() || null,
    })
    return success(identity)
  },
)

import { defineRoute, getAuthUser, parseJsonBody, success } from '@/lib/api-helpers'
import * as projectContextRepo from '@/repositories/project-context-repo'
import { z } from 'zod'

const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  identityId: z.string().nullish(),
  description: z.string().nullish(),
})

export const GET = defineRoute(
  { tag: 'api/projects GET', code: 'INTERNAL', message: 'Failed to load projects' },
  async () => {
    const user = await getAuthUser()

    const projects = await projectContextRepo.findAllForUser(user.id)
    return success(projects)
  },
)

export const POST = defineRoute(
  { tag: 'api/projects POST', code: 'INTERNAL', message: 'Failed to create project' },
  async (req: Request) => {
    const user = await getAuthUser()
    const { name, identityId, description } = await parseJsonBody(req, createProjectSchema, {
      code: 'BAD_REQUEST',
    })

    const project = await projectContextRepo.createSuggestion(user.id, {
      name,
      identityId: identityId || null,
      description: description?.trim() || null,
    })
    return success(project)
  },
)

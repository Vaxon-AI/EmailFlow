import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import * as projectContextRepo from '@/repositories/project-context-repo'

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

    const { name, identityId, description } = await req.json()
    if (!name?.trim()) return error('BAD_REQUEST', 'Name is required', 400)

    const project = await projectContextRepo.createSuggestion(user.id, {
      name: name.trim(),
      identityId: identityId || null,
      description: description?.trim() || null,
    })
    return success(project)
  },
)

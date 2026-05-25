export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { defineRoute, error, getAuthUser, success } from '@/lib/api-helpers'
import * as projectContextRepo from '@/repositories/project-context-repo'

export const PATCH = defineRoute(
  { tag: 'api/projects/[id] PATCH', code: 'INTERNAL', message: 'Failed to rename project' },
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getAuthUser()
    const { id } = await params
    const { name } = await req.json()

    if (!name?.trim()) return error('BAD_REQUEST', 'Name is required', 400)

    const existing = await projectContextRepo.findById(id)
    if (!existing || existing.userId !== user.id) return error('NOT_FOUND', 'Project not found', 404)

    const updated = await projectContextRepo.confirmProject(id, { name: name.trim() })
    return success(updated)
  },
)

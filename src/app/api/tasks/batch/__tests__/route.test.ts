import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('@/services/project-matter-service', () => ({
  ensureMatterForProject: vi.fn(),
}))

vi.mock('@/repositories/task-repo', () => ({
  deleteManyTasks: vi.fn(),
}))

vi.mock('@/repositories/stats-repo', () => ({
  invalidateStatsCache: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { ensureMatterForProject } from '@/services/project-matter-service'
import * as taskRepo from '@/repositories/task-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockTaskUpdateMany = vi.mocked(prisma.task.updateMany)
const mockEnsureMatterForProject = vi.mocked(ensureMatterForProject)
const mockDeleteManyTasks = vi.mocked(taskRepo.deleteManyTasks)
const mockInvalidateStatsCache = vi.mocked(invalidateStatsCache)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/tasks/batch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/tasks/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
    mockTaskUpdateMany.mockResolvedValue({ count: 2 } as never)
    mockDeleteManyTasks.mockResolvedValue(undefined as never)
  })

  it('returns 400 when ids is empty', async () => {
    const res = await POST(postRequest({ ids: [], action: 'complete' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when action is missing', async () => {
    const res = await POST(postRequest({ ids: ['task-1'] }))
    expect(res.status).toBe(400)
  })

  it('marks tasks as completed with completedAt timestamp', async () => {
    const res = await POST(postRequest({ ids: ['task-1', 'task-2'], action: 'complete' }))

    expect(mockTaskUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['task-1', 'task-2'] }, userId: 'user-1' },
      data: expect.objectContaining({ status: 'completed', completedAt: expect.any(Date) }),
    })
    expect(mockInvalidateStatsCache).toHaveBeenCalledWith('user-1')
    expect(res.status).toBe(200)
    expect((await res.json()).data.affected).toBe(2)
  })

  it('marks tasks as active with activeAt timestamp', async () => {
    const res = await POST(postRequest({ ids: ['task-1'], action: 'activate' }))

    expect(mockTaskUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['task-1'] }, userId: 'user-1' },
      data: expect.objectContaining({ status: 'active', activeAt: expect.any(Date), dismissedAt: null }),
    })
    expect(res.status).toBe(200)
  })

  it('deletes tasks via repository', async () => {
    const res = await POST(postRequest({ ids: ['task-1', 'task-2'], action: 'delete' }))

    expect(mockDeleteManyTasks).toHaveBeenCalledWith(['task-1', 'task-2'], 'user-1')
    expect(res.status).toBe(200)
  })

  it('returns 400 when reassign is missing projectId', async () => {
    const res = await POST(postRequest({ ids: ['task-1'], action: 'reassign' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when project not found for reassign', async () => {
    mockEnsureMatterForProject.mockResolvedValue(null)

    const res = await POST(postRequest({ ids: ['task-1'], action: 'reassign', projectId: 'proj-404' }))

    expect(res.status).toBe(404)
  })

  it('reassigns tasks to project matter', async () => {
    mockEnsureMatterForProject.mockResolvedValue({ id: 'matter-1', projectName: 'Alpha' } as never)

    const res = await POST(postRequest({ ids: ['task-1', 'task-2'], action: 'reassign', projectId: 'proj-1' }))

    expect(mockTaskUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['task-1', 'task-2'] }, userId: 'user-1' },
      data: { matterId: 'matter-1' },
    })
    expect(res.status).toBe(200)
  })

  it('returns 400 for unknown action', async () => {
    const res = await POST(postRequest({ ids: ['task-1'], action: 'archive' }))
    expect(res.status).toBe(400)
  })
})

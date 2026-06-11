import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/services/project-matter-service', () => ({
  ensureMatterForProject: vi.fn(),
}))

vi.mock('@/repositories/task-repo', () => ({
  deleteManyTasks: vi.fn(),
  bulkComplete: vi.fn(),
  bulkActivate: vi.fn(),
  bulkSetMatter: vi.fn(),
}))

vi.mock('@/repositories/stats-repo', () => ({
  invalidateStatsCache: vi.fn(),
}))

vi.mock('@/services/task-matter-sync-service', () => ({
  syncThreadMattersForTasks: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import { ensureMatterForProject } from '@/services/project-matter-service'
import * as taskRepo from '@/repositories/task-repo'
import { invalidateStatsCache } from '@/repositories/stats-repo'
import { syncThreadMattersForTasks } from '@/services/task-matter-sync-service'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockEnsureMatterForProject = vi.mocked(ensureMatterForProject)
const mockDeleteManyTasks = vi.mocked(taskRepo.deleteManyTasks)
const mockBulkComplete = vi.mocked(taskRepo.bulkComplete)
const mockBulkActivate = vi.mocked(taskRepo.bulkActivate)
const mockBulkSetMatter = vi.mocked(taskRepo.bulkSetMatter)
const mockInvalidateStatsCache = vi.mocked(invalidateStatsCache)
const mockSyncThreadMatters = vi.mocked(syncThreadMattersForTasks)

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
    mockBulkComplete.mockResolvedValue({ count: 2 } as never)
    mockBulkActivate.mockResolvedValue({ count: 2 } as never)
    mockBulkSetMatter.mockResolvedValue({ count: 2 } as never)
    mockDeleteManyTasks.mockResolvedValue(undefined as never)
    mockSyncThreadMatters.mockResolvedValue({ affectedThreads: 1 })
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

    expect(mockBulkComplete).toHaveBeenCalledWith('user-1', ['task-1', 'task-2'], expect.any(Date))
    expect(mockInvalidateStatsCache).toHaveBeenCalledWith('user-1')
    expect(mockSyncThreadMatters).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect((await res.json()).data.affected).toBe(2)
  })

  it('marks tasks as active with activeAt timestamp', async () => {
    const res = await POST(postRequest({ ids: ['task-1'], action: 'activate' }))

    expect(mockBulkActivate).toHaveBeenCalledWith('user-1', ['task-1'], expect.any(Date))
    expect(res.status).toBe(200)
  })

  it('deletes tasks via repository', async () => {
    const res = await POST(postRequest({ ids: ['task-1', 'task-2'], action: 'delete' }))

    expect(mockDeleteManyTasks).toHaveBeenCalledWith(['task-1', 'task-2'], 'user-1')
    expect(mockSyncThreadMatters).not.toHaveBeenCalled()
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

    expect(mockBulkSetMatter).toHaveBeenCalledWith('user-1', ['task-1', 'task-2'], 'matter-1')
    expect(mockSyncThreadMatters).toHaveBeenCalledWith({
      userId: 'user-1',
      taskIds: ['task-1', 'task-2'],
      matterId: 'matter-1',
      projectName: 'Alpha',
    })
    expect(res.status).toBe(200)
  })

  it('returns 400 for unknown action', async () => {
    const res = await POST(postRequest({ ids: ['task-1'], action: 'archive' }))
    expect(res.status).toBe(400)
  })
})

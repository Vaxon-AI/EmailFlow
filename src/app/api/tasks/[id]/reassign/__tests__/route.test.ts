import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/repositories/task-repo', () => ({
  findTaskOwnedBy: vi.fn(),
  setMatter: vi.fn(),
}))

vi.mock('@/services/project-matter-service', () => ({
  ensureMatterForProject: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import { findTaskOwnedBy, setMatter } from '@/repositories/task-repo'
import { ensureMatterForProject } from '@/services/project-matter-service'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockFindTaskOwnedBy = vi.mocked(findTaskOwnedBy)
const mockSetMatter = vi.mocked(setMatter)
const mockEnsureMatterForProject = vi.mocked(ensureMatterForProject)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/tasks/task-1/reassign', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/tasks/[id]/reassign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 400 when projectId is missing', async () => {
    const res = await POST(postRequest({}), { params: Promise.resolve({ id: 'task-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 when task does not exist', async () => {
    mockFindTaskOwnedBy.mockResolvedValueOnce(null)

    const res = await POST(postRequest({ projectId: 'proj-1' }), { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
  })

  it('returns 404 when project does not belong to user', async () => {
    mockFindTaskOwnedBy.mockResolvedValueOnce({ id: 'task-1' } as never)
    mockEnsureMatterForProject.mockResolvedValue(null)

    const res = await POST(postRequest({ projectId: 'proj-404' }), { params: Promise.resolve({ id: 'task-1' }) })

    expect(res.status).toBe(404)
  })

  it('reassigns task to existing matter', async () => {
    mockFindTaskOwnedBy.mockResolvedValueOnce({ id: 'task-1' } as never)
    mockEnsureMatterForProject.mockResolvedValue({ id: 'matter-1', projectName: 'Alpha' } as never)
    mockSetMatter.mockResolvedValue({} as never)

    const res = await POST(postRequest({ projectId: 'proj-1' }), { params: Promise.resolve({ id: 'task-1' }) })

    expect(mockSetMatter).toHaveBeenCalledWith('user-1', 'task-1', 'matter-1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.taskId).toBe('task-1')
    expect(body.data.matterId).toBe('matter-1')
  })

  it('uses ensured matter id from the shared service', async () => {
    mockFindTaskOwnedBy.mockResolvedValueOnce({ id: 'task-1' } as never)
    mockEnsureMatterForProject.mockResolvedValue({ id: 'matter-new', projectName: 'Alpha' } as never)
    mockSetMatter.mockResolvedValue({} as never)

    const res = await POST(postRequest({ projectId: 'proj-1' }), { params: Promise.resolve({ id: 'task-1' }) })

    expect(mockEnsureMatterForProject).toHaveBeenCalledWith('user-1', 'proj-1')
    expect(res.status).toBe(200)
    expect((await res.json()).data.matterId).toBe('matter-new')
  })
})

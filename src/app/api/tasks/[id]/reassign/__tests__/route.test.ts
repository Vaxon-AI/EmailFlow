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
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    projectContext: {
      findFirst: vi.fn(),
    },
    matterMemory: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockTask = vi.mocked(prisma.task)
const mockProjectContext = vi.mocked(prisma.projectContext)
const mockMatterMemory = vi.mocked(prisma.matterMemory)

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
    mockTask.findFirst.mockResolvedValueOnce(null)
    mockProjectContext.findFirst.mockResolvedValue({ id: 'proj-1', name: 'Alpha' } as never)

    const res = await POST(postRequest({ projectId: 'proj-1' }), { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
  })

  it('returns 404 when project does not belong to user', async () => {
    mockTask.findFirst.mockResolvedValueOnce({ id: 'task-1' } as never)
    mockProjectContext.findFirst.mockResolvedValue(null)

    const res = await POST(postRequest({ projectId: 'proj-404' }), { params: Promise.resolve({ id: 'task-1' }) })

    expect(res.status).toBe(404)
  })

  it('reassigns task to existing matter', async () => {
    mockTask.findFirst.mockResolvedValueOnce({ id: 'task-1' } as never)
    mockProjectContext.findFirst.mockResolvedValue({ id: 'proj-1', name: 'Alpha' } as never)
    mockMatterMemory.findFirst.mockResolvedValue({ id: 'matter-1' } as never)
    mockTask.update.mockResolvedValue({} as never)

    const res = await POST(postRequest({ projectId: 'proj-1' }), { params: Promise.resolve({ id: 'task-1' }) })

    expect(mockMatterMemory.create).not.toHaveBeenCalled()
    expect(mockTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { matterId: 'matter-1' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.taskId).toBe('task-1')
    expect(body.data.matterId).toBe('matter-1')
  })

  it('creates matter when none exists for the project', async () => {
    mockTask.findFirst.mockResolvedValueOnce({ id: 'task-1' } as never)
    mockProjectContext.findFirst.mockResolvedValue({ id: 'proj-1', name: 'Alpha' } as never)
    mockMatterMemory.findFirst.mockResolvedValue(null)
    mockMatterMemory.create.mockResolvedValue({ id: 'matter-new' } as never)
    mockTask.update.mockResolvedValue({} as never)

    const res = await POST(postRequest({ projectId: 'proj-1' }), { params: Promise.resolve({ id: 'task-1' }) })

    expect(mockMatterMemory.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        projectContextId: 'proj-1',
        title: 'Alpha',
        summary: 'Manually assigned to this project',
        status: 'open',
        topic: 'other',
      },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).data.matterId).toBe('matter-new')
  })
})

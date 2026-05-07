import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/lib/quota', () => ({
  getExtractRemaining: vi.fn(),
  incrementExtractUsed: vi.fn(),
  FREE_EXTRACT_LIMIT: 10,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectContext: {
      findFirst: vi.fn(),
    },
    matterMemory: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    task: {
      create: vi.fn(),
    },
    taskEmail: {
      create: vi.fn(),
    },
  },
}))

import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockProjectContext = vi.mocked(prisma.projectContext)
const mockMatterMemory = vi.mocked(prisma.matterMemory)
const mockTask = vi.mocked(prisma.task)
const mockTaskEmail = vi.mocked(prisma.taskEmail)

function postRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/emails/create-task', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/emails/create-task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', plan: 'pro' } as never)
    mockTask.create.mockResolvedValue({ id: 'task-1', title: 'T' } as never)
    mockTaskEmail.create.mockResolvedValue({} as never)
  })

  it('returns 400 when title or sourceEmailId is missing', async () => {
    expect((await POST(postRequest({ sourceEmailId: 'e1' }))).status).toBe(400)
    expect((await POST(postRequest({ title: 'T' }))).status).toBe(400)
  })

  it('creates task without matter when no projectId is provided', async () => {
    await POST(postRequest({ title: 'T', sourceEmailId: 'e1' }))

    expect(mockProjectContext.findFirst).not.toHaveBeenCalled()
    expect(mockMatterMemory.create).not.toHaveBeenCalled()
    expect(mockTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ matterId: undefined }),
    }))
  })

  it('creates a matter and links the task when a valid projectId is provided', async () => {
    mockProjectContext.findFirst.mockResolvedValue({ id: 'p1', name: 'Project A' } as never)
    mockMatterMemory.findFirst.mockResolvedValue(null)
    mockMatterMemory.create.mockResolvedValue({ id: 'matter-1' } as never)

    await POST(postRequest({ title: 'T', sourceEmailId: 'e1', projectId: 'p1' }))

    expect(mockProjectContext.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', userId: 'user-1' },
    })
    expect(mockMatterMemory.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        projectContextId: 'p1',
        title: 'Project A',
        summary: 'Manually assigned to this project',
        status: 'open',
        topic: 'other',
      },
    })
    expect(mockTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ matterId: 'matter-1' }),
    }))
  })

  it('reuses an existing matter for the project instead of creating one', async () => {
    mockProjectContext.findFirst.mockResolvedValue({ id: 'p1', name: 'Project A' } as never)
    mockMatterMemory.findFirst.mockResolvedValue({ id: 'matter-existing' } as never)

    await POST(postRequest({ title: 'T', sourceEmailId: 'e1', projectId: 'p1' }))

    expect(mockMatterMemory.create).not.toHaveBeenCalled()
    expect(mockTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ matterId: 'matter-existing' }),
    }))
  })

  it('skips matter linking when the project does not belong to the user', async () => {
    mockProjectContext.findFirst.mockResolvedValue(null)

    await POST(postRequest({ title: 'T', sourceEmailId: 'e1', projectId: 'p-foreign' }))

    expect(mockMatterMemory.create).not.toHaveBeenCalled()
    expect(mockTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ matterId: undefined }),
    }))
  })

  it('writes startDate when provided', async () => {
    await POST(postRequest({ title: 'T', sourceEmailId: 'e1', startDate: '2026-05-10' }))

    expect(mockTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ startDate: new Date('2026-05-10') }),
    }))
  })
})

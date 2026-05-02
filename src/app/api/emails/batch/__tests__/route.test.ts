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
    projectContext: {
      findFirst: vi.fn(),
    },
    matterMemory: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    email: {
      findMany: vi.fn(),
    },
    threadMemory: {
      upsert: vi.fn(),
    },
  },
}))

import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockProjectContext = vi.mocked(prisma.projectContext)
const mockMatterMemory = vi.mocked(prisma.matterMemory)
const mockEmail = vi.mocked(prisma.email)
const mockThreadMemory = vi.mocked(prisma.threadMemory)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/emails/batch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/emails/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 400 when ids is empty', async () => {
    const res = await POST(postRequest({ ids: [], action: 'reassign', projectId: 'proj-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when action is missing', async () => {
    const res = await POST(postRequest({ ids: ['email-1'] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when reassign action has no projectId', async () => {
    const res = await POST(postRequest({ ids: ['email-1'], action: 'reassign' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when project does not belong to user', async () => {
    mockProjectContext.findFirst.mockResolvedValue(null)

    const res = await POST(postRequest({ ids: ['email-1'], action: 'reassign', projectId: 'proj-404' }))

    expect(res.status).toBe(404)
  })

  it('reassigns emails to project threads, creating matter if needed', async () => {
    mockProjectContext.findFirst.mockResolvedValue({ id: 'proj-1', name: 'Project Alpha' } as never)
    mockMatterMemory.findFirst.mockResolvedValue(null)
    mockMatterMemory.create.mockResolvedValue({ id: 'matter-1' } as never)
    mockEmail.findMany.mockResolvedValue([
      { threadId: 'thread-1' },
      { threadId: 'thread-1' },
      { threadId: 'thread-2' },
    ] as never)
    mockThreadMemory.upsert.mockResolvedValue({} as never)

    const res = await POST(postRequest({ ids: ['email-1', 'email-2', 'email-3'], action: 'reassign', projectId: 'proj-1' }))

    expect(mockMatterMemory.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        projectContextId: 'proj-1',
        title: 'Project Alpha',
        summary: 'Manually assigned to this project',
        status: 'open',
        topic: 'other',
      },
    })
    expect(mockThreadMemory.upsert).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.affected).toBe(2)
  })

  it('reuses existing matter when already linked to project', async () => {
    mockProjectContext.findFirst.mockResolvedValue({ id: 'proj-1', name: 'Alpha' } as never)
    mockMatterMemory.findFirst.mockResolvedValue({ id: 'matter-existing' } as never)
    mockEmail.findMany.mockResolvedValue([{ threadId: 'thread-1' }] as never)
    mockThreadMemory.upsert.mockResolvedValue({} as never)

    await POST(postRequest({ ids: ['email-1'], action: 'reassign', projectId: 'proj-1' }))

    expect(mockMatterMemory.create).not.toHaveBeenCalled()
    expect(mockThreadMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { matterId: 'matter-existing' } })
    )
  })

  it('returns 400 for unknown action', async () => {
    const res = await POST(postRequest({ ids: ['email-1'], action: 'delete' }))
    expect(res.status).toBe(400)
  })
})

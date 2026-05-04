import { beforeEach, describe, expect, it, vi } from 'vitest'

const { afterMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: afterMock,
  }
})

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

vi.mock('@/repositories/email-repo', () => ({
  bulkIgnoreEmails: vi.fn(),
}))

vi.mock('@/workflows', () => ({
  processEmail: vi.fn(),
}))

vi.mock('@/lib/quota', () => ({
  getExtractRemaining: vi.fn(),
  incrementExtractUsed: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import { prisma } from '@/lib/prisma'
import { bulkIgnoreEmails } from '@/repositories/email-repo'
import { processEmail } from '@/workflows'
import { getExtractRemaining, incrementExtractUsed } from '@/lib/quota'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockProjectContext = vi.mocked(prisma.projectContext)
const mockMatterMemory = vi.mocked(prisma.matterMemory)
const mockEmail = vi.mocked(prisma.email)
const mockThreadMemory = vi.mocked(prisma.threadMemory)
const mockBulkIgnore = vi.mocked(bulkIgnoreEmails)
const mockProcessEmail = vi.mocked(processEmail)
const mockGetExtractRemaining = vi.mocked(getExtractRemaining)
const mockIncrementExtractUsed = vi.mocked(incrementExtractUsed)

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
    afterMock.mockImplementation((cb: () => void | Promise<void>) => {
      void cb()
    })
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

  describe("action: 'ignore'", () => {
    it('soft-deletes the selected emails by collapsing them into the ignore bucket', async () => {
      mockBulkIgnore.mockResolvedValue({ count: 3 } as never)

      const res = await POST(postRequest({ ids: ['e1', 'e2', 'e3'], action: 'ignore' }))

      expect(res.status).toBe(200)
      expect(mockBulkIgnore).toHaveBeenCalledWith('user-1', ['e1', 'e2', 'e3'])
      const body = await res.json()
      expect(body.data.affected).toBe(3)
    })

    it('returns 0 affected when bulkIgnoreEmails is a no-op', async () => {
      mockBulkIgnore.mockResolvedValue(undefined as never)

      const res = await POST(postRequest({ ids: ['e1'], action: 'ignore' }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.affected).toBe(0)
    })
  })

  describe("action: 'generate_tasks'", () => {
    const eligibleEmail = (id: string, classification: 'action' | 'uncertain' = 'action') => ({
      id,
      subject: `Subject ${id}`,
      sender: 'sender@example.com',
      receivedAt: new Date('2026-04-01'),
      bodyPreview: 'preview',
      bodyFull: 'body',
      labels: '[]',
      threadId: `thread-${id}`,
      classification,
      actioned: false,
    })

    it('queues processEmail for eligible action emails and burns one extract per email', async () => {
      mockEmail.findMany.mockResolvedValue([
        eligibleEmail('e1'),
      ] as never)
      mockGetExtractRemaining.mockResolvedValue(10)
      mockProcessEmail.mockResolvedValue({} as never)

      const res = await POST(postRequest({ ids: ['e1', 'e2'], action: 'generate_tasks' }))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toEqual({
        queued: 1,
        skippedIneligible: 1,
        skippedQuota: 0,
        quotaExhausted: false,
      })
      expect(mockEmail.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ classification: 'action' }),
      }))
      expect(mockIncrementExtractUsed).toHaveBeenCalledTimes(1)
      // Pipeline runs via after() — our mock executes the callback immediately
      expect(mockProcessEmail).toHaveBeenCalledTimes(1)
    })

    it('skips ids that are not Needs Action (DB filtering)', async () => {
      // findMany returns only the eligible subset — the route trusts the DB filter
      mockEmail.findMany.mockResolvedValue([eligibleEmail('e1')] as never)
      mockGetExtractRemaining.mockResolvedValue(10)
      mockProcessEmail.mockResolvedValue({} as never)

      const res = await POST(postRequest({ ids: ['e1', 'e2', 'e3'], action: 'generate_tasks' }))

      const body = await res.json()
      expect(body.data.queued).toBe(1)
      expect(body.data.skippedIneligible).toBe(2)
      expect(body.data.skippedQuota).toBe(0)
    })

    it('caps queue size to remaining extract quota and reports skippedQuota', async () => {
      mockEmail.findMany.mockResolvedValue([
        eligibleEmail('e1'),
        eligibleEmail('e2'),
        eligibleEmail('e3'),
        eligibleEmail('e4'),
        eligibleEmail('e5'),
      ] as never)
      mockGetExtractRemaining.mockResolvedValue(2)
      mockProcessEmail.mockResolvedValue({} as never)

      const res = await POST(postRequest({
        ids: ['e1', 'e2', 'e3', 'e4', 'e5'],
        action: 'generate_tasks',
      }))

      const body = await res.json()
      expect(body.data).toEqual({
        queued: 2,
        skippedIneligible: 0,
        skippedQuota: 3,
        quotaExhausted: true,
      })
      expect(mockIncrementExtractUsed).toHaveBeenCalledTimes(2)
      expect(mockProcessEmail).toHaveBeenCalledTimes(2)
    })

    it('does not burn quota for pro users (Infinity remaining)', async () => {
      mockEmail.findMany.mockResolvedValue([eligibleEmail('e1')] as never)
      mockGetExtractRemaining.mockResolvedValue(Infinity)
      mockProcessEmail.mockResolvedValue({} as never)

      const res = await POST(postRequest({ ids: ['e1'], action: 'generate_tasks' }))

      const body = await res.json()
      expect(body.data).toEqual({
        queued: 1,
        skippedIneligible: 0,
        skippedQuota: 0,
        quotaExhausted: false,
      })
      expect(mockIncrementExtractUsed).not.toHaveBeenCalled()
    })

    it('returns success with 0 queued when nothing is eligible', async () => {
      mockEmail.findMany.mockResolvedValue([] as never)
      mockGetExtractRemaining.mockResolvedValue(10)

      const res = await POST(postRequest({ ids: ['e1'], action: 'generate_tasks' }))

      const body = await res.json()
      expect(body.data.queued).toBe(0)
      expect(body.data.skippedIneligible).toBe(1)
      expect(mockProcessEmail).not.toHaveBeenCalled()
      expect(mockIncrementExtractUsed).not.toHaveBeenCalled()
    })
  })
})

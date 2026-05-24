import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    matterMemory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  createFromThread,
  findCandidates,
  mergeThread,
  setProjectContext,
  updateFromThread,
} from '../matter-memory-repo'
import type { ThreadMemory } from '../thread-memory-repo'

const mockMatterMemory = vi.mocked(prisma.matterMemory)
const NOW = new Date('2026-05-25T00:00:00Z')

function makeProjectContext(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    userId: 'user-1',
    identityId: 'identity-1',
    name: 'Alpha Project',
    description: 'Important work',
    status: 'active',
    keywords: ['alpha', 1],
    participants: ['alice@example.com', false],
    confidence: 0.9,
    createdAt: NOW,
    updatedAt: NOW,
    identity: {
      id: 'identity-1',
      userId: 'user-1',
      name: 'Client Alpha',
      description: null,
      status: 'active',
      keywords: ['client', 1],
      hints: ['vip', null],
      confidence: 0.8,
      createdAt: NOW,
      updatedAt: NOW,
    },
    ...overrides,
  }
}

function makeMatter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'matter-1',
    userId: 'user-1',
    projectContextId: null,
    title: 'Budget review for Alpha launch',
    topic: 'finance',
    summary: 'Waiting on budget approval',
    status: 'active',
    nextAction: 'Follow up tomorrow',
    linkedPrimaryTaskId: null,
    lastEmailId: 'email-1',
    lastMessageAt: NOW,
    threadCount: 1,
    emailCount: 1,
    lastClassification: 'action',
    participants: ['alice@example.com', 1, 'bob@example.com'],
    keywords: ['budget', false, 'alpha'],
    createdAt: NOW,
    updatedAt: NOW,
    projectContext: null,
    ...overrides,
  }
}

function makeThread(overrides: Partial<ThreadMemory> = {}): ThreadMemory {
  return {
    id: 'thread-memory-1',
    userId: 'user-1',
    threadId: 'thread-1',
    title: 'Budget review for Alpha launch',
    topic: 'finance',
    summary: 'Waiting on budget approval',
    status: 'active',
    nextAction: 'Follow up tomorrow',
    matterId: null,
    linkedTaskId: null,
    lastEmailId: 'email-1',
    lastMessageAt: NOW,
    emailCount: 1,
    lastClassification: 'action',
    participants: ['alice@example.com', 'bob@example.com'],
    needsFullAnalysis: false,
    confidence: 0.9,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findCandidates', () => {
  it('returns only matching recent matters ordered by relevance', async () => {
    mockMatterMemory.findMany.mockResolvedValue([
      makeMatter({ id: 'top', topic: 'finance', participants: ['alice@example.com'], keywords: ['budget', 'alpha'] }),
      makeMatter({ id: 'participant-only', topic: 'other', participants: ['alice@example.com'], keywords: ['misc'] }),
      makeMatter({ id: 'ignored', topic: 'other', participants: ['nobody@example.com'], keywords: ['misc'] }),
    ] as never)

    const result = await findCandidates('user-1', {
      topic: 'finance',
      participants: ['alice@example.com'],
      title: 'Re: Budget review for Alpha launch',
    })

    expect(result.map((matter) => matter.id)).toEqual(['top', 'participant-only'])
    expect(mockMatterMemory.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: { not: 'completed' },
        lastMessageAt: { gte: expect.any(Date) },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 30,
    })
  })
})

describe('createFromThread', () => {
  it('creates a matter seeded from the thread and extracts title keywords', async () => {
    mockMatterMemory.create.mockResolvedValue(makeMatter() as never)

    await createFromThread('user-1', makeThread())

    expect(mockMatterMemory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        title: 'Budget review for Alpha launch',
        participants: ['alice@example.com', 'bob@example.com'],
        keywords: ['budget', 'review', 'alpha', 'launch'],
        threadCount: 1,
        emailCount: 1,
      }),
      include: { projectContext: { include: { identity: true } } },
    })
  })
})

describe('updateFromThread and mergeThread', () => {
  it('merges participants and increments email count when updating an existing matter', async () => {
    mockMatterMemory.findUnique.mockResolvedValue({ participants: ['alice@example.com'] } as never)
    mockMatterMemory.update.mockResolvedValue(makeMatter({
      participants: ['alice@example.com', 'carol@example.com'],
      emailCount: 2,
    }) as never)

    await updateFromThread('matter-1', makeThread({ participants: ['alice@example.com', 'carol@example.com'] }))

    expect(mockMatterMemory.update).toHaveBeenCalledWith({
      where: { id: 'matter-1' },
      data: expect.objectContaining({
        participants: ['alice@example.com', 'carol@example.com'],
        emailCount: { increment: 1 },
      }),
      include: { projectContext: { include: { identity: true } } },
    })
  })

  it('increments both threadCount and emailCount when merging a new thread', async () => {
    mockMatterMemory.findUnique.mockResolvedValue({ participants: ['alice@example.com'] } as never)
    mockMatterMemory.update.mockResolvedValue(makeMatter({
      participants: ['alice@example.com', 'bob@example.com'],
      threadCount: 2,
      emailCount: 2,
    }) as never)

    await mergeThread('matter-1', makeThread())

    expect(mockMatterMemory.update).toHaveBeenCalledWith({
      where: { id: 'matter-1' },
      data: expect.objectContaining({
        participants: ['alice@example.com', 'bob@example.com'],
        threadCount: { increment: 1 },
        emailCount: { increment: 1 },
      }),
      include: { projectContext: { include: { identity: true } } },
    })
  })
})

describe('setProjectContext', () => {
  it('maps nested project and identity arrays when attaching a project context', async () => {
    mockMatterMemory.update.mockResolvedValue(makeMatter({
      projectContextId: 'project-1',
      projectContext: makeProjectContext(),
    }) as never)

    const result = await setProjectContext('matter-1', 'project-1')

    expect(result.projectContext).toEqual(
      expect.objectContaining({
        keywords: ['alpha'],
        participants: ['alice@example.com'],
        identity: expect.objectContaining({
          keywords: ['client'],
          hints: ['vip'],
        }),
      }),
    )
  })
})

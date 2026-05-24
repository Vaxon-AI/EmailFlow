import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectContext: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    matterMemory: {
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  assignIdentity,
  attachMatter,
  confirmProject,
  createSuggestion,
  findAllForUser,
} from '../project-context-repo'

const mockProjectContext = vi.mocked(prisma.projectContext)
const mockMatterMemory = vi.mocked(prisma.matterMemory)

const NOW = new Date('2026-05-25T00:00:00Z')

function makeIdentity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'identity-1',
    userId: 'user-1',
    name: 'Client Alpha',
    description: 'Important client',
    status: 'active',
    keywords: [' alpha ', 123, 'client'],
    hints: ['vip', null],
    confidence: 0.8,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    userId: 'user-1',
    identityId: 'identity-1',
    name: 'Alpha Rollout',
    description: 'Rollout work',
    status: 'active',
    keywords: ['launch', 42, 'ops'],
    participants: ['alice@example.com', false, 'bob@example.com'],
    confidence: 0.72,
    createdAt: NOW,
    updatedAt: NOW,
    identity: makeIdentity(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findAllForUser', () => {
  it('maps json-backed arrays on both project and nested identity', async () => {
    mockProjectContext.findMany.mockResolvedValue([makeProject()] as never)

    const result = await findAllForUser('user-1')

    expect(result).toEqual([
      expect.objectContaining({
        keywords: ['launch', 'ops'],
        participants: ['alice@example.com', 'bob@example.com'],
        identity: expect.objectContaining({
          keywords: [' alpha ', 'client'],
          hints: ['vip'],
        }),
      }),
    ])
  })

  it('filters archived rows and sorts by confidence then updatedAt', async () => {
    mockProjectContext.findMany.mockResolvedValue([] as never)

    await findAllForUser('user-1')

    expect(mockProjectContext.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: { not: 'archived' } },
      include: { identity: true },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
    })
  })
})

describe('createSuggestion', () => {
  it('returns the existing project when the same user/name pair already exists', async () => {
    mockProjectContext.findUnique.mockResolvedValue(makeProject({ name: 'Existing Project' }) as never)

    const result = await createSuggestion('user-1', { name: 'Existing Project' })

    expect(mockProjectContext.create).not.toHaveBeenCalled()
    expect(result.name).toBe('Existing Project')
  })

  it('normalizes keyword and participant arrays on create', async () => {
    mockProjectContext.findUnique.mockResolvedValue(null)
    mockProjectContext.create.mockResolvedValue(makeProject({
      identity: null,
      keywords: ['urgent', 'client'],
      participants: ['alice@example.com', 'bob@example.com'],
    }) as never)

    await createSuggestion('user-1', {
      name: 'New Project',
      keywords: [' urgent ', 'client', 'urgent', ''],
      participants: ['alice@example.com', ' alice@example.com ', 'bob@example.com'],
    })

    expect(mockProjectContext.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: 'New Project',
        keywords: ['urgent', 'client'],
        participants: ['alice@example.com', 'bob@example.com'],
        confidence: 0.72,
      }),
      include: { identity: true },
    })
  })
})

describe('confirmProject', () => {
  it('merges existing and incoming arrays before updating', async () => {
    mockProjectContext.findUnique.mockResolvedValue({
      keywords: ['launch', 'ops'],
      participants: ['alice@example.com'],
    } as never)
    mockProjectContext.update.mockResolvedValue(makeProject({
      keywords: ['launch', 'ops', 'urgent'],
      participants: ['alice@example.com', 'bob@example.com'],
    }) as never)

    await confirmProject('project-1', {
      keywords: [' urgent ', 'launch'],
      participants: ['bob@example.com', 'alice@example.com'],
    })

    expect(mockProjectContext.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: expect.objectContaining({
        keywords: ['launch', 'ops', 'urgent'],
        participants: ['alice@example.com', 'bob@example.com'],
        confidence: 1,
      }),
      include: { identity: true },
    })
  })
})

describe('assignIdentity and attachMatter', () => {
  it('maps the updated project row when assigning an identity', async () => {
    mockProjectContext.update.mockResolvedValue(makeProject({ identityId: 'identity-2' }) as never)

    const result = await assignIdentity('project-1', 'identity-2')

    expect(result.identityId).toBe('identity-2')
    expect(mockProjectContext.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { identityId: 'identity-2' },
      include: { identity: true },
    })
  })

  it('updates the matter with the chosen project context id', async () => {
    mockMatterMemory.update.mockResolvedValue({} as never)

    await attachMatter('project-1', 'matter-1')

    expect(mockMatterMemory.update).toHaveBeenCalledWith({
      where: { id: 'matter-1' },
      data: { projectContextId: 'project-1' },
    })
  })
})

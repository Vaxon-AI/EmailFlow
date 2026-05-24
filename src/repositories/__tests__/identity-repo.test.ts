import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userIdentity: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  confirmIdentity,
  createSuggestion,
  findAllForUser,
  findById,
} from '../identity-repo'

const mockUserIdentity = vi.mocked(prisma.userIdentity)
const NOW = new Date('2026-05-25T00:00:00Z')

function makeIdentity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'identity-1',
    userId: 'user-1',
    name: 'Client Alpha',
    description: 'Important client',
    status: 'active',
    keywords: ['client', 1, 'alpha'],
    hints: ['vip', null, 'billing'],
    confidence: 0.72,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findAllForUser', () => {
  it('maps json-backed arrays and filters archived rows', async () => {
    mockUserIdentity.findMany.mockResolvedValue([makeIdentity()] as never)

    const result = await findAllForUser('user-1')

    expect(result).toEqual([
      expect.objectContaining({
        keywords: ['client', 'alpha'],
        hints: ['vip', 'billing'],
      }),
    ])
    expect(mockUserIdentity.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: { not: 'archived' } },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
    })
  })
})

describe('findById', () => {
  it('returns null when the identity is missing', async () => {
    mockUserIdentity.findUnique.mockResolvedValue(null)

    await expect(findById('missing')).resolves.toBeNull()
  })
})

describe('createSuggestion', () => {
  it('returns an existing identity when the same user/name pair already exists', async () => {
    mockUserIdentity.findUnique.mockResolvedValue(makeIdentity({ name: 'Existing' }) as never)

    const result = await createSuggestion('user-1', { name: 'Existing' })

    expect(mockUserIdentity.create).not.toHaveBeenCalled()
    expect(result.name).toBe('Existing')
  })

  it('normalizes keyword and hint arrays before creating', async () => {
    mockUserIdentity.findUnique.mockResolvedValue(null)
    mockUserIdentity.create.mockResolvedValue(makeIdentity({
      keywords: ['client', 'alpha'],
      hints: ['vip', 'billing'],
    }) as never)

    await createSuggestion('user-1', {
      name: 'New Identity',
      keywords: [' client ', 'alpha', 'client', ''],
      hints: ['vip', ' billing ', 'vip'],
    })

    expect(mockUserIdentity.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'New Identity',
        description: null,
        keywords: ['client', 'alpha'],
        hints: ['vip', 'billing'],
        confidence: 0.72,
      },
    })
  })
})

describe('confirmIdentity', () => {
  it('merges existing and incoming arrays and sets confidence to 1', async () => {
    mockUserIdentity.findUnique.mockResolvedValue({
      keywords: ['client', 'alpha'],
      hints: ['vip'],
    } as never)
    mockUserIdentity.update.mockResolvedValue(makeIdentity({
      keywords: ['client', 'alpha', 'urgent'],
      hints: ['vip', 'billing'],
      confidence: 1,
    }) as never)

    await confirmIdentity('identity-1', {
      keywords: [' urgent ', 'client'],
      hints: ['billing', 'vip'],
    })

    expect(mockUserIdentity.update).toHaveBeenCalledWith({
      where: { id: 'identity-1' },
      data: {
        name: undefined,
        description: undefined,
        keywords: ['client', 'alpha', 'urgent'],
        hints: ['vip', 'billing'],
        confidence: 1,
      },
    })
  })
})

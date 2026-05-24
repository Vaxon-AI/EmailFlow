import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { findByUserId, upsert } from '../user-preference-repo'

const mockUserPreference = vi.mocked(prisma.userPreference)
const NOW = new Date('2026-05-25T00:00:00Z')

function makePreference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pref-1',
    userId: 'user-1',
    roles: ['Student', 1],
    purposes: ['Work', null],
    focusAreas: ['Deadlines', false, 'Follow-ups'],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findByUserId', () => {
  it('returns null when no preference row exists', async () => {
    mockUserPreference.findUnique.mockResolvedValue(null)

    await expect(findByUserId('missing')).resolves.toBeNull()
  })

  it('maps json-backed arrays to string arrays', async () => {
    mockUserPreference.findUnique.mockResolvedValue(makePreference() as never)

    const result = await findByUserId('user-1')

    expect(result).toEqual(
      expect.objectContaining({
        roles: ['Student'],
        purposes: ['Work'],
        focusAreas: ['Deadlines', 'Follow-ups'],
      }),
    )
    expect(mockUserPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })
})

describe('upsert', () => {
  it('writes the same payload to both create and update branches', async () => {
    mockUserPreference.upsert.mockResolvedValue(makePreference({
      roles: ['Student'],
      purposes: ['Work'],
      focusAreas: ['Deadlines'],
    }) as never)

    await upsert('user-1', {
      roles: ['Student'],
      purposes: ['Work'],
      focusAreas: ['Deadlines'],
    })

    expect(mockUserPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: {
        userId: 'user-1',
        roles: ['Student'],
        purposes: ['Work'],
        focusAreas: ['Deadlines'],
      },
      update: {
        roles: ['Student'],
        purposes: ['Work'],
        focusAreas: ['Deadlines'],
      },
    })
  })
})

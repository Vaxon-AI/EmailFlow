import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    digest: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { createDigest } from '../digest-repo'

const mockDigest = vi.mocked(prisma.digest)
const mockTransaction = vi.mocked(prisma.$transaction)

beforeEach(() => {
  vi.clearAllMocks()
  mockDigest.findMany.mockResolvedValue([])
  mockDigest.create.mockResolvedValue({ id: 'new-digest' } as never)
  mockDigest.update.mockResolvedValue({ id: 'updated-digest' } as never)
  mockDigest.deleteMany.mockResolvedValue({ count: 1 } as never)
  mockTransaction.mockImplementation(async (ops: unknown) => Promise.all(ops as Promise<unknown>[]) as never)
})

describe('createDigest', () => {
  it('creates the first digest for a daily period', async () => {
    const periodStart = new Date('2026-05-10T00:00:00Z')

    await createDigest({
      userId: 'user-1',
      period: 'daily',
      periodStart,
      periodEnd: new Date('2026-05-10T12:00:00Z'),
      content: 'content',
      stats: { actionCount: 1 },
    })

    expect(mockDigest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        period: 'daily',
        periodStart: {
          gte: periodStart,
          lt: new Date('2026-05-11T00:00:00Z'),
        },
      }),
    }))
    expect(mockDigest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-1',
        period: 'daily',
        stats: JSON.stringify({ actionCount: 1 }),
      }),
    }))
  })

  it('updates the current weekly digest and removes duplicate rows in the same week', async () => {
    const periodStart = new Date('2026-05-04T00:00:00Z')
    mockDigest.findMany.mockResolvedValue([
      { id: 'weekly-latest' },
      { id: 'weekly-duplicate-1' },
      { id: 'weekly-duplicate-2' },
    ] as never)

    await createDigest({
      userId: 'user-1',
      period: 'weekly',
      periodStart,
      periodEnd: new Date('2026-05-10T12:00:00Z'),
      content: 'updated content',
      stats: { taskTotal: 2 },
    })

    expect(mockDigest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        periodStart: {
          gte: periodStart,
          lt: new Date('2026-05-11T00:00:00Z'),
        },
      }),
    }))
    expect(mockDigest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'weekly-latest' },
      data: expect.objectContaining({
        periodStart,
        content: 'updated content',
        stats: JSON.stringify({ taskTotal: 2 }),
      }),
    }))
    expect(mockDigest.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['weekly-duplicate-1', 'weekly-duplicate-2'] } },
    })
  })
})

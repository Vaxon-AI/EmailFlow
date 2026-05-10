import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { cleanupTasksForUser } from '../task-cleanup-service'

const mockFindMany = prisma.task.findMany as unknown as ReturnType<typeof vi.fn>
const mockDeleteMany = prisma.task.deleteMany as unknown as ReturnType<typeof vi.fn>
const mockUpdateMany = prisma.task.updateMany as unknown as ReturnType<typeof vi.fn>
const mockExecuteRaw = prisma.$executeRaw as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMany.mockResolvedValue([])
  mockDeleteMany.mockResolvedValue({ count: 0 })
  mockUpdateMany.mockResolvedValue({ count: 0 })
  mockExecuteRaw.mockResolvedValue(0)
})

describe('cleanupTasksForUser', () => {
  it('hard-deletes standalone (no email link) completed tasks past cutoff', async () => {
    mockFindMany.mockResolvedValue([
      { id: 't1', _count: { emailLinks: 0 } },
      { id: 't2', _count: { emailLinks: 0 } },
    ])
    mockDeleteMany.mockResolvedValue({ count: 2 })

    const result = await cleanupTasksForUser('user-1', 30)

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t1', 't2'] } } })
    expect(result.hardDeleted).toBe(2)
    expect(result.softArchived).toBe(0)
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it('soft-archives email-linked completed tasks past cutoff', async () => {
    mockFindMany.mockResolvedValue([
      { id: 't1', _count: { emailLinks: 1 } },
      { id: 't2', _count: { emailLinks: 3 } },
    ])
    mockUpdateMany.mockResolvedValue({ count: 2 })

    const result = await cleanupTasksForUser('user-1', 30)

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1', 't2'] } },
      data: { archivedAt: expect.any(Date) },
    })
    expect(result.softArchived).toBe(2)
    expect(result.hardDeleted).toBe(0)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('mixes both: hard-delete standalone, soft-archive linked, in one pass', async () => {
    mockFindMany.mockResolvedValue([
      { id: 't1', _count: { emailLinks: 0 } },     // standalone
      { id: 't2', _count: { emailLinks: 2 } },     // linked
      { id: 't3', _count: { emailLinks: 0 } },     // standalone
    ])
    mockDeleteMany.mockResolvedValue({ count: 2 })
    mockUpdateMany.mockResolvedValue({ count: 1 })

    const result = await cleanupTasksForUser('user-1', 30)

    expect(result.hardDeleted).toBe(2)
    expect(result.softArchived).toBe(1)
  })

  it('runs pass 2 to hard-delete archived tasks whose source emails are gone', async () => {
    mockFindMany.mockResolvedValue([])
    mockExecuteRaw.mockResolvedValueOnce(7)

    const result = await cleanupTasksForUser('user-1', 30)

    expect(mockExecuteRaw).toHaveBeenCalled()
    expect(result.purgedFromArchive).toBe(7)
  })

  it('returns all zeros when no candidates exist', async () => {
    const result = await cleanupTasksForUser('user-1', 30)
    expect(result).toEqual({ hardDeleted: 0, softArchived: 0, purgedFromArchive: 0 })
  })

  it('uses retainAfterDays to compute cutoff (older than N days from now)', async () => {
    const before = Date.now()
    await cleanupTasksForUser('user-1', 14)
    const after = Date.now()

    const call = mockFindMany.mock.calls[0][0] as { where: { completedAt: { lt: Date } } }
    const cutoff = call.where.completedAt.lt.getTime()
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000

    expect(cutoff).toBeGreaterThanOrEqual(before - fourteenDaysMs - 5)
    expect(cutoff).toBeLessThanOrEqual(after - fourteenDaysMs + 5)
  })
})

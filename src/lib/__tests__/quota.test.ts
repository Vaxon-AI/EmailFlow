import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  FREE_CLASSIFY_LIMIT,
  FREE_EXTRACT_LIMIT,
  FREE_PASTE_TEXT_LIMIT,
  getClassifyRemaining,
  getExtractRemaining,
  getPasteTextRemaining,
  getQuotaStatus,
  incrementClassifyUsed,
  incrementExtractUsed,
  incrementPasteTextUsed,
} from '../quota'

const mockUser = vi.mocked(prisma.user)

describe('quota helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.updateMany.mockResolvedValue({ count: 0 } as never)
    mockUser.update.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns remaining classify quota for free users', async () => {
    mockUser.findUniqueOrThrow.mockResolvedValue({
      plan: 'free',
      classifyUsed: 12,
    } as never)

    await expect(getClassifyRemaining('user-1')).resolves.toBe(FREE_CLASSIFY_LIMIT - 12)
    expect(mockUser.updateMany).toHaveBeenCalledOnce()
  })

  it('clamps remaining classify quota at zero', async () => {
    mockUser.findUniqueOrThrow.mockResolvedValue({
      plan: 'free',
      classifyUsed: 999,
    } as never)

    await expect(getClassifyRemaining('user-1')).resolves.toBe(0)
  })

  it('returns Infinity remaining for pro users across all quota types', async () => {
    mockUser.findUniqueOrThrow
      .mockResolvedValueOnce({ plan: 'pro', classifyUsed: 999 } as never)
      .mockResolvedValueOnce({ plan: 'pro', extractUsed: 999 } as never)
      .mockResolvedValueOnce({ plan: 'pro', pasteTextUsed: 999 } as never)

    await expect(getClassifyRemaining('user-1')).resolves.toBe(Infinity)
    await expect(getExtractRemaining('user-1')).resolves.toBe(Infinity)
    await expect(getPasteTextRemaining('user-1')).resolves.toBe(Infinity)
  })

  it('returns remaining extract and paste-text quota for free users', async () => {
    mockUser.findUniqueOrThrow
      .mockResolvedValueOnce({ plan: 'free', extractUsed: 4 } as never)
      .mockResolvedValueOnce({ plan: 'free', pasteTextUsed: 1 } as never)

    await expect(getExtractRemaining('user-1')).resolves.toBe(FREE_EXTRACT_LIMIT - 4)
    await expect(getPasteTextRemaining('user-1')).resolves.toBe(FREE_PASTE_TEXT_LIMIT - 1)
  })

  it('increments each usage counter on the expected field', async () => {
    await incrementClassifyUsed('user-1')
    await incrementExtractUsed('user-1')
    await incrementPasteTextUsed('user-1')

    expect(mockUser.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'user-1' },
      data: { classifyUsed: { increment: 1 } },
    })
    expect(mockUser.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-1' },
      data: { extractUsed: { increment: 1 } },
    })
    expect(mockUser.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'user-1' },
      data: { pasteTextUsed: { increment: 1 } },
    })
  })

  it('returns quota status with limits for free users', async () => {
    const quotaResetAt = new Date('2026-01-01T00:00:00Z')
    mockUser.findUniqueOrThrow.mockResolvedValue({
      plan: 'free',
      classifyUsed: 7,
      extractUsed: 2,
      pasteTextUsed: 1,
      quotaResetAt,
    } as never)

    const status = await getQuotaStatus('user-1')

    expect(status.plan).toBe('free')
    expect(status.classify).toEqual({
      used: 7,
      limit: FREE_CLASSIFY_LIMIT,
      resetAt: new Date(quotaResetAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    })
    expect(status.extract.limit).toBe(FREE_EXTRACT_LIMIT)
    expect(status.pasteText.limit).toBe(FREE_PASTE_TEXT_LIMIT)
  })

  it('returns null limits for pro users in quota status', async () => {
    const quotaResetAt = new Date('2026-01-01T00:00:00Z')
    mockUser.findUniqueOrThrow.mockResolvedValue({
      plan: 'pro',
      classifyUsed: 1000,
      extractUsed: 1000,
      pasteTextUsed: 1000,
      quotaResetAt,
    } as never)

    const status = await getQuotaStatus('user-1')

    expect(status.classify.limit).toBeNull()
    expect(status.extract.limit).toBeNull()
    expect(status.pasteText.limit).toBeNull()
  })
})

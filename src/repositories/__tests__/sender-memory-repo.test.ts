import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    senderMemory: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { findByUserAndSender, incrementSenderMemory } from '../sender-memory-repo'

const mockSenderMemory = vi.mocked(prisma.senderMemory)

describe('sender-memory-repo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finds sender memory by user and sender', async () => {
    mockSenderMemory.findUnique.mockResolvedValue({ userId: 'user-1', sender: 'boss@example.com' } as never)

    const result = await findByUserAndSender('user-1', 'boss@example.com')

    expect(result).toEqual({ userId: 'user-1', sender: 'boss@example.com' })
    expect(mockSenderMemory.findUnique).toHaveBeenCalledWith({
      where: { userId_sender: { userId: 'user-1', sender: 'boss@example.com' } },
    })
  })

  it('creates sender memory on first classification', async () => {
    mockSenderMemory.findUnique.mockResolvedValue(null)
    mockSenderMemory.create.mockResolvedValue({} as never)

    await incrementSenderMemory('user-1', 'boss@example.com', 'action')

    expect(mockSenderMemory.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        sender: 'boss@example.com',
        actionCount: 1,
        awarenessCount: 0,
        ignoreCount: 0,
      },
    })
  })

  it('increments the matching category on existing sender memory', async () => {
    mockSenderMemory.findUnique.mockResolvedValue({
      actionCount: 2,
      awarenessCount: 1,
      ignoreCount: 0,
    } as never)
    mockSenderMemory.update.mockResolvedValue({} as never)

    await incrementSenderMemory('user-1', 'boss@example.com', 'awareness')

    expect(mockSenderMemory.update).toHaveBeenCalledWith({
      where: { userId_sender: { userId: 'user-1', sender: 'boss@example.com' } },
      data: {
        actionCount: 2,
        awarenessCount: 2,
        ignoreCount: 0,
      },
    })
  })
})

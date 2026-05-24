import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    passwordResetToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import {
  applyResetPassword,
  createResetToken,
  findByTokenHashWithUser,
  findLatestForUser,
  invalidateAllActiveForUser,
} from '../password-reset-repo'

const mockToken = vi.mocked(prisma.passwordResetToken)
const mockUser = vi.mocked(prisma.user)
const mockTransaction = vi.mocked(prisma.$transaction)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findByTokenHashWithUser', () => {
  it('loads the token by hash and includes the user', async () => {
    mockToken.findUnique.mockResolvedValue({ id: 'token-1' } as never)

    await findByTokenHashWithUser('hash-1')

    expect(mockToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: 'hash-1' },
      include: { user: true },
    })
  })
})

describe('findLatestForUser', () => {
  it('loads the most recently created token for the user', async () => {
    mockToken.findFirst.mockResolvedValue({ id: 'token-1' } as never)

    await findLatestForUser('user-1')

    expect(mockToken.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    })
  })
})

describe('invalidateAllActiveForUser', () => {
  it('marks only unused and unexpired tokens as used', async () => {
    mockToken.updateMany.mockResolvedValue({ count: 2 } as never)

    await invalidateAllActiveForUser('user-1')

    expect(mockToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    })
  })
})

describe('createResetToken', () => {
  it('passes the create input straight through to prisma', async () => {
    const input = {
      userId: 'user-1',
      tokenHash: 'hash-1',
      expiresAt: new Date('2026-05-26T00:00:00Z'),
    }
    mockToken.create.mockResolvedValue({ id: 'token-1' } as never)

    await createResetToken(input)

    expect(mockToken.create).toHaveBeenCalledWith({ data: input })
  })
})

describe('applyResetPassword', () => {
  it('updates the user password and marks the token used in a single transaction', async () => {
    const userUpdate = Promise.resolve({ id: 'user-1' })
    const tokenUpdate = Promise.resolve({ id: 'token-1' })
    mockUser.update.mockReturnValue(userUpdate as never)
    mockToken.update.mockReturnValue(tokenUpdate as never)
    mockTransaction.mockResolvedValue([{ id: 'user-1' }, { id: 'token-1' }] as never)

    await applyResetPassword({
      userId: 'user-1',
      passwordHash: 'hashed-password',
      tokenId: 'token-1',
    })

    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'hashed-password' },
    })
    expect(mockToken.update).toHaveBeenCalledWith({
      where: { id: 'token-1' },
      data: { usedAt: expect.any(Date) },
    })
    expect(mockTransaction).toHaveBeenCalledWith([userUpdate, tokenUpdate])
  })
})

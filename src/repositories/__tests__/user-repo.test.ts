import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('@/integrations/provider-registry', () => ({
  getEnabledEmailProviderKeys: vi.fn(() => ['google']),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    account: {
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma'
import { getEnabledEmailProviderKeys } from '@/integrations/provider-registry'
import {
  getUserSyncInfo,
  listEnabledEmailAccounts,
  updateAccountLastSync,
  updateLastSync,
} from '../user-repo'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockPrismaUser = vi.mocked(prisma.user)
const mockPrismaAccount = vi.mocked(prisma.account)
const mockGetEnabledEmailProviderKeys = vi.mocked(getEnabledEmailProviderKeys)
const USER_ID = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetEnabledEmailProviderKeys.mockReturnValue(['google'])
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateLastSync', () => {
  it('calls prisma.user.update with the correct userId', async () => {
    mockPrismaUser.update.mockResolvedValue({ id: USER_ID } as never)
    await updateLastSync(USER_ID)
    expect(mockPrismaUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    )
  })

  it('sets lastSyncAt to a Date', async () => {
    mockPrismaUser.update.mockResolvedValue({ id: USER_ID } as never)
    await updateLastSync(USER_ID)
    const data = mockPrismaUser.update.mock.calls[0][0].data as { lastSyncAt: unknown }
    expect(data.lastSyncAt).toBeInstanceOf(Date)
  })
})

describe('getUserSyncInfo', () => {
  it('returns the user sync info from prisma', async () => {
    const syncInfo = {
      lastSyncAt: new Date(),
      accounts: [{ id: 'account-1' }],
      syncEnabled: true,
      manualReviewMode: false,
      emailProviderReauthRequired: false,
      emailProviderReauthReason: null,
      emailProviderReauthAt: null,
      emailProviderReauthProvider: null,
    }
    mockPrismaUser.findUnique.mockResolvedValue(syncInfo as never)
    const result = await getUserSyncInfo(USER_ID)
    expect(result).toEqual({
      lastSyncAt: syncInfo.lastSyncAt,
      emailConnected: true,
      syncEnabled: true,
      manualReviewMode: false,
      emailProviderReauthRequired: false,
      emailProviderReauthReason: null,
      emailProviderReauthAt: null,
      emailProviderReauthProvider: null,
    })
  })

  it('queries by userId with the correct select fields', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null)
    await getUserSyncInfo(USER_ID)
    expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: expect.objectContaining({
        lastSyncAt: true,
        syncEnabled: true,
        accounts: expect.objectContaining({
          where: { provider: { in: ['google'] }, syncEnabled: true },
        }),
      }),
    })
  })

  it('returns null when user does not exist', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null)
    expect(await getUserSyncInfo('nonexistent')).toBeNull()
  })

  it('returns emailConnected false when no enabled provider accounts exist', async () => {
    mockPrismaUser.findUnique.mockResolvedValue({
      lastSyncAt: null,
      accounts: [],
      syncEnabled: true,
      manualReviewMode: false,
      emailProviderReauthRequired: false,
      emailProviderReauthReason: null,
      emailProviderReauthAt: null,
      emailProviderReauthProvider: null,
    } as never)

    const result = await getUserSyncInfo(USER_ID)
    expect(result?.emailConnected).toBe(false)
  })
})

describe('updateAccountLastSync', () => {
  it('clears reauth flags and sets lastSyncAt', async () => {
    mockPrismaAccount.update.mockResolvedValue({ id: 'account-1' } as never)

    await updateAccountLastSync('account-1')

    expect(mockPrismaAccount.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: expect.objectContaining({
        lastSyncAt: expect.any(Date),
        reauthRequired: false,
        reauthReason: null,
        reauthAt: null,
        reauthProvider: null,
      }),
    })
  })
})

describe('listEnabledEmailAccounts', () => {
  it('filters by enabled provider keys and syncEnabled=true', async () => {
    mockPrismaAccount.findMany.mockResolvedValue([] as never)

    await listEnabledEmailAccounts(USER_ID)

    expect(mockPrismaAccount.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, provider: { in: ['google'] }, syncEnabled: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        provider: true,
        email: true,
        syncEnabled: true,
        reauthRequired: true,
        reauthReason: true,
        reauthAt: true,
        reauthProvider: true,
        lastSyncAt: true,
      },
    })
  })
})

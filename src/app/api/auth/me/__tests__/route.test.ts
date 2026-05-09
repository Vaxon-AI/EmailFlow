import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth-session', () => ({
  requireCurrentSessionContext: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { requireCurrentSessionContext } from '@/lib/auth-session'
import { GET } from '../route'

const mockRequireContext = vi.mocked(requireCurrentSessionContext)
const mockUser = vi.mocked(prisma.user)
const mockAccount = vi.mocked(prisma.account)

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireContext.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        isAdmin: false,
        manualReviewMode: true,
      },
      session: {
        id: 'session-1',
      },
    } as never)
  })

  it('returns session user details by default', async () => {
    const res = await GET(new NextRequest('http://localhost/api/auth/me'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        isAdmin: false,
        manualReviewMode: true,
        currentSessionId: 'session-1',
      },
    })
    expect(mockUser.findUnique).not.toHaveBeenCalled()
    expect(mockAccount.findMany).not.toHaveBeenCalled()
  })

  it('returns expanded account details when requested', async () => {
    const syncStartDate = new Date('2026-04-01T00:00:00.000Z')
    mockUser.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
      isAdmin: false,
      gmailEmail: 'alice@gmail.com',
      syncStartDate,
      timezone: 'Australia/Sydney',
      totpEnabled: true,
      manualReviewMode: false,
      emailProviderReauthRequired: true,
      emailProviderReauthReason: 'token_expired',
      emailProviderReauthAt: syncStartDate,
      emailProviderReauthProvider: 'google',
    } as never)
    mockAccount.findMany.mockResolvedValue([
      {
        id: 'account-1',
        provider: 'google',
        email: 'alice@gmail.com',
        syncEnabled: true,
        lastSyncAt: null,
        reauthRequired: false,
        reauthReason: null,
        reauthAt: null,
        reauthProvider: null,
      },
      {
        id: 'account-2',
        provider: 'google',
        email: 'work@gmail.com',
        syncEnabled: true,
        lastSyncAt: syncStartDate,
        reauthRequired: true,
        reauthReason: 'refresh_failed',
        reauthAt: syncStartDate,
        reauthProvider: 'gmail',
      },
    ] as never)

    const res = await GET(new NextRequest('http://localhost/api/auth/me?details=full'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.user.googleAccount).toEqual({ email: 'alice@gmail.com' })
    expect(body.user.emailAccounts).toHaveLength(2)
    expect(body.user.emailAccounts[1]).toMatchObject({
      id: 'account-2',
      email: 'work@gmail.com',
      reauthRequired: true,
    })
    expect(body.user.currentSessionId).toBe('session-1')
    expect(mockUser.findUnique).toHaveBeenCalled()
    expect(mockAccount.findMany).toHaveBeenCalled()
  })

  it('returns 404 when the stored user record is missing', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    mockAccount.findMany.mockResolvedValue([] as never)

    const res = await GET(new NextRequest('http://localhost/api/auth/me?details=full'))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      success: false,
      error: 'User not found',
    })
  })
})

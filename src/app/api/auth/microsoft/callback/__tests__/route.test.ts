import { describe, it, expect, vi, beforeEach } from 'vitest'

// The route module reads Microsoft env vars at import time
vi.hoisted(() => {
  process.env.MICROSOFT_CLIENT_ID = 'ms-client-id'
  process.env.MICROSOFT_CLIENT_SECRET = 'ms-client-secret'
  process.env.MICROSOFT_REDIRECT_URI = 'http://localhost:3000/api/auth/microsoft/callback'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
})

vi.mock('@/lib/prisma', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    account: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  // Transactions receive the same mock client
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})

vi.mock('@/lib/auth-sessions', () => ({
  getCurrentUser: vi.fn(),
  createUserSession: vi.fn(),
}))

vi.mock('@/lib/auth-token', () => ({
  setSessionCookie: vi.fn().mockResolvedValue(undefined),
  verifyOAuthStateToken: vi.fn().mockReturnValue({ remember: true }),
}))

vi.mock('@/lib/microsoft-oauth', () => ({
  exchangeMicrosoftCode: vi.fn(),
  fetchMicrosoftProfile: vi.fn(),
}))

vi.mock('@/repositories/quota-ledger-repo', () => ({
  getInheritedQuotaForEmail: vi.fn(),
  mergeGmailLedgerIntoUser: vi.fn(),
}))

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, createUserSession } from '@/lib/auth-sessions'
import { setSessionCookie } from '@/lib/auth-token'
import { exchangeMicrosoftCode, fetchMicrosoftProfile } from '@/lib/microsoft-oauth'
import { getInheritedQuotaForEmail, mergeGmailLedgerIntoUser } from '@/repositories/quota-ledger-repo'
import { AppError } from '@/lib/app-errors'
import { GET } from '../route'

const mockPrismaUser = vi.mocked(prisma.user)
const mockPrismaAccount = vi.mocked(prisma.account)
const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockCreateSession = vi.mocked(createUserSession)
const mockSetCookie = vi.mocked(setSessionCookie)
const mockExchange = vi.mocked(exchangeMicrosoftCode)
const mockProfile = vi.mocked(fetchMicrosoftProfile)
const mockInheritedQuota = vi.mocked(getInheritedQuotaForEmail)
const mockMergeLedger = vi.mocked(mergeGmailLedgerIntoUser)

function callbackRequest(params: Record<string, string>): NextRequest {
  const search = new URLSearchParams(params)
  return new NextRequest(`http://localhost:3000/api/auth/microsoft/callback?${search.toString()}`)
}

function redirectTarget(res: Response): URL {
  return new URL(res.headers.get('location')!)
}

const MS_PROFILE = {
  id: 'ms-user-1',
  displayName: 'Alice Outlook',
  mail: 'alice@outlook.com',
  userPrincipalName: 'alice@outlook.com',
}

function arrangeSuccessfulOAuth(profile: Partial<typeof MS_PROFILE> | object = MS_PROFILE) {
  mockExchange.mockResolvedValue({
    ok: true,
    status: 200,
    accessToken: 'ms-at',
    refreshToken: 'ms-rt',
    expiresIn: 3600,
  })
  mockProfile.mockResolvedValue({ ok: true, status: 200, profile: profile as never })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(prisma)
  )
  vi.mocked(setSessionCookie).mockResolvedValue(undefined as never)
  // dashboardRedirectFor reads these — default to "already set up"
  mockPrismaUser.findUnique.mockResolvedValue({
    hasSeenSyncSetup: true,
    syncStartDate: null,
    lastSyncAt: null,
  } as never)
})

describe('GET /api/auth/microsoft/callback — error handling', () => {
  it('redirects with the provider error when the user denies consent', async () => {
    mockGetCurrentUser.mockResolvedValue(null as never)
    const res = await GET(callbackRequest({ error: 'access_denied' }))
    const target = redirectTarget(res)
    expect(target.pathname).toBe('/auth/signup')
    expect(target.searchParams.get('outlook_error')).toBe('access_denied')
  })

  it('redirects to settings for a logged-in user on consent denial', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' } as never)
    const res = await GET(callbackRequest({ error: 'access_denied' }))
    expect(redirectTarget(res).pathname).toBe('/dashboard/settings')
  })

  it('redirects with missing_code when no code is present', async () => {
    mockGetCurrentUser.mockResolvedValue(null as never)
    const res = await GET(callbackRequest({}))
    expect(redirectTarget(res).searchParams.get('outlook_error')).toBe('missing_code')
  })

  it('redirects with token_exchange_failed when the exchange fails', async () => {
    mockGetCurrentUser.mockResolvedValue(null as never)
    mockExchange.mockResolvedValue({ ok: false, status: 400, errorCode: 'invalid_grant' })
    const res = await GET(callbackRequest({ code: 'bad' }))
    expect(redirectTarget(res).searchParams.get('outlook_error')).toBe('token_exchange_failed')
  })

  it('redirects with missing_access_token when the exchange returns no token', async () => {
    mockGetCurrentUser.mockResolvedValue(null as never)
    mockExchange.mockResolvedValue({ ok: true, status: 200, expiresIn: 3600 })
    const res = await GET(callbackRequest({ code: 'c' }))
    expect(redirectTarget(res).searchParams.get('outlook_error')).toBe('missing_access_token')
  })

  it('redirects with userinfo_failed when the Graph profile call fails', async () => {
    mockGetCurrentUser.mockResolvedValue(null as never)
    mockExchange.mockResolvedValue({ ok: true, status: 200, accessToken: 'at' })
    mockProfile.mockResolvedValue({ ok: false, status: 401 })
    const res = await GET(callbackRequest({ code: 'c' }))
    expect(redirectTarget(res).searchParams.get('outlook_error')).toBe('userinfo_failed')
  })

  it('redirects with no_email when both mail and userPrincipalName are absent', async () => {
    mockGetCurrentUser.mockResolvedValue(null as never)
    arrangeSuccessfulOAuth({ id: 'ms-user-1', displayName: 'A', mail: null, userPrincipalName: null })
    const res = await GET(callbackRequest({ code: 'c' }))
    expect(redirectTarget(res).searchParams.get('outlook_error')).toBe('no_email')
  })

  it('redirects to signin when session creation hits the device limit', async () => {
    mockGetCurrentUser.mockResolvedValue(null as never)
    arrangeSuccessfulOAuth()
    mockPrismaAccount.findUnique.mockResolvedValue({ userId: 'user-1' } as never)
    mockCreateSession.mockRejectedValue(new AppError('DEVICE_LIMIT_REACHED', 'too many devices', 403))
    const res = await GET(callbackRequest({ code: 'c' }))
    const target = redirectTarget(res)
    expect(target.pathname).toBe('/auth/signin')
    expect(target.searchParams.get('reason')).toBe('DEVICE_LIMIT_REACHED')
  })

  it('redirects with server_error on unexpected failures', async () => {
    mockGetCurrentUser.mockResolvedValue(null as never)
    arrangeSuccessfulOAuth()
    mockPrismaAccount.findUnique.mockRejectedValue(new Error('db down'))
    const res = await GET(callbackRequest({ code: 'c' }))
    expect(redirectTarget(res).searchParams.get('outlook_error')).toBe('server_error')
  })
})

describe('GET /api/auth/microsoft/callback — Path A (logged in, bind account)', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' } as never)
    arrangeSuccessfulOAuth()
  })

  it('upserts a microsoft account for the current user', async () => {
    mockPrismaUser.findFirst.mockResolvedValue(null as never) // email not owned by someone else
    mockPrismaAccount.findUnique.mockResolvedValue(null as never) // account not bound
    mockPrismaUser.update.mockResolvedValue({} as never)
    mockPrismaUser.updateMany.mockResolvedValue({ count: 0 } as never)
    mockPrismaAccount.upsert.mockResolvedValue({} as never)

    const res = await GET(callbackRequest({ code: 'c', state: 's' }))

    expect(mockPrismaAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: { provider: 'microsoft', providerAccountId: 'ms-user-1' },
        },
        create: expect.objectContaining({
          userId: 'user-1',
          type: 'oauth',
          provider: 'microsoft',
          providerAccountId: 'ms-user-1',
          access_token: 'ms-at',
          refresh_token: 'ms-rt',
          email: 'alice@outlook.com',
          syncEnabled: true,
        }),
      })
    )
    expect(mockMergeLedger).toHaveBeenCalledWith('user-1', 'alice@outlook.com', prisma)
    expect(redirectTarget(res).pathname).toBe('/dashboard')
    // No session is created for an already-logged-in user
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('never touches the user gmail token fields and only clears an outlook reauth flag', async () => {
    mockPrismaUser.findFirst.mockResolvedValue(null as never)
    mockPrismaAccount.findUnique.mockResolvedValue(null as never)
    mockPrismaUser.update.mockResolvedValue({} as never)
    mockPrismaUser.updateMany.mockResolvedValue({ count: 0 } as never)
    mockPrismaAccount.upsert.mockResolvedValue({} as never)

    await GET(callbackRequest({ code: 'c' }))

    expect(mockPrismaUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { syncEnabled: true },
    })
    expect(mockPrismaUser.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', emailProviderReauthProvider: 'outlook' },
      data: {
        emailProviderReauthRequired: false,
        emailProviderReauthReason: null,
        emailProviderReauthAt: null,
      },
    })
    for (const call of mockPrismaUser.update.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('gmail')
    }
  })

  it('rejects when the Microsoft email belongs to a different user', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({ id: 'other-user' } as never)
    const res = await GET(callbackRequest({ code: 'c' }))
    const target = redirectTarget(res)
    expect(target.pathname).toBe('/dashboard/settings')
    expect(target.searchParams.get('outlook_error')).toBe('email_already_registered')
  })

  it('rejects when the Microsoft account is bound to a different user', async () => {
    mockPrismaUser.findFirst.mockResolvedValue(null as never)
    mockPrismaAccount.findUnique.mockResolvedValue({ userId: 'other-user' } as never)
    const res = await GET(callbackRequest({ code: 'c' }))
    expect(redirectTarget(res).searchParams.get('outlook_error')).toBe(
      'microsoft_account_already_bound'
    )
  })
})

describe('GET /api/auth/microsoft/callback — Path B (existing binding, sign in)', () => {
  it('updates tokens and creates a session with remember from the state token', async () => {
    mockGetCurrentUser.mockResolvedValue(null as never)
    arrangeSuccessfulOAuth()
    mockPrismaAccount.findUnique.mockResolvedValue({ userId: 'user-2' } as never)
    mockPrismaUser.update.mockResolvedValue({} as never)
    mockPrismaUser.updateMany.mockResolvedValue({ count: 0 } as never)
    mockPrismaAccount.update.mockResolvedValue({} as never)
    mockCreateSession.mockResolvedValue({ rawToken: 'session-token' } as never)

    const res = await GET(callbackRequest({ code: 'c', state: 'signed-state' }))

    expect(mockPrismaAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: { provider: 'microsoft', providerAccountId: 'ms-user-1' },
        },
        data: expect.objectContaining({ access_token: 'ms-at', refresh_token: 'ms-rt' }),
      })
    )
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', userEmail: 'alice@outlook.com', remember: true })
    )
    expect(mockSetCookie).toHaveBeenCalledWith('session-token', true)
    expect(redirectTarget(res).pathname).toBe('/dashboard')
  })
})

describe('GET /api/auth/microsoft/callback — Path C (no binding)', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(null as never)
    arrangeSuccessfulOAuth()
    mockPrismaAccount.findUnique.mockResolvedValue(null as never)
    mockCreateSession.mockResolvedValue({ rawToken: 'session-token' } as never)
  })

  it('binds to an existing user with the same email', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({ id: 'user-3' } as never)
    mockPrismaUser.update.mockResolvedValue({} as never)
    mockPrismaUser.updateMany.mockResolvedValue({ count: 0 } as never)
    mockPrismaAccount.create.mockResolvedValue({} as never)

    await GET(callbackRequest({ code: 'c' }))

    expect(mockPrismaAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-3',
        provider: 'microsoft',
        providerAccountId: 'ms-user-1',
      }),
    })
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-3' })
    )
  })

  it('creates a brand-new user atomically with inherited quota', async () => {
    mockPrismaUser.findFirst.mockResolvedValue(null as never)
    mockInheritedQuota.mockResolvedValue({
      classifyUsed: 5,
      extractUsed: 2,
      pasteTextUsed: 1,
      quotaResetAt: new Date('2026-08-01'),
    } as never)
    mockPrismaUser.create.mockResolvedValue({ id: 'new-user' } as never)
    mockPrismaAccount.create.mockResolvedValue({} as never)

    await GET(callbackRequest({ code: 'c' }))

    expect(mockInheritedQuota).toHaveBeenCalledWith('alice@outlook.com', 'email')
    expect(mockPrismaUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'alice@outlook.com',
          name: 'Alice Outlook',
          classifyUsed: 5,
          extractUsed: 2,
          pasteTextUsed: 1,
          syncEnabled: true,
        }),
      })
    )
    expect(mockPrismaAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'new-user',
        provider: 'microsoft',
        providerAccountId: 'ms-user-1',
        access_token: 'ms-at',
      }),
    })
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 'new-user' }))
  })

  it('falls back to userPrincipalName when mail is empty', async () => {
    arrangeSuccessfulOAuth({
      id: 'ms-user-1',
      displayName: 'Alice',
      mail: null,
      userPrincipalName: 'alice.upn@contoso.com',
    })
    mockPrismaUser.findFirst.mockResolvedValue({ id: 'user-4' } as never)
    mockPrismaUser.update.mockResolvedValue({} as never)
    mockPrismaUser.updateMany.mockResolvedValue({ count: 0 } as never)
    mockPrismaAccount.create.mockResolvedValue({} as never)

    await GET(callbackRequest({ code: 'c' }))

    expect(mockPrismaUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'alice.upn@contoso.com' } })
    )
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ userEmail: 'alice.upn@contoso.com' })
    )
  })
})

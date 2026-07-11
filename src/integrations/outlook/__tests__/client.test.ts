import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    email: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/microsoft-oauth', () => ({
  refreshMicrosoftToken: vi.fn(),
}))

vi.mock('@/lib/provider-reauth', () => ({
  markProviderReauthRequired: vi.fn(),
  clearProviderReauthRequired: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { refreshMicrosoftToken } from '@/lib/microsoft-oauth'
import { AppError } from '@/lib/app-errors'
import { outlookProvider } from '../client'

const mockAccount = vi.mocked(prisma.account)
const mockUser = vi.mocked(prisma.user)
const mockEmail = vi.mocked(prisma.email)
const mockRefresh = vi.mocked(refreshMicrosoftToken)
const mockFetch = vi.fn()

const NOW = 1_750_000_000_000
const FRESH_EXPIRES_AT = Math.floor(NOW / 1000) + 3600
const STALE_EXPIRES_AT = Math.floor(NOW / 1000) - 60

const TOKEN_ROW = {
  access_token: 'stored-at',
  refresh_token: 'stored-rt',
  expires_at: FRESH_EXPIRES_AT,
  reauthRequired: false,
  reauthReason: null,
}

function graphPage(messages: object[], nextLink?: string): Response {
  return new Response(
    JSON.stringify({ value: messages, ...(nextLink ? { '@odata.nextLink': nextLink } : {}) }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

function graphMessage(id: string, overrides: object = {}) {
  return {
    id,
    conversationId: `conv-${id}`,
    subject: `Subject ${id}`,
    from: { emailAddress: { name: 'Bob Sender', address: 'bob@contoso.com' } },
    toRecipients: [{ emailAddress: { name: 'Alice', address: 'alice@outlook.com' } }],
    ccRecipients: [],
    receivedDateTime: '2026-07-10T12:00:00Z',
    bodyPreview: 'preview',
    body: { contentType: 'text', content: `Body of ${id}` },
    hasAttachments: false,
    isRead: false,
    importance: 'normal',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('token refresh', () => {
  it('does not refresh when the access token has more than 60s left', async () => {
    mockAccount.findFirst
      .mockResolvedValueOnce({ id: 'acc-1', email: 'alice@outlook.com' } as never)
      .mockResolvedValueOnce(TOKEN_ROW as never)
    mockEmail.findMany.mockResolvedValue([] as never)
    mockFetch.mockResolvedValue(graphPage([]))

    await outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1', since: new Date('2026-07-01') })

    expect(mockRefresh).not.toHaveBeenCalled()
    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer stored-at')
  })

  it('refreshes an expiring token and persists the rotated refresh token', async () => {
    mockAccount.findFirst
      .mockResolvedValueOnce({ id: 'acc-1', email: 'alice@outlook.com' } as never)
      .mockResolvedValueOnce({ ...TOKEN_ROW, expires_at: STALE_EXPIRES_AT } as never)
    mockEmail.findMany.mockResolvedValue([] as never)
    mockRefresh.mockResolvedValue({
      ok: true,
      status: 200,
      accessToken: 'new-at',
      refreshToken: 'rotated-rt',
      expiresIn: 3600,
    })
    mockFetch.mockResolvedValue(graphPage([]))

    await outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1', since: new Date('2026-07-01') })

    expect(mockRefresh).toHaveBeenCalledWith('stored-rt')
    expect(mockAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'acc-1' },
        data: expect.objectContaining({
          access_token: 'new-at',
          refresh_token: 'rotated-rt',
          expires_at: Math.floor(NOW / 1000) + 3600,
        }),
      })
    )
    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer new-at')
  })

  it('keeps the stored refresh token when the response omits a new one', async () => {
    mockAccount.findFirst
      .mockResolvedValueOnce({ id: 'acc-1', email: 'alice@outlook.com' } as never)
      .mockResolvedValueOnce({ ...TOKEN_ROW, expires_at: STALE_EXPIRES_AT } as never)
    mockEmail.findMany.mockResolvedValue([] as never)
    mockRefresh.mockResolvedValue({ ok: true, status: 200, accessToken: 'new-at', expiresIn: 3600 })
    mockFetch.mockResolvedValue(graphPage([]))

    await outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1', since: new Date('2026-07-01') })

    const updateData = mockAccount.update.mock.calls[0][0].data
    expect(updateData).not.toHaveProperty('refresh_token')
  })

  it('marks account reauth with invalid_grant and throws PROVIDER_REAUTH_REQUIRED', async () => {
    mockAccount.findFirst
      .mockResolvedValueOnce({ id: 'acc-1', email: 'alice@outlook.com' } as never)
      .mockResolvedValueOnce({ ...TOKEN_ROW, expires_at: STALE_EXPIRES_AT } as never)
    mockEmail.findMany.mockResolvedValue([] as never)
    mockRefresh.mockResolvedValue({ ok: false, status: 400, errorCode: 'invalid_grant' })

    await expect(
      outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1', since: new Date('2026-07-01') })
    ).rejects.toMatchObject({ code: 'PROVIDER_REAUTH_REQUIRED' })

    expect(mockAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'acc-1' },
        data: expect.objectContaining({
          reauthRequired: true,
          reauthReason: 'invalid_grant',
          reauthProvider: 'outlook',
        }),
      })
    )
  })

  it('throws SYNC_TEMPORARY_ERROR on 5xx/429 refresh failures without marking reauth', async () => {
    mockAccount.findFirst
      .mockResolvedValueOnce({ id: 'acc-1', email: 'alice@outlook.com' } as never)
      .mockResolvedValueOnce({ ...TOKEN_ROW, expires_at: STALE_EXPIRES_AT } as never)
    mockEmail.findMany.mockResolvedValue([] as never)
    mockRefresh.mockResolvedValue({ ok: false, status: 503 })

    await expect(
      outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1', since: new Date('2026-07-01') })
    ).rejects.toMatchObject({ code: 'SYNC_TEMPORARY_ERROR' })

    expect(mockAccount.update).not.toHaveBeenCalled()
  })

  it('marks reauth when no refresh token is stored', async () => {
    mockAccount.findFirst
      .mockResolvedValueOnce({ id: 'acc-1', email: 'alice@outlook.com' } as never)
      .mockResolvedValueOnce({ ...TOKEN_ROW, refresh_token: null } as never)
    mockEmail.findMany.mockResolvedValue([] as never)

    await expect(
      outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1', since: new Date('2026-07-01') })
    ).rejects.toMatchObject({ code: 'PROVIDER_REAUTH_REQUIRED' })

    expect(mockAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reauthReason: 'missing_refresh_token', reauthProvider: 'outlook' }),
      })
    )
  })
})

describe('fetchNewEmails', () => {
  function arrangeHappyPath() {
    mockAccount.findFirst
      .mockResolvedValueOnce({ id: 'acc-1', email: 'alice@outlook.com' } as never)
      .mockResolvedValueOnce(TOKEN_ROW as never)
    mockEmail.findMany.mockResolvedValue([] as never)
    mockAccount.update.mockResolvedValue({} as never)
  }

  it('requests the inbox with $filter/$orderby/$select and the text-body Prefer header', async () => {
    arrangeHappyPath()
    mockFetch.mockResolvedValue(graphPage([graphMessage('m1')]))

    const since = new Date('2026-07-01T00:00:00.000Z')
    await outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1', since })

    const [url, init] = mockFetch.mock.calls[0]
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages'
    )
    expect(parsed.searchParams.get('$top')).toBe('50')
    expect(parsed.searchParams.get('$orderby')).toBe('receivedDateTime desc')
    expect(parsed.searchParams.get('$filter')).toBe('receivedDateTime ge 2026-07-01T00:00:00.000Z')
    expect(parsed.searchParams.get('$select')).toContain('internetMessageId')
    expect(init.headers.Prefer).toBe('outlook.body-content-type="text"')
  })

  it('maps Graph messages to the EmailMessage shape', async () => {
    arrangeHappyPath()
    mockFetch.mockResolvedValue(
      graphPage([graphMessage('m1', { importance: 'high', hasAttachments: true })])
    )

    const messages = await outlookProvider.fetchNewEmails('user-1', {
      accountId: 'acc-1',
      since: new Date('2026-07-01'),
    })

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      accountId: 'acc-1',
      accountEmail: 'alice@outlook.com',
      providerMessageId: 'm1',
      threadId: 'conv-m1',
      subject: 'Subject m1',
      sender: 'Bob Sender <bob@contoso.com>',
      recipients: ['Alice <alice@outlook.com>'],
      bodyFull: 'Body of m1',
      bodyHtml: null,
      hasAttachments: true,
      labels: ['INBOX', 'UNREAD', 'IMPORTANT'],
      providerCategories: [],
    })
    expect(messages[0].receivedAt).toEqual(new Date('2026-07-10T12:00:00Z'))
  })

  it('converts an HTML body to text and keeps the original html', async () => {
    arrangeHappyPath()
    mockFetch.mockResolvedValue(
      graphPage([
        graphMessage('m1', {
          body: { contentType: 'html', content: '<p>Hello <b>world</b></p>' },
        }),
      ])
    )

    const messages = await outlookProvider.fetchNewEmails('user-1', {
      accountId: 'acc-1',
      since: new Date('2026-07-01'),
    })

    expect(messages[0].bodyFull).toBe('Hello world')
    expect(messages[0].bodyHtml).toBe('<p>Hello <b>world</b></p>')
  })

  it('skips messages that already exist for this account', async () => {
    mockAccount.findFirst
      .mockResolvedValueOnce({ id: 'acc-1', email: 'alice@outlook.com' } as never)
      .mockResolvedValueOnce(TOKEN_ROW as never)
    mockEmail.findMany.mockResolvedValue([{ providerMessageId: 'm1' }] as never)
    mockAccount.update.mockResolvedValue({} as never)
    mockFetch.mockResolvedValue(graphPage([graphMessage('m1'), graphMessage('m2')]))

    const messages = await outlookProvider.fetchNewEmails('user-1', {
      accountId: 'acc-1',
      since: new Date('2026-07-01'),
    })

    expect(messages.map((m) => m.providerMessageId)).toEqual(['m2'])
    expect(mockEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', accountId: 'acc-1' } })
    )
  })

  it('follows @odata.nextLink and stops when maxResults is reached', async () => {
    arrangeHappyPath()
    mockFetch
      .mockResolvedValueOnce(
        graphPage([graphMessage('m1'), graphMessage('m2')], 'https://graph.microsoft.com/next-page')
      )
      .mockResolvedValueOnce(graphPage([graphMessage('m3'), graphMessage('m4')]))

    const messages = await outlookProvider.fetchNewEmails('user-1', {
      accountId: 'acc-1',
      since: new Date('2026-07-01'),
      maxResults: 3,
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[1][0]).toBe('https://graph.microsoft.com/next-page')
    expect(messages).toHaveLength(3)
  })

  it('stops paginating at the hard page cap even if nextLink continues', async () => {
    arrangeHappyPath()
    // A Response body can only be read once — build a fresh page per call
    mockFetch.mockImplementation(async () => graphPage([], 'https://graph.microsoft.com/endless'))

    const messages = await outlookProvider.fetchNewEmails('user-1', {
      accountId: 'acc-1',
      since: new Date('2026-07-01'),
    })

    expect(mockFetch).toHaveBeenCalledTimes(5)
    expect(messages).toHaveLength(0)
  })

  it('persists a 7-day syncStartDate when the user has none', async () => {
    mockAccount.findFirst
      .mockResolvedValueOnce({ id: 'acc-1', email: 'alice@outlook.com' } as never)
      .mockResolvedValueOnce(TOKEN_ROW as never)
    mockUser.findUnique.mockResolvedValue({ syncStartDate: null } as never)
    mockUser.update.mockResolvedValue({} as never)
    mockEmail.findMany.mockResolvedValue([] as never)
    mockAccount.update.mockResolvedValue({} as never)
    mockFetch.mockResolvedValue(graphPage([]))

    await outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1' })

    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { syncStartDate: expect.any(Date) },
      })
    )
  })

  it('maps a Graph 401 to PROVIDER_REAUTH_REQUIRED', async () => {
    arrangeHappyPath()
    mockFetch.mockResolvedValue(new Response('unauthorized', { status: 401 }))

    await expect(
      outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1', since: new Date('2026-07-01') })
    ).rejects.toMatchObject({ code: 'PROVIDER_REAUTH_REQUIRED' })
  })

  it('maps a Graph 503 to SYNC_TEMPORARY_ERROR', async () => {
    arrangeHappyPath()
    mockFetch.mockResolvedValue(new Response('unavailable', { status: 503 }))

    await expect(
      outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1', since: new Date('2026-07-01') })
    ).rejects.toMatchObject({ code: 'SYNC_TEMPORARY_ERROR' })
  })
})

describe('previewCount', () => {
  it('counts ids across pages and reports capped when the soft cap is hit', async () => {
    mockAccount.findFirst.mockResolvedValueOnce(TOKEN_ROW as never)
    const page = Array.from({ length: 500 }, (_, i) => ({ id: `m${i}` }))
    mockFetch.mockResolvedValue(graphPage(page, 'https://graph.microsoft.com/more'))

    const result = await outlookProvider.previewCount('user-1', {
      since: new Date('2026-07-01'),
      accountId: 'acc-1',
    })

    expect(result).toEqual({ quotaImpactCount: 500, capped: true })
  })

  it('returns an exact count when pages are exhausted', async () => {
    mockAccount.findFirst.mockResolvedValueOnce(TOKEN_ROW as never)
    mockFetch
      .mockResolvedValueOnce(graphPage([{ id: 'a' }, { id: 'b' }], 'https://graph.microsoft.com/p2'))
      .mockResolvedValueOnce(graphPage([{ id: 'c' }]))

    const result = await outlookProvider.previewCount('user-1', {
      since: new Date('2026-07-01'),
      accountId: 'acc-1',
    })

    expect(result).toEqual({ quotaImpactCount: 3, capped: false })
  })
})

describe('disconnect', () => {
  it('clears account tokens without any revoke HTTP call or gmail field writes', async () => {
    mockAccount.update.mockResolvedValue({} as never)
    mockAccount.count.mockResolvedValue(1 as never)
    mockUser.updateMany.mockResolvedValue({ count: 0 } as never)

    await outlookProvider.disconnect('user-1', 'acc-1')

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        access_token: null,
        refresh_token: null,
        expires_at: null,
        syncEnabled: false,
      }),
    })
    // Another provider still has an enabled account → user-level sync untouched
    expect(mockUser.update).not.toHaveBeenCalled()
    for (const call of mockUser.updateMany.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('gmail')
    }
  })

  it('shuts off user-level sync only when no enabled account remains on any provider', async () => {
    mockAccount.update.mockResolvedValue({} as never)
    mockAccount.count.mockResolvedValue(0 as never)
    mockUser.update.mockResolvedValue({} as never)
    mockUser.updateMany.mockResolvedValue({ count: 0 } as never)

    await outlookProvider.disconnect('user-1', 'acc-1')

    expect(mockAccount.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', syncEnabled: true },
    })
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { syncEnabled: false, lastSyncAt: null },
    })
  })

  it('clears the user-level reauth flag only when Outlook set it', async () => {
    mockAccount.updateMany.mockResolvedValue({ count: 1 } as never)
    mockAccount.count.mockResolvedValue(1 as never)
    mockUser.updateMany.mockResolvedValue({ count: 0 } as never)

    await outlookProvider.disconnect('user-1')

    expect(mockUser.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', emailProviderReauthProvider: 'outlook' },
      data: {
        emailProviderReauthRequired: false,
        emailProviderReauthReason: null,
        emailProviderReauthAt: null,
        emailProviderReauthProvider: null,
      },
    })
  })
})

describe('AppError propagation', () => {
  it('rethrows AppErrors unchanged from fetchNewEmails', async () => {
    mockAccount.findFirst.mockResolvedValueOnce(null as never)

    await expect(
      outlookProvider.fetchNewEmails('user-1', { accountId: 'acc-1', since: new Date() })
    ).rejects.toBeInstanceOf(AppError)
  })
})

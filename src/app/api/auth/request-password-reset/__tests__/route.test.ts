import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    passwordResetToken: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/lib/mailer', () => ({
  sendPasswordResetEmail: vi.fn(),
}))

vi.mock('@/lib/password-reset', () => ({
  hashResetToken: vi.fn(),
  getTokenTtlMs: vi.fn(),
  RATE_LIMIT_SECONDS: 60,
}))

import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/api-helpers'
import { sendPasswordResetEmail } from '@/lib/mailer'
import { hashResetToken, getTokenTtlMs } from '@/lib/password-reset'
import { POST } from '../route'

const mockUser = vi.mocked(prisma.user)
const mockPasswordResetToken = vi.mocked(prisma.passwordResetToken)
const mockGetAuthUser = vi.mocked(getAuthUser)
const mockSendPasswordResetEmail = vi.mocked(sendPasswordResetEmail)
const mockHashResetToken = vi.mocked(hashResetToken)
const mockGetTokenTtlMs = vi.mocked(getTokenTtlMs)

function postRequest(body?: object): Request {
  return new Request('http://localhost/api/auth/request-password-reset', {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'content-type': 'application/json' } : {},
  })
}

describe('POST /api/auth/request-password-reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue(null)
    mockPasswordResetToken.findFirst.mockResolvedValue(null)
    mockPasswordResetToken.updateMany.mockResolvedValue({ count: 0 } as never)
    mockPasswordResetToken.create.mockResolvedValue({} as never)
    mockSendPasswordResetEmail.mockResolvedValue(undefined as never)
    mockHashResetToken.mockReturnValue('hashed-tok')
    mockGetTokenTtlMs.mockReturnValue(3600000)
  })

  it('returns 400 when unauthenticated and no email provided', async () => {
    const res = await POST(postRequest())
    expect(res.status).toBe(400)
  })

  it('returns generic success for unauthenticated request with unknown email', async () => {
    mockUser.findUnique.mockResolvedValue(null)

    const res = await POST(postRequest({ email: 'nobody@example.com' }))

    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('returns generic success for unauthenticated request with OAuth-only account', async () => {
    mockUser.findUnique.mockResolvedValue({ id: 'user-1', email: 'alice@example.com', passwordHash: null } as never)

    const res = await POST(postRequest({ email: 'alice@example.com' }))

    expect(res.status).toBe(200)
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limit has not elapsed', async () => {
    mockUser.findUnique.mockResolvedValue({ id: 'user-1', email: 'alice@example.com', passwordHash: '$2b$hash' } as never)
    mockPasswordResetToken.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 10 * 1000),
    } as never)

    const res = await POST(postRequest({ email: 'alice@example.com' }))

    expect(res.status).toBe(429)
  })

  it('sends reset email for unauthenticated valid request', async () => {
    mockUser.findUnique.mockResolvedValue({ id: 'user-1', email: 'alice@example.com', passwordHash: '$2b$hash' } as never)

    const res = await POST(postRequest({ email: 'alice@example.com' }))

    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith('alice@example.com', expect.stringContaining('/reset-password?token='))
    expect(res.status).toBe(200)
  })

  it('sends reset email for authenticated user without body', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
    mockUser.findUnique.mockResolvedValue({ id: 'user-1', email: 'alice@example.com', passwordHash: '$2b$hash' } as never)

    const res = await POST(postRequest())

    expect(mockSendPasswordResetEmail).toHaveBeenCalled()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.message).toContain('sent')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passwordResetToken: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth-password', () => ({
  verifyPassword: vi.fn(),
}))

vi.mock('@/lib/auth-token', () => ({
  createToken: vi.fn().mockReturnValue('mock-temp-token'),
  setSessionCookie: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth-sessions', () => ({
  createUserSession: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual, getAuthUser: vi.fn().mockResolvedValue(null) }
})

vi.mock('@/lib/mailer', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendPasswordSetupEmail: vi.fn(),
}))

vi.mock('@/lib/password-reset', () => ({
  hashResetToken: vi.fn().mockReturnValue('hashed-token'),
  getTokenTtlMs: vi.fn().mockReturnValue(3_600_000),
  RATE_LIMIT_SECONDS: 60,
}))

import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/auth-password'
import { getAuthUser } from '@/lib/api-helpers'
import { sendPasswordResetEmail, sendPasswordSetupEmail } from '@/lib/mailer'
import { POST as loginPost } from '../login/route'
import { POST as resetPost } from '../request-password-reset/route'

const mockUser = vi.mocked(prisma.user)
const mockVerify = vi.mocked(verifyPassword)
const mockPasswordResetToken = vi.mocked(prisma.passwordResetToken)

const VALID_USER = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  passwordHash: '$2b$10$hashed',
  isAdmin: false,
  totpEnabled: false,
}

function loginRequest(body: object): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function resetRequest(body: object): Request {
  return new Request('http://localhost/api/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAuthUser).mockResolvedValue(null as never)
  mockPasswordResetToken.findFirst.mockResolvedValue(null)
  mockPasswordResetToken.updateMany.mockResolvedValue({ count: 0 } as never)
  mockPasswordResetToken.create.mockResolvedValue({} as never)
  vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined as never)
  vi.mocked(sendPasswordSetupEmail).mockResolvedValue(undefined as never)
})

// ─── Anti-enumeration: login ───────────────────────────────────────────────────

describe('Anti-enumeration: login', () => {
  it('returns identical status code for nonexistent user and wrong password', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    const res1 = await loginPost(loginRequest({ email: 'nobody@example.com', password: 'secret' }))

    mockUser.findUnique.mockResolvedValue(VALID_USER as never)
    mockVerify.mockResolvedValue(false)
    const res2 = await loginPost(loginRequest({ email: 'alice@example.com', password: 'wrong' }))

    expect(res1.status).toBe(res2.status)
  })

  it('returns identical error message for nonexistent user and wrong password', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    const res1 = await loginPost(loginRequest({ email: 'nobody@example.com', password: 'secret' }))
    const body1 = await res1.json()

    mockUser.findUnique.mockResolvedValue(VALID_USER as never)
    mockVerify.mockResolvedValue(false)
    const res2 = await loginPost(loginRequest({ email: 'alice@example.com', password: 'wrong' }))
    const body2 = await res2.json()

    expect(body1.error).toEqual(body2.error)
  })

  it('error message for nonexistent user does not hint that the account is missing', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    const res = await loginPost(loginRequest({ email: 'nobody@example.com', password: 'secret' }))
    const body = await res.json()
    const message = (body.error?.message ?? body.error ?? '').toLowerCase()

    expect(message).not.toContain('not found')
    expect(message).not.toContain('does not exist')
    expect(message).not.toContain('no account')
    expect(message).not.toContain('no user')
    expect(message).not.toContain('unregistered')
  })
})

// ─── Anti-enumeration: password reset ─────────────────────────────────────────

describe('Anti-enumeration: password reset', () => {
  it('returns the same status and success flag for unknown and known email', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    const res1 = await resetPost(resetRequest({ email: 'nobody@example.com' }))
    const body1 = await res1.json()

    mockUser.findUnique.mockResolvedValue(VALID_USER as never)
    const res2 = await resetPost(resetRequest({ email: 'alice@example.com' }))
    const body2 = await res2.json()

    expect(res1.status).toBe(res2.status)
    expect(body1.success).toBe(body2.success)
  })

  it('response for unknown email does not reveal account non-existence', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    const res = await resetPost(resetRequest({ email: 'nobody@example.com' }))
    const body = await res.json()

    expect(body.success).toBe(true)
    const payload = JSON.stringify(body).toLowerCase()
    expect(payload).not.toContain('not found')
    expect(payload).not.toContain('does not exist')
    expect(payload).not.toContain('no account')
    expect(payload).not.toContain('invalid email')
  })

  it('does not send a reset email when the address is unknown', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    await resetPost(resetRequest({ email: 'nobody@example.com' }))
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
    expect(sendPasswordSetupEmail).not.toHaveBeenCalled()
  })

  it('does not send any email for an unauthenticated request against an OAuth-only account', async () => {
    mockUser.findUnique.mockResolvedValue({ ...VALID_USER, passwordHash: null } as never)
    const res = await resetPost(resetRequest({ email: 'alice@example.com' }))

    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
    expect(sendPasswordSetupEmail).not.toHaveBeenCalled()
  })
})

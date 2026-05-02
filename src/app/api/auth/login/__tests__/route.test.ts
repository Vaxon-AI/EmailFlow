import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn() } },
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

import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/auth-password'
import { createUserSession } from '@/lib/auth-sessions'
import { POST } from '../route'

const mockUser = vi.mocked(prisma.user)
const mockVerify = vi.mocked(verifyPassword)
const mockCreateSession = vi.mocked(createUserSession)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const STORED_USER = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  passwordHash: '$2b$10$hashed',
  isAdmin: false,
  totpEnabled: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/login', () => {
  it('returns 400 when email is missing', async () => {
    const res = await POST(postRequest({ password: 'secret123' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('returns 400 when password is missing', async () => {
    const res = await POST(postRequest({ email: 'alice@example.com' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('returns 401 when user is not found', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    const res = await POST(postRequest({ email: 'nobody@example.com', password: 'secret' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('returns 401 when password is incorrect', async () => {
    mockUser.findUnique.mockResolvedValue(STORED_USER as never)
    mockVerify.mockResolvedValue(false)
    const res = await POST(postRequest({ email: 'alice@example.com', password: 'wrong' }))
    expect(res.status).toBe(401)
  })

  it('returns user data and session on successful login', async () => {
    mockUser.findUnique.mockResolvedValue(STORED_USER as never)
    mockVerify.mockResolvedValue(true)
    mockCreateSession.mockResolvedValue({ rawToken: 'tok', isNewDevice: false, session: {} as never, expiresAt: new Date() })
    const res = await POST(postRequest({ email: 'alice@example.com', password: 'correct' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.requiresTwoFactor).toBe(false)
    expect(body.data.email).toBe('alice@example.com')
  })

  it('returns tempToken when TOTP is enabled', async () => {
    mockUser.findUnique.mockResolvedValue({ ...STORED_USER, totpEnabled: true } as never)
    mockVerify.mockResolvedValue(true)
    const res = await POST(postRequest({ email: 'alice@example.com', password: 'correct' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requiresTwoFactor).toBe(true)
    expect(body.tempToken).toBeDefined()
  })

  it('returns 500 on unexpected error', async () => {
    mockUser.findUnique.mockRejectedValue(new Error('DB down'))
    const res = await POST(postRequest({ email: 'alice@example.com', password: 'pass' }))
    expect(res.status).toBe(500)
  })
})

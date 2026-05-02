import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth-password', () => ({
  hashPassword: vi.fn(),
}))

vi.mock('@/lib/auth-token', () => ({
  setSessionCookie: vi.fn(),
}))

vi.mock('@/lib/auth-sessions', () => ({
  createUserSession: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth-password'
import { setSessionCookie } from '@/lib/auth-token'
import { createUserSession } from '@/lib/auth-sessions'
import { POST } from '../route'

const mockUser = vi.mocked(prisma.user)
const mockHashPassword = vi.mocked(hashPassword)
const mockSetSessionCookie = vi.mocked(setSessionCookie)
const mockCreateUserSession = vi.mocked(createUserSession)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when email is missing', async () => {
    const res = await POST(postRequest({ password: 'password123' }))
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

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = await POST(postRequest({ email: 'alice@example.com', password: 'short' }))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('returns 409 when email is already registered', async () => {
    mockUser.findUnique.mockResolvedValue({ id: 'existing-1' } as never)

    const res = await POST(postRequest({ email: 'alice@example.com', password: 'password123' }))

    expect(res.status).toBe(409)
    expect((await res.json()).success).toBe(false)
  })

  it('creates user, session, sets cookie and returns user data', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    mockHashPassword.mockResolvedValue('$2b$hash' as never)
    mockUser.create.mockResolvedValue({ id: 'user-1', email: 'alice@example.com', name: 'alice' } as never)
    mockCreateUserSession.mockResolvedValue({ rawToken: 'tok123' } as never)
    mockSetSessionCookie.mockResolvedValue(undefined as never)

    const res = await POST(postRequest({ email: 'alice@example.com', password: 'password123', name: 'Alice' }))

    expect(mockUser.create).toHaveBeenCalledWith({
      data: {
        email: 'alice@example.com',
        name: 'Alice',
        passwordHash: '$2b$hash',
      },
    })
    expect(mockSetSessionCookie).toHaveBeenCalledWith('tok123')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.email).toBe('alice@example.com')
  })

  it('derives name from email when name is omitted', async () => {
    mockUser.findUnique.mockResolvedValue(null)
    mockHashPassword.mockResolvedValue('$2b$hash' as never)
    mockUser.create.mockResolvedValue({ id: 'user-1', email: 'bob@example.com', name: 'bob' } as never)
    mockCreateUserSession.mockResolvedValue({ rawToken: 'tok' } as never)
    mockSetSessionCookie.mockResolvedValue(undefined as never)

    await POST(postRequest({ email: 'bob@example.com', password: 'password123' }))

    expect(mockUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'bob' }) })
    )
  })
})

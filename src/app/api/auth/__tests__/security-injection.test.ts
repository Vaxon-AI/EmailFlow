import { beforeEach, describe, expect, it, vi } from 'vitest'

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
import { POST } from '../login/route'

const mockUser = vi.mocked(prisma.user)
const mockVerify = vi.mocked(verifyPassword)

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const VALID_USER = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  passwordHash: '$2b$10$hashed',
  isAdmin: false,
  totpEnabled: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUser.findUnique.mockResolvedValue(null)
})

// ─── SQL injection ─────────────────────────────────────────────────────────────

describe('SQL injection: login endpoint', () => {
  it('passes SQL injection email as a literal string to Prisma (no auth bypass)', async () => {
    const payload = "' OR '1'='1"
    const res = await POST(postRequest({ email: payload, password: 'secret' }))

    // Prisma uses parameterized queries — the string is passed verbatim, not interpreted
    expect(mockUser.findUnique).toHaveBeenCalledWith({ where: { email: payload } })
    expect(res.status).toBe(401)
  })

  it('SQL injection in password field does not bypass bcrypt comparison', async () => {
    mockUser.findUnique.mockResolvedValue(VALID_USER as never)
    mockVerify.mockResolvedValue(false)

    const maliciousPassword = "'; DROP TABLE users;--"
    const res = await POST(postRequest({ email: 'alice@example.com', password: maliciousPassword }))

    expect(mockVerify).toHaveBeenCalledWith(maliciousPassword, VALID_USER.passwordHash)
    expect(res.status).toBe(401)
  })

  it('classic SQL bypass payload does not authenticate', async () => {
    const res = await POST(postRequest({ email: "' OR 1=1--", password: "' OR 1=1--" }))
    expect(res.status).toBe(401)
  })
})

// ─── Oversized input ───────────────────────────────────────────────────────────

describe('Oversized input: login endpoint', () => {
  it('handles 2000-character email without crashing', async () => {
    const longEmail = 'a'.repeat(1990) + '@test.com'
    const res = await POST(postRequest({ email: longEmail, password: 'secret' }))
    expect(res.status).toBeLessThan(500)
  })

  it('handles 10000-character password without crashing', async () => {
    mockUser.findUnique.mockResolvedValue(VALID_USER as never)
    mockVerify.mockResolvedValue(false)
    const longPassword = 'a'.repeat(10_000)
    const res = await POST(postRequest({ email: 'alice@example.com', password: longPassword }))
    expect(res.status).toBeLessThan(500)
  })
})

// ─── Type confusion ────────────────────────────────────────────────────────────

describe('Type confusion: login endpoint', () => {
  it('rejects null email with 400', async () => {
    const res = await POST(postRequest({ email: null, password: 'secret' }))
    expect(res.status).toBe(400)
  })

  it('rejects missing password with 400', async () => {
    const res = await POST(postRequest({ email: 'alice@example.com' }))
    expect(res.status).toBe(400)
  })

  it('handles object-typed email (JSON/NoSQL injection style) without auth bypass', async () => {
    // If the object bypasses the !email check and reaches Prisma, Prisma rejects it
    mockUser.findUnique.mockRejectedValue(new Error('Prisma: invalid input type'))
    const res = await POST(postRequest({ email: { $gt: '' }, password: 'secret' }))
    // Must not be 200 — any error is acceptable, but no auth bypass
    expect(res.status).not.toBe(200)
  })

  it('handles array email without auth bypass', async () => {
    const res = await POST(postRequest({ email: ['alice@example.com'], password: 'secret' }))
    expect(res.status).not.toBe(200)
  })
})

// ─── XSS payloads ─────────────────────────────────────────────────────────────

describe('XSS payloads: login endpoint', () => {
  it('handles XSS script tag in email without crashing and without auth bypass', async () => {
    const xssEmail = '<script>alert("xss")</script>@example.com'
    const res = await POST(postRequest({ email: xssEmail, password: 'secret' }))

    // No user matches — Prisma is called with the raw string (output escaping is React's job)
    expect(mockUser.findUnique).toHaveBeenCalledWith({ where: { email: xssEmail } })
    expect(res.status).toBe(401)
  })
})

// ─── Null byte injection ───────────────────────────────────────────────────────

describe('Null byte injection: login endpoint', () => {
  it('handles null byte in password without crashing', async () => {
    mockUser.findUnique.mockResolvedValue(VALID_USER as never)
    mockVerify.mockResolvedValue(false)
    const res = await POST(postRequest({ email: 'alice@example.com', password: 'pass\0word' }))
    expect(res.status).not.toBe(500)
  })
})

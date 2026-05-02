import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    passwordResetToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual }
})

vi.mock('@/lib/auth-password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}))

vi.mock('@/lib/password-reset', () => ({
  hashResetToken: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/auth-password'
import { hashResetToken } from '@/lib/password-reset'
import { POST } from '../route'

const mockPasswordResetToken = vi.mocked(prisma.passwordResetToken)
const mockTransaction = vi.mocked(prisma.$transaction)
const mockHashPassword = vi.mocked(hashPassword)
const mockVerifyPassword = vi.mocked(verifyPassword)
const mockHashResetToken = vi.mocked(hashResetToken)

const VALID_RECORD = {
  id: 'tok-1',
  usedAt: null,
  expiresAt: new Date(Date.now() + 3600 * 1000),
  user: { id: 'user-1', email: 'alice@example.com', passwordHash: '$2b$old' },
}

function postRequest(body: object): Request {
  return new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHashResetToken.mockReturnValue('hashed-tok')
    mockTransaction.mockResolvedValue([] as never)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(postRequest({ token: 'abc', newPassword: 'newpass1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when passwords do not match', async () => {
    const res = await POST(postRequest({ token: 'abc', newPassword: 'newpass123', confirmPassword: 'different' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = await POST(postRequest({ token: 'abc', newPassword: 'short', confirmPassword: 'short' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when token is invalid', async () => {
    mockPasswordResetToken.findUnique.mockResolvedValue(null)

    const res = await POST(postRequest({ token: 'badtoken', newPassword: 'newpass123', confirmPassword: 'newpass123' }))

    expect(res.status).toBe(400)
  })

  it('returns 400 when token has expired', async () => {
    mockPasswordResetToken.findUnique.mockResolvedValue({
      ...VALID_RECORD,
      expiresAt: new Date(Date.now() - 1000),
    } as never)

    const res = await POST(postRequest({ token: 'expiredtok', newPassword: 'newpass123', confirmPassword: 'newpass123' }))

    expect(res.status).toBe(400)
  })

  it('returns 400 when new password matches the current one', async () => {
    mockPasswordResetToken.findUnique.mockResolvedValue(VALID_RECORD as never)
    mockVerifyPassword.mockResolvedValue(true)

    const res = await POST(postRequest({ token: 'tok', newPassword: 'samepass1', confirmPassword: 'samepass1' }))

    expect(res.status).toBe(400)
  })

  it('resets password and marks token as used on success', async () => {
    mockPasswordResetToken.findUnique.mockResolvedValue(VALID_RECORD as never)
    mockVerifyPassword.mockResolvedValue(false)
    mockHashPassword.mockResolvedValue('$2b$new' as never)

    const res = await POST(postRequest({ token: 'tok', newPassword: 'newpass123', confirmPassword: 'newpass123' }))

    expect(mockTransaction).toHaveBeenCalled()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.message).toContain('reset successfully')
  })
})

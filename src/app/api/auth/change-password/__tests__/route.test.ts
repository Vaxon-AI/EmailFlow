import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth-password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}))

vi.mock('@/lib/step-up-auth', () => ({
  consumeStepUpToken: vi.fn(),
}))

vi.mock('@/lib/auth-sessions', () => ({
  requireCurrentSessionContext: vi.fn(),
  revokeOtherSessions: vi.fn(),
}))

import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/auth-password'
import { consumeStepUpToken } from '@/lib/step-up-auth'
import { revokeOtherSessions } from '@/lib/auth-sessions'
import { POST } from '../route'

const mockRequireContext = vi.mocked(requireCurrentSessionContext)
const mockUser = vi.mocked(prisma.user)
const mockHashPassword = vi.mocked(hashPassword)
const mockVerifyPassword = vi.mocked(verifyPassword)
const mockConsumeStepUpToken = vi.mocked(consumeStepUpToken)
const mockRevokeOtherSessions = vi.mocked(revokeOtherSessions)

const SESSION_CONTEXT = {
  user: { id: 'user-1', email: 'alice@example.com' },
  session: { id: 'session-1', userId: 'user-1' },
}

function postRequest(body: object): Request {
  return new Request('http://localhost/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/auth/change-password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireContext.mockResolvedValue(SESSION_CONTEXT as never)
    mockConsumeStepUpToken.mockResolvedValue(undefined as never)
    mockRevokeOtherSessions.mockResolvedValue(undefined as never)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(postRequest({ currentPassword: 'old', newPassword: 'newpass1' }))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('returns 400 when account has no password hash', async () => {
    mockUser.findUnique.mockResolvedValue({ passwordHash: null } as never)

    const res = await POST(postRequest({ currentPassword: 'old', newPassword: 'newpass123', stepUpToken: 'tok' }))

    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('returns 401 when current password is wrong', async () => {
    mockUser.findUnique.mockResolvedValue({ passwordHash: '$2b$old' } as never)
    mockVerifyPassword.mockResolvedValueOnce(false)

    const res = await POST(postRequest({ currentPassword: 'wrong', newPassword: 'newpass123', stepUpToken: 'tok' }))

    expect(res.status).toBe(401)
  })

  it('returns 400 when new password is shorter than 8 characters', async () => {
    mockUser.findUnique.mockResolvedValue({ passwordHash: '$2b$old' } as never)
    mockVerifyPassword.mockResolvedValueOnce(true)

    const res = await POST(postRequest({ currentPassword: 'old', newPassword: 'short', stepUpToken: 'tok' }))

    expect(res.status).toBe(400)
  })

  it('returns 400 when new password is same as old password', async () => {
    mockUser.findUnique.mockResolvedValue({ passwordHash: '$2b$old' } as never)
    mockVerifyPassword.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    const res = await POST(postRequest({ currentPassword: 'samepass1', newPassword: 'samepass1', stepUpToken: 'tok' }))

    expect(res.status).toBe(400)
  })

  it('updates password, revokes other sessions, and returns success', async () => {
    mockUser.findUnique.mockResolvedValue({ passwordHash: '$2b$old' } as never)
    mockVerifyPassword.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    mockHashPassword.mockResolvedValue('$2b$new' as never)
    mockUser.update.mockResolvedValue({} as never)

    const res = await POST(postRequest({ currentPassword: 'oldpass1', newPassword: 'newpass123', stepUpToken: 'tok' }))

    expect(mockConsumeStepUpToken).toHaveBeenCalledWith('user-1', 'tok', 'change_password')
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: '$2b$new' },
    })
    expect(mockRevokeOtherSessions).toHaveBeenCalledWith('user-1', 'session-1')
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })
})

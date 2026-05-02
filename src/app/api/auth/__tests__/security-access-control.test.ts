import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-session', () => ({
  requireCurrentSessionContext: vi.fn(),
}))

vi.mock('@/lib/auth-sessions', () => ({
  revokeSessionById: vi.fn(),
  revokeOtherSessions: vi.fn(),
}))

vi.mock('@/lib/step-up-auth', () => ({
  consumeStepUpToken: vi.fn(),
}))

vi.mock('@/lib/auth-password', () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
}))

vi.mock('@/lib/auth-token', () => ({
  clearSessionCookie: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { AppError } from '@/lib/app-errors'
import { requireCurrentSessionContext } from '@/lib/auth-session'
import { revokeSessionById, revokeOtherSessions } from '@/lib/auth-sessions'
import { consumeStepUpToken } from '@/lib/step-up-auth'
import { verifyPassword, hashPassword } from '@/lib/auth-password'
import { prisma } from '@/lib/prisma'
import { POST as revokeSession } from '../sessions/[id]/revoke/route'
import { DELETE as deleteAccount } from '../account/route'
import { POST as changePassword } from '../change-password/route'

const mockRequireContext = vi.mocked(requireCurrentSessionContext)
const mockRevokeSessionById = vi.mocked(revokeSessionById)
const mockRevokeOtherSessions = vi.mocked(revokeOtherSessions)
const mockConsumeStepUpToken = vi.mocked(consumeStepUpToken)
const mockVerifyPassword = vi.mocked(verifyPassword)
const mockHashPassword = vi.mocked(hashPassword)

const ATTACKER_CONTEXT = {
  user: { id: 'user-attacker' },
  session: { id: 'session-attacker', userId: 'user-attacker' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireContext.mockResolvedValue(ATTACKER_CONTEXT as never)
})

// ─── IDOR: Session revocation ─────────────────────────────────────────────────

describe('IDOR: session revocation', () => {
  it('passes the authenticated user\'s ID to revokeSessionById, not the URL session owner\'s', async () => {
    mockRevokeSessionById.mockResolvedValue(false as never)

    const res = await revokeSession(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'victim-session-id' }),
    })

    // The DB query must scope to user-attacker, so user-attacker cannot revoke victim's session
    expect(mockRevokeSessionById).toHaveBeenCalledWith('victim-session-id', 'user-attacker')
    expect(res.status).toBe(404)
  })
})

// ─── IDOR: Account deletion ───────────────────────────────────────────────────

describe('IDOR: account deletion', () => {
  it('deletes the authenticated user\'s account even if body contains a different userId', async () => {
    mockConsumeStepUpToken.mockResolvedValue(undefined as never)
    vi.mocked(prisma.user.delete).mockResolvedValue({} as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never)

    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({ stepUpToken: 'valid-token', userId: 'victim-user-id' }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await deleteAccount(req)
    expect(res.status).toBe(200)
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-attacker' } })
    expect(prisma.user.delete).not.toHaveBeenCalledWith({ where: { id: 'victim-user-id' } })
  })

  it('step-up token is consumed for the authenticated user, not a body-supplied userId', async () => {
    mockConsumeStepUpToken.mockResolvedValue(undefined as never)
    vi.mocked(prisma.user.delete).mockResolvedValue({} as never)

    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({ stepUpToken: 'tok', userId: 'victim-user-id' }),
      headers: { 'content-type': 'application/json' },
    })

    await deleteAccount(req)
    expect(mockConsumeStepUpToken).toHaveBeenCalledWith('user-attacker', 'tok', 'delete_account')
  })
})

// ─── IDOR: Change password ────────────────────────────────────────────────────

describe('IDOR: change password', () => {
  it('looks up and updates the authenticated user\'s password, ignoring body userId', async () => {
    mockConsumeStepUpToken.mockResolvedValue(undefined as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: '$2b$10$hash' } as never)
    vi.mocked(prisma.user.update).mockResolvedValue({} as never)
    mockVerifyPassword.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    mockHashPassword.mockResolvedValue('new-hash' as never)
    mockRevokeOtherSessions.mockResolvedValue(0 as never)

    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123',
        stepUpToken: 'valid-token',
        userId: 'victim-user-id',
      }),
      headers: { 'content-type': 'application/json' },
    })

    const res = await changePassword(req)
    expect(res.status).toBe(200)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-attacker' },
      select: { passwordHash: true },
    })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-attacker' },
      data: { passwordHash: 'new-hash' },
    })
  })
})

// ─── Unauthenticated access ───────────────────────────────────────────────────

describe('Unauthenticated access to protected endpoints', () => {
  beforeEach(() => {
    mockRequireContext.mockRejectedValue(
      new AppError('UNAUTHORIZED', 'Authentication required.', 401)
    )
  })

  it('rejects unauthenticated session revoke with 401', async () => {
    const res = await revokeSession(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'some-session' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated account deletion with 401', async () => {
    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({ stepUpToken: 'x' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await deleteAccount(req)
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated change-password with 401', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'x', newPassword: 'y', stepUpToken: 'z' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await changePassword(req)
    expect(res.status).toBe(401)
  })
})

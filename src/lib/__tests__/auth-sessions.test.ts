import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/mailer', () => ({
  sendNewDeviceLoginEmail: vi.fn(),
  sendSuspiciousActivityEmail: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/app-errors'
import {
  validateSessionToken,
  requireSessionToken,
  rotateSessionToken,
  revokeSessionById,
  revokeSessionByToken,
  revokeOtherSessions,
  listActiveSessions,
} from '../auth-sessions'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockSession = vi.mocked(prisma.session)

// Tokens used in tests — we compute their sha256 hashes so mocks can match
const RAW_TOKEN = 'raw-session-token-for-testing'
const RAW_TOKEN_HASH = crypto.createHash('sha256').update(RAW_TOKEN).digest('hex')

const OLD_RAW_TOKEN = 'old-raw-session-token'
const OLD_TOKEN_HASH = crypto.createHash('sha256').update(OLD_RAW_TOKEN).digest('hex')

const now = new Date()
const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
const past = new Date(now.getTime() - 1000)
const recentActiveAt = new Date(now.getTime() - 60_000) // 1 min ago — within the 5-min update threshold
const staleActiveAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000) // 8 days ago — past inactivity timeout

function makeFullSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    tokenHash: RAW_TOKEN_HASH,
    previousTokenHash: null,
    deviceName: 'Desktop · macOS',
    deviceType: 'desktop',
    browser: 'Chrome',
    os: 'macOS',
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    deviceFingerprint: 'fp-abc',
    isNewDevice: false,
    remember: false,
    lastActiveAt: recentActiveAt,
    expiresAt: future,
    revokedAt: null,
    rotatedAt: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    user: {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      isAdmin: false,
      manualReviewMode: false,
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// validateSessionToken
// ---------------------------------------------------------------------------

describe('validateSessionToken', () => {
  it('returns null for a null token', async () => {
    expect(await validateSessionToken(null)).toBeNull()
  })

  it('returns null when no matching session exists', async () => {
    mockSession.findFirst.mockResolvedValue(null)
    expect(await validateSessionToken('nonexistent-token')).toBeNull()
  })

  it('returns null for a revoked session', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession({ revokedAt: past }))
    expect(await validateSessionToken(RAW_TOKEN)).toBeNull()
  })

  it('returns a SessionContext for a valid session', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession())
    const ctx = await validateSessionToken(RAW_TOKEN)
    expect(ctx).not.toBeNull()
    expect(ctx?.user.email).toBe('test@example.com')
    expect(ctx?.session.id).toBe('session-1')
  })
})

// ---------------------------------------------------------------------------
// requireSessionToken
// ---------------------------------------------------------------------------

describe('requireSessionToken', () => {
  it('throws UNAUTHORIZED for a null token', async () => {
    await expect(requireSessionToken(null)).rejects.toThrow(AppError)
    await expect(requireSessionToken(null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('throws UNAUTHORIZED when no matching session exists', async () => {
    mockSession.findFirst.mockResolvedValue(null)
    await expect(requireSessionToken('bad-token')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('throws SESSION_REVOKED for a session with revokedAt set', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession({ revokedAt: past }))
    mockSession.update.mockResolvedValue({})
    await expect(requireSessionToken(RAW_TOKEN)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
  })

  it('throws SESSION_REVOKED for a session with revoked status', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession({ status: 'revoked' }))
    await expect(requireSessionToken(RAW_TOKEN)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
  })

  it('throws SESSION_EXPIRED when expiresAt is in the past', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession({ expiresAt: past }))
    mockSession.update.mockResolvedValue({})
    await expect(requireSessionToken(RAW_TOKEN)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
  })

  it('throws SESSION_INACTIVE_EXPIRED when lastActiveAt is beyond the inactivity timeout', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession({ lastActiveAt: staleActiveAt }))
    mockSession.update.mockResolvedValue({})
    await expect(requireSessionToken(RAW_TOKEN)).rejects.toMatchObject({ code: 'SESSION_INACTIVE_EXPIRED' })
  })

  it('returns a SessionContext for a fully valid session', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession())
    const ctx = await requireSessionToken(RAW_TOKEN)
    expect(ctx.session.id).toBe('session-1')
    expect(ctx.session.userId).toBe('user-1')
    expect(ctx.user.email).toBe('test@example.com')
    expect(ctx.user.name).toBe('Test User')
    expect(ctx.user.isAdmin).toBe(false)
  })

  it('updates lastActiveAt when the session has not been updated recently', async () => {
    const oldActiveAt = new Date(now.getTime() - 10 * 60 * 1000) // 10 min ago
    mockSession.findFirst.mockResolvedValue(makeFullSession({ lastActiveAt: oldActiveAt }))
    const updatedAt = new Date()
    mockSession.update.mockResolvedValue({ lastActiveAt: updatedAt, updatedAt })
    const ctx = await requireSessionToken(RAW_TOKEN)
    expect(mockSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'session-1' } })
    )
    expect(ctx).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// rotateSessionToken
// ---------------------------------------------------------------------------

describe('rotateSessionToken', () => {
  it('returns null when no session matches the token', async () => {
    mockSession.findUnique.mockResolvedValue(null)
    mockSession.findFirst.mockResolvedValue(null)
    expect(await rotateSessionToken('unknown-token')).toBeNull()
  })

  it('returns null for an expired session', async () => {
    mockSession.findUnique.mockResolvedValue({
      id: 'session-1',
      status: 'active',
      expiresAt: past,
      revokedAt: null,
    })
    expect(await rotateSessionToken(OLD_RAW_TOKEN)).toBeNull()
  })

  it('returns null for a revoked session', async () => {
    mockSession.findUnique.mockResolvedValue({
      id: 'session-1',
      status: 'active',
      expiresAt: future,
      revokedAt: past,
    })
    expect(await rotateSessionToken(OLD_RAW_TOKEN)).toBeNull()
  })

  it('returns a new raw token for a valid session', async () => {
    mockSession.findUnique.mockResolvedValue({
      id: 'session-1',
      status: 'active',
      expiresAt: future,
      revokedAt: null,
    })
    mockSession.update.mockResolvedValue({})
    const result = await rotateSessionToken(OLD_RAW_TOKEN)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('newRawToken')
    expect(typeof result?.newRawToken).toBe('string')
    expect(result?.newRawToken.length).toBeGreaterThan(0)
  })

  it('calls update with the new hash and old hash as previousTokenHash', async () => {
    mockSession.findUnique.mockResolvedValue({
      id: 'session-1',
      status: 'active',
      expiresAt: future,
      revokedAt: null,
    })
    mockSession.update.mockResolvedValue({})
    await rotateSessionToken(OLD_RAW_TOKEN)
    expect(mockSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: OLD_TOKEN_HASH },
        data: expect.objectContaining({ previousTokenHash: OLD_TOKEN_HASH }),
      })
    )
  })

  it('returns null when update throws (concurrent rotation race)', async () => {
    mockSession.findUnique.mockResolvedValue({
      id: 'session-1',
      status: 'active',
      expiresAt: future,
      revokedAt: null,
    })
    mockSession.update.mockRejectedValue(new Error('P2025'))
    expect(await rotateSessionToken(OLD_RAW_TOKEN)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// revokeSessionById
// ---------------------------------------------------------------------------

describe('revokeSessionById', () => {
  it('returns true when a session was revoked', async () => {
    mockSession.updateMany.mockResolvedValue({ count: 1 })
    expect(await revokeSessionById('session-1', 'user-1')).toBe(true)
  })

  it('returns false when no session matched', async () => {
    mockSession.updateMany.mockResolvedValue({ count: 0 })
    expect(await revokeSessionById('session-999', 'user-1')).toBe(false)
  })

  it('passes the correct userId and sessionId filter', async () => {
    mockSession.updateMany.mockResolvedValue({ count: 1 })
    await revokeSessionById('session-1', 'user-1')
    expect(mockSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'session-1', userId: 'user-1' }),
        data: expect.objectContaining({ status: 'revoked' }),
      })
    )
  })
})

// ---------------------------------------------------------------------------
// revokeSessionByToken
// ---------------------------------------------------------------------------

describe('revokeSessionByToken', () => {
  it('returns false for a null token without hitting the db', async () => {
    expect(await revokeSessionByToken(null)).toBe(false)
    expect(mockSession.updateMany).not.toHaveBeenCalled()
  })

  it('returns true when a session was revoked', async () => {
    mockSession.updateMany.mockResolvedValue({ count: 1 })
    expect(await revokeSessionByToken(RAW_TOKEN)).toBe(true)
  })

  it('returns false when no session matched', async () => {
    mockSession.updateMany.mockResolvedValue({ count: 0 })
    expect(await revokeSessionByToken(RAW_TOKEN)).toBe(false)
  })

  it('uses the token hash (not raw token) in the db filter', async () => {
    mockSession.updateMany.mockResolvedValue({ count: 1 })
    await revokeSessionByToken(RAW_TOKEN)
    expect(mockSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tokenHash: RAW_TOKEN_HASH }),
      })
    )
  })
})

// ---------------------------------------------------------------------------
// revokeOtherSessions
// ---------------------------------------------------------------------------

describe('revokeOtherSessions', () => {
  it('returns the count of revoked sessions', async () => {
    mockSession.updateMany.mockResolvedValue({ count: 2 })
    expect(await revokeOtherSessions('user-1', 'current-session-id')).toBe(2)
  })

  it('excludes the current session from revocation', async () => {
    mockSession.updateMany.mockResolvedValue({ count: 1 })
    await revokeOtherSessions('user-1', 'keep-this-session')
    expect(mockSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          id: { not: 'keep-this-session' },
        }),
      })
    )
  })
})

// ---------------------------------------------------------------------------
// listActiveSessions
// ---------------------------------------------------------------------------

describe('listActiveSessions', () => {
  it('expires stale sessions then returns active ones', async () => {
    const activeSessions = [
      { id: 'session-1', deviceName: 'Desktop · macOS', deviceType: 'desktop', browser: 'Chrome', os: 'macOS', ipAddress: '127.0.0.1', userAgent: 'Mozilla', isNewDevice: false, lastActiveAt: recentActiveAt, expiresAt: future, createdAt: now },
    ]
    mockSession.updateMany.mockResolvedValue({ count: 0 })
    mockSession.findMany.mockResolvedValue(activeSessions)
    const result = await listActiveSessions('user-1')
    expect(mockSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired' } })
    )
    expect(result).toEqual(activeSessions)
  })
})

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
  createUserSession,
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
// createUserSession
// ---------------------------------------------------------------------------

describe('createUserSession', () => {
  function requestWithUa(ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0') {
    return new Request('http://localhost/api/auth/login', {
      headers: { 'user-agent': ua, 'x-real-ip': '127.0.0.1' },
    })
  }

  function mockTransaction(activeSessions: unknown[] = []) {
    const tx = {
      session: {
        findMany: vi.fn().mockResolvedValue(activeSessions),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockImplementation(async ({ data }) => ({
          id: 'new-session',
          createdAt: now,
          ...data,
        })),
      },
    }
    vi.mocked(prisma.$transaction).mockImplementation(async (cb) => cb(tx as never) as never)
    return tx
  }

  it('revokes older active sessions for the same browser/device before creating a new one', async () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0'
    const existing = makeFullSession({
      id: 'old-same-device',
      userAgent: ua,
      deviceName: 'Desktop · macOS',
      deviceType: 'desktop',
      browser: 'Chrome',
      os: 'macOS',
      deviceFingerprint: crypto.createHash('sha256').update([
        'Desktop · macOS',
        'desktop',
        'Chrome',
        'macOS',
        ua.toLowerCase(),
      ].join('|').toLowerCase()).digest('hex'),
    })
    const tx = mockTransaction([existing])

    await createUserSession({ userId: 'user-1', userEmail: 'test@example.com', request: requestWithUa(ua) })

    expect(tx.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['old-same-device'] } },
        data: expect.objectContaining({ status: 'revoked' }),
      })
    )
    expect(tx.session.create).toHaveBeenCalled()
  })

  it('sets expiresAt ~30 days out when remember is true', async () => {
    const tx = mockTransaction([])
    const before = Date.now()

    await createUserSession({
      userId: 'user-1',
      userEmail: 'test@example.com',
      remember: true,
      request: requestWithUa(),
    })

    const createArg = tx.session.create.mock.calls[0][0] as { data: { expiresAt: Date; remember: boolean } }
    const ttlMs = createArg.data.expiresAt.getTime() - before
    expect(createArg.data.remember).toBe(true)
    // 30 days ± 5 second tolerance for test execution time
    expect(ttlMs).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 5000)
    expect(ttlMs).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 5000)
  })

  it('sets expiresAt ~24 hours out when remember is false', async () => {
    const tx = mockTransaction([])
    const before = Date.now()

    await createUserSession({
      userId: 'user-1',
      userEmail: 'test@example.com',
      remember: false,
      request: requestWithUa(),
    })

    const createArg = tx.session.create.mock.calls[0][0] as { data: { expiresAt: Date; remember: boolean } }
    const ttlMs = createArg.data.expiresAt.getTime() - before
    expect(createArg.data.remember).toBe(false)
    // 24 hours ± 5 second tolerance
    expect(ttlMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 5000)
    expect(ttlMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000)
  })

  it('blocks a fourth distinct browser/device without creating a session', async () => {
    const devices = ['a', 'b', 'c'].map((suffix) => makeFullSession({
      id: `session-${suffix}`,
      deviceFingerprint: `fp-${suffix}`,
      userAgent: `ua-${suffix}`,
      lastActiveAt: new Date(now.getTime() - suffix.charCodeAt(0) * 1000),
    }))
    const tx = mockTransaction(devices)

    await expect(createUserSession({
      userId: 'user-1',
      userEmail: 'test@example.com',
      request: requestWithUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120.0'),
    })).rejects.toMatchObject({ code: 'DEVICE_LIMIT_REACHED' })

    expect(tx.session.create).not.toHaveBeenCalled()
  })
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
    mockSession.update.mockResolvedValue({} as never)
    await expect(requireSessionToken(RAW_TOKEN)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
  })

  it('throws SESSION_REVOKED for a session with revoked status', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession({ status: 'revoked' }))
    await expect(requireSessionToken(RAW_TOKEN)).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
  })

  it('throws SESSION_EXPIRED when expiresAt is in the past', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession({ expiresAt: past }))
    mockSession.update.mockResolvedValue({} as never)
    await expect(requireSessionToken(RAW_TOKEN)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
  })

  it('throws SESSION_INACTIVE_EXPIRED when lastActiveAt is beyond the inactivity timeout', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession({ lastActiveAt: staleActiveAt }))
    mockSession.update.mockResolvedValue({} as never)
    await expect(requireSessionToken(RAW_TOKEN)).rejects.toMatchObject({ code: 'SESSION_INACTIVE_EXPIRED' })
  })

  it('tolerates 20-day inactivity for a remember=true session (within 30-day window)', async () => {
    const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
    mockSession.findFirst.mockResolvedValue(
      makeFullSession({ remember: true, lastActiveAt: twentyDaysAgo })
    )
    const updatedAt = new Date()
    mockSession.update.mockResolvedValue({ lastActiveAt: updatedAt, updatedAt } as never)
    const ctx = await requireSessionToken(RAW_TOKEN)
    expect(ctx.session.remember).toBe(true)
  })

  it('throws SESSION_INACTIVE_EXPIRED for a remember=true session past 30-day inactivity', async () => {
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)
    mockSession.findFirst.mockResolvedValue(
      makeFullSession({ remember: true, lastActiveAt: thirtyOneDaysAgo })
    )
    mockSession.update.mockResolvedValue({} as never)
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
    mockSession.update.mockResolvedValue({ lastActiveAt: updatedAt, updatedAt } as never)
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
    } as never)
    expect(await rotateSessionToken(OLD_RAW_TOKEN)).toBeNull()
  })

  it('returns null for a revoked session', async () => {
    mockSession.findUnique.mockResolvedValue({
      id: 'session-1',
      status: 'active',
      expiresAt: future,
      revokedAt: past,
    } as never)
    expect(await rotateSessionToken(OLD_RAW_TOKEN)).toBeNull()
  })

  it('returns a new raw token for a valid session', async () => {
    mockSession.findUnique.mockResolvedValue({
      id: 'session-1',
      status: 'active',
      expiresAt: future,
      revokedAt: null,
    } as never)
    mockSession.update.mockResolvedValue({} as never)
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
    } as never)
    mockSession.update.mockResolvedValue({} as never)
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
    } as never)
    mockSession.update.mockRejectedValue(new Error('P2025'))
    expect(await rotateSessionToken(OLD_RAW_TOKEN)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// revokeSessionById
// ---------------------------------------------------------------------------

describe('revokeSessionById', () => {
  it('returns true when a session was revoked', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession({ id: 'session-1' }))
    mockSession.updateMany.mockResolvedValue({ count: 1 })
    expect(await revokeSessionById('session-1', 'user-1')).toBe(true)
  })

  it('returns false when no session matched', async () => {
    mockSession.findFirst.mockResolvedValue(null)
    expect(await revokeSessionById('session-999', 'user-1')).toBe(false)
  })

  it('passes the correct userId and sessionId filter', async () => {
    mockSession.findFirst.mockResolvedValue(makeFullSession({ id: 'session-1', deviceFingerprint: 'fp-1' }))
    mockSession.updateMany.mockResolvedValue({ count: 1 })
    await revokeSessionById('session-1', 'user-1')
    expect(mockSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'session-1', userId: 'user-1' }),
      })
    )
    expect(mockSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', deviceFingerprint: 'fp-1' }),
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
    mockSession.findMany.mockResolvedValue(activeSessions as never)
    const result = await listActiveSessions('user-1')
    expect(mockSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired' } })
    )
    expect(result).toEqual(activeSessions)
  })
})

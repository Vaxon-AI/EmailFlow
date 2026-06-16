import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'

const mockCookieStore = {
  set: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}))

import {
  COOKIE_NAME,
  SESSION_MAX_AGE_REMEMBER_SECONDS,
  clearSessionCookie,
  createOAuthStateToken,
  createToken,
  getSessionToken,
  setSessionCookie,
  verifyOAuthStateToken,
  verifyToken,
} from '../auth-token'

describe('createToken / verifyToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('round-trips a minimal payload', () => {
    const token = createToken({ userId: 'user-123' })
    const payload = verifyToken(token)
    expect(payload?.userId).toBe('user-123')
  })

  it('includes optional purpose and remember fields', () => {
    const token = createToken({ userId: 'u1', purpose: 'pre-2fa', remember: true })
    const payload = verifyToken(token)
    expect(payload?.purpose).toBe('pre-2fa')
    expect(payload?.remember).toBe(true)
  })

  it('returns null for a garbage token', () => {
    expect(verifyToken('not-a-token')).toBeNull()
  })

  it('returns null for a token signed with a different secret', () => {
    const token = jwt.sign({ userId: 'u1' }, 'wrong-secret')
    expect(verifyToken(token)).toBeNull()
  })

  it('returns null for an already-expired token', () => {
    // expiresIn: 0 means exp === iat, which is immediately expired
    const token = createToken({ userId: 'u1' }, 0)
    expect(verifyToken(token)).toBeNull()
  })
})

describe('createOAuthStateToken / verifyOAuthStateToken', () => {
  it('round-trips remember=true', () => {
    const state = createOAuthStateToken(true)
    expect(verifyOAuthStateToken(state)).toEqual({ remember: true })
  })

  it('round-trips remember=false', () => {
    const state = createOAuthStateToken(false)
    expect(verifyOAuthStateToken(state)).toEqual({ remember: false })
  })

  it('produces a distinct token each call (random nonce)', () => {
    expect(createOAuthStateToken(true)).not.toBe(createOAuthStateToken(true))
  })

  it('returns null for a missing state', () => {
    expect(verifyOAuthStateToken(null)).toBeNull()
  })

  it('returns null for a tampered / forged state', () => {
    const forged = jwt.sign({ remember: true, nonce: 'x' }, 'wrong-secret')
    expect(verifyOAuthStateToken(forged)).toBeNull()
    expect(verifyOAuthStateToken('garbage')).toBeNull()
  })
})

describe('COOKIE_NAME', () => {
  it('is defined', () => {
    expect(COOKIE_NAME).toBe('ef-session')
  })
})

describe('session cookie helpers', () => {
  const env = process.env as Record<string, string | undefined>
  const originalNodeEnv = env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
    env.NODE_ENV = 'test'
    mockCookieStore.get.mockReturnValue(undefined)
  })

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv
  })

  it('sets a session cookie without remember-me fields by default', async () => {
    await setSessionCookie('token-123')

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      COOKIE_NAME,
      'token-123',
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      }),
    )

    const options = mockCookieStore.set.mock.calls[0][2]
    expect(options.maxAge).toBeUndefined()
    expect(options.expires).toBeUndefined()
  })

  it('sets remember-me expiry fields when requested', async () => {
    await setSessionCookie('token-123', true)

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      COOKIE_NAME,
      'token-123',
      expect.objectContaining({
        maxAge: SESSION_MAX_AGE_REMEMBER_SECONDS,
        expires: expect.any(Date),
      }),
    )
  })

  it('uses secure cookies in production', async () => {
    env.NODE_ENV = 'production'

    await setSessionCookie('token-123')

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      COOKIE_NAME,
      'token-123',
      expect.objectContaining({ secure: true }),
    )
  })

  it('clears the session cookie by name', async () => {
    await clearSessionCookie()
    expect(mockCookieStore.delete).toHaveBeenCalledWith(COOKIE_NAME)
  })

  it('returns the stored session token value when present', async () => {
    mockCookieStore.get.mockReturnValue({ value: 'stored-token' })
    await expect(getSessionToken()).resolves.toBe('stored-token')
  })

  it('returns null when the session cookie is absent', async () => {
    mockCookieStore.get.mockReturnValue(undefined)
    await expect(getSessionToken()).resolves.toBeNull()
  })
})

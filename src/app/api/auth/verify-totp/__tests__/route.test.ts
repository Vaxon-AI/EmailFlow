import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('otplib', () => ({
  verify: vi.fn(),
}))

vi.mock('@/lib/auth-token', () => ({
  verifyToken: vi.fn(),
  setSessionCookie: vi.fn().mockResolvedValue(undefined),
  createToken: vi.fn().mockReturnValue('mock-device-limit-token'),
}))

vi.mock('@/lib/auth-sessions', () => ({
  createUserSession: vi.fn(),
}))

vi.mock('@/repositories/user-repo', () => ({
  findForTotpVerify: vi.fn(),
}))

import { verify } from 'otplib'
import { verifyToken, setSessionCookie } from '@/lib/auth-token'
import { createUserSession } from '@/lib/auth-sessions'
import { findForTotpVerify } from '@/repositories/user-repo'
import { AppError } from '@/lib/app-errors'
import { POST } from '../route'

const mockVerify = vi.mocked(verify)
const mockVerifyToken = vi.mocked(verifyToken)
const mockSetSessionCookie = vi.mocked(setSessionCookie)
const mockCreateUserSession = vi.mocked(createUserSession)
const mockFindForTotpVerify = vi.mocked(findForTotpVerify)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/auth/verify-totp', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const STORED_USER = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  isAdmin: false,
  totpEnabled: true,
  totpSecret: 'SECRET',
}

describe('POST /api/auth/verify-totp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when tempToken is missing', async () => {
    const res = await POST(postRequest({ totpCode: '123456' }))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('returns 400 when totpCode is missing', async () => {
    const res = await POST(postRequest({ tempToken: 'temp-token' }))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('returns 401 when the verification token is invalid', async () => {
    mockVerifyToken.mockReturnValue(null)

    const res = await POST(postRequest({ tempToken: 'bad-token', totpCode: '123456' }))

    expect(res.status).toBe(401)
    expect((await res.json()).success).toBe(false)
  })

  it('returns user data and session when the TOTP code is correct', async () => {
    mockVerifyToken.mockReturnValue({ userId: 'user-1', purpose: 'pre-2fa', remember: true } as never)
    mockFindForTotpVerify.mockResolvedValue(STORED_USER as never)
    mockVerify.mockResolvedValue({ valid: true } as never)
    mockCreateUserSession.mockResolvedValue({ rawToken: 'tok', isNewDevice: false } as never)

    const res = await POST(postRequest({ tempToken: 'temp-token', totpCode: '123456' }))

    expect(mockSetSessionCookie).toHaveBeenCalledWith('tok', true)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.isNewDevice).toBe(false)
    expect(body.data.email).toBe('alice@example.com')
    expect(body.data.isAdmin).toBe(false)
  })

  it('returns 409 with device choices when the browser/device limit is reached', async () => {
    mockVerifyToken.mockReturnValue({ userId: 'user-1', purpose: 'pre-2fa', remember: false } as never)
    mockFindForTotpVerify.mockResolvedValue(STORED_USER as never)
    mockVerify.mockResolvedValue({ valid: true } as never)
    mockCreateUserSession.mockRejectedValue(new AppError(
      'DEVICE_LIMIT_REACHED',
      'Device limit reached',
      409,
      {
        userId: 'user-1',
        remember: false,
        devices: [{ id: 'session-1', deviceName: 'Desktop · macOS' }],
      },
    ))

    const res = await POST(postRequest({ tempToken: 'temp-token', totpCode: '123456' }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('DEVICE_LIMIT_REACHED')
    expect(body.deviceLimitToken).toBe('mock-device-limit-token')
    expect(body.data.devices).toHaveLength(1)
  })
})

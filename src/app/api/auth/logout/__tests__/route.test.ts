import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-token', () => ({
  getSessionToken: vi.fn(),
  clearSessionCookie: vi.fn(),
}))

vi.mock('@/lib/auth-sessions', () => ({
  revokeSessionByToken: vi.fn(),
}))

import { getSessionToken, clearSessionCookie } from '@/lib/auth-token'
import { revokeSessionByToken } from '@/lib/auth-sessions'
import { POST } from '../route'

const mockGetSessionToken = vi.mocked(getSessionToken)
const mockRevokeSessionByToken = vi.mocked(revokeSessionByToken)
const mockClearSessionCookie = vi.mocked(clearSessionCookie)

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('revokes session and clears cookie then returns success', async () => {
    mockGetSessionToken.mockResolvedValue('tok123')
    mockRevokeSessionByToken.mockResolvedValue(undefined as never)
    mockClearSessionCookie.mockResolvedValue(undefined as never)

    const res = await POST()

    expect(mockRevokeSessionByToken).toHaveBeenCalledWith('tok123')
    expect(mockClearSessionCookie).toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('returns success even when revocation throws', async () => {
    mockGetSessionToken.mockRejectedValue(new Error('no token'))

    const res = await POST()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})

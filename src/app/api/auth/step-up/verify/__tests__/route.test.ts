import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-sessions', () => ({
  requireCurrentUser: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual }
})

vi.mock('@/lib/step-up-auth', () => ({
  verifyStepUp: vi.fn(),
}))

import { requireCurrentUser } from '@/lib/auth-sessions'
import { verifyStepUp } from '@/lib/step-up-auth'
import { POST } from '../route'

const mockRequireCurrentUser = vi.mocked(requireCurrentUser)
const mockVerifyStepUp = vi.mocked(verifyStepUp)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/auth/step-up/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/auth/step-up/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireCurrentUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 400 for invalid action', async () => {
    const res = await POST(postRequest({ action: 'invalid', code: '123456' }))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('returns 400 when code is missing', async () => {
    const res = await POST(postRequest({ action: 'change_password' }))
    expect(res.status).toBe(400)
  })

  it('verifies code and returns step-up token', async () => {
    mockVerifyStepUp.mockResolvedValue('stepup-tok-abc' as never)

    const res = await POST(postRequest({ action: 'change_password', code: '123456' }))

    expect(mockVerifyStepUp).toHaveBeenCalledWith('user-1', '123456', 'change_password')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.stepUpToken).toBe('stepup-tok-abc')
  })

  it('trims whitespace from code before verifying', async () => {
    mockVerifyStepUp.mockResolvedValue('stepup-tok' as never)

    await POST(postRequest({ action: 'disable_totp', code: '  654321  ' }))

    expect(mockVerifyStepUp).toHaveBeenCalledWith('user-1', '654321', 'disable_totp')
  })
})

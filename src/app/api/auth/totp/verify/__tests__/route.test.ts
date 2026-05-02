import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('otplib', () => ({
  verify: vi.fn(),
}))

import { verify } from 'otplib'
import { POST } from '../route'

const mockVerify = vi.mocked(verify)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/auth/totp/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/auth/totp/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when token is missing', async () => {
    const res = await POST(postRequest({ secret: 'SECRET' }))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('returns 400 when secret is missing', async () => {
    const res = await POST(postRequest({ token: '123456' }))
    expect(res.status).toBe(400)
  })

  it('returns isValid true when code is correct', async () => {
    mockVerify.mockResolvedValue({ valid: true } as never)

    const res = await POST(postRequest({ token: '123456', secret: 'JBSWY3DPEHPK3PXP' }))

    expect(mockVerify).toHaveBeenCalledWith({ token: '123456', secret: 'JBSWY3DPEHPK3PXP' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.isValid).toBe(true)
  })

  it('returns isValid false when code is wrong', async () => {
    mockVerify.mockResolvedValue({ valid: false } as never)

    const res = await POST(postRequest({ token: '000000', secret: 'JBSWY3DPEHPK3PXP' }))

    expect((await res.json()).data.isValid).toBe(false)
  })
})

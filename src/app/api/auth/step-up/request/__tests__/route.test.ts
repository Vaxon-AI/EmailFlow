import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-session', () => ({
  requireCurrentUser: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual }
})

vi.mock('@/lib/step-up-auth', () => ({
  requestStepUp: vi.fn(),
}))

import { requireCurrentUser } from '@/lib/auth-session'
import { requestStepUp } from '@/lib/step-up-auth'
import { POST } from '../route'

const mockRequireCurrentUser = vi.mocked(requireCurrentUser)
const mockRequestStepUp = vi.mocked(requestStepUp)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/auth/step-up/request', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/auth/step-up/request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireCurrentUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 400 for invalid action', async () => {
    const res = await POST(postRequest({ action: 'hack_account' }))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('returns 400 when action is missing', async () => {
    const res = await POST(postRequest({}))
    expect(res.status).toBe(400)
  })

  it('initiates step-up and returns method for change_password', async () => {
    mockRequestStepUp.mockResolvedValue({ method: 'totp' } as never)

    const res = await POST(postRequest({ action: 'change_password' }))

    expect(mockRequestStepUp).toHaveBeenCalledWith('user-1', 'change_password')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.method).toBe('totp')
  })

  it('initiates step-up and returns email method for disable_totp', async () => {
    mockRequestStepUp.mockResolvedValue({ method: 'email' } as never)

    const res = await POST(postRequest({ action: 'disable_totp' }))

    expect(res.status).toBe(200)
    expect((await res.json()).data.method).toBe('email')
  })
})

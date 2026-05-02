import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

vi.mock('@/services/retention-service', () => ({
  restoreEmail: vi.fn(),
}))

import { getAuthUser } from '@/lib/api-helpers'
import { restoreEmail } from '@/services/retention-service'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockRestoreEmail = vi.mocked(restoreEmail)

describe('POST /api/emails/[id]/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('restores email and returns success', async () => {
    mockRestoreEmail.mockResolvedValue({ success: true, emailId: 'email-1' } as never)

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(mockRestoreEmail).toHaveBeenCalledWith('user-1', 'email-1')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.restored).toBe(true)
    expect(body.data.emailId).toBe('email-1')
  })

  it('returns 400 when restore service fails', async () => {
    mockRestoreEmail.mockResolvedValue({ success: false, reason: 'Restore window expired' } as never)

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'email-1' }),
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error.message).toBe('Restore window expired')
  })
})

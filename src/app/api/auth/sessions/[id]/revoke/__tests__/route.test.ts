import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual }
})

vi.mock('@/lib/auth-sessions', () => ({
  requireCurrentSessionContext: vi.fn(),
  revokeSessionById: vi.fn(),
}))

import { requireCurrentSessionContext } from '@/lib/auth-sessions'
import { revokeSessionById } from '@/lib/auth-sessions'
import { POST } from '../route'

const mockRequireContext = vi.mocked(requireCurrentSessionContext)
const mockRevokeSessionById = vi.mocked(revokeSessionById)

describe('POST /api/auth/sessions/[id]/revoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireContext.mockResolvedValue({
      user: { id: 'user-1' },
      session: { id: 'session-1' },
    } as never)
  })

  it('revokes the session and returns success', async () => {
    mockRevokeSessionById.mockResolvedValue(true as never)

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'session-other' }),
    })

    expect(mockRevokeSessionById).toHaveBeenCalledWith('session-other', 'user-1')
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  it('returns 404 when session does not belong to user', async () => {
    mockRevokeSessionById.mockResolvedValue(false as never)

    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'session-404' }),
    })

    expect(res.status).toBe(404)
    expect((await res.json()).success).toBe(false)
  })
})

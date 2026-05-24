import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-sessions', () => ({
  requireCurrentUser: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
  },
}))

import { requireCurrentUser } from '@/lib/auth-sessions'
import { prisma } from '@/lib/prisma'
import { POST } from '../route'

const mockRequireCurrentUser = vi.mocked(requireCurrentUser)
const mockUserUpdate = vi.mocked(prisma.user.update)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/auth/totp/enable', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/auth/totp/enable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireCurrentUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 400 when secret is missing', async () => {
    const res = await POST(postRequest({}))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('enables TOTP and stores secret', async () => {
    mockUserUpdate.mockResolvedValue({} as never)

    const res = await POST(postRequest({ secret: 'JBSWY3DPEHPK3PXP' }))

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { totpEnabled: true, totpSecret: 'JBSWY3DPEHPK3PXP' },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })
})

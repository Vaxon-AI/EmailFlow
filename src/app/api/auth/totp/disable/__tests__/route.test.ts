import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-session', () => ({
  requireCurrentUser: vi.fn(),
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return { ...actual }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/step-up-auth', () => ({
  consumeStepUpToken: vi.fn(),
}))

import { requireCurrentUser } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'
import { consumeStepUpToken } from '@/lib/step-up-auth'
import { POST } from '../route'

const mockRequireCurrentUser = vi.mocked(requireCurrentUser)
const mockUser = vi.mocked(prisma.user)
const mockConsumeStepUpToken = vi.mocked(consumeStepUpToken)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/auth/totp/disable', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/auth/totp/disable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireCurrentUser.mockResolvedValue({ id: 'user-1' } as never)
    mockConsumeStepUpToken.mockResolvedValue(undefined as never)
  })

  it('returns 400 when stepUpToken is missing', async () => {
    const res = await POST(postRequest({}))
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('returns 400 when TOTP is not enabled', async () => {
    mockUser.findUnique.mockResolvedValue({ totpEnabled: false } as never)

    const res = await POST(postRequest({ stepUpToken: 'tok' }))

    expect(mockConsumeStepUpToken).toHaveBeenCalledWith('user-1', 'tok', 'disable_totp')
    expect(res.status).toBe(400)
    expect((await res.json()).success).toBe(false)
  })

  it('disables TOTP and clears secret when enabled', async () => {
    mockUser.findUnique.mockResolvedValue({ totpEnabled: true } as never)
    mockUser.update.mockResolvedValue({} as never)

    const res = await POST(postRequest({ stepUpToken: 'tok' }))

    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { totpEnabled: false, totpSecret: null },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })
})

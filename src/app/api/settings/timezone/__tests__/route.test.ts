import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/api-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-helpers')>()
  return {
    ...actual,
    getAuthUser: vi.fn(),
  }
})

import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/api-helpers'
import { POST } from '../route'

const mockGetAuthUser = vi.mocked(getAuthUser)
const mockUser = vi.mocked(prisma.user)

function postRequest(body: object): Request {
  return new Request('http://localhost/api/settings/timezone', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/settings/timezone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ id: 'user-1' } as never)
  })

  it('returns 400 when timezone is missing', async () => {
    const res = await POST(postRequest({}))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Missing timezone',
      },
    })
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  it('returns 400 when timezone is invalid', async () => {
    const res = await POST(postRequest({ timezone: 'Mars/Olympus' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('INVALID_TIMEZONE')
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  it('updates the user timezone', async () => {
    mockUser.update.mockResolvedValue({ id: 'user-1', timezone: 'Australia/Sydney' } as never)

    const res = await POST(postRequest({ timezone: 'Australia/Sydney' }))

    expect(res.status).toBe(200)
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { timezone: 'Australia/Sydney' },
    })
    expect(await res.json()).toEqual({
      success: true,
      data: { timezone: 'Australia/Sydney' },
      meta: undefined,
    })
  })
})
